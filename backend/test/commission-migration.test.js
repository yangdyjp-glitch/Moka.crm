const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CommissionMethod,
  CommissionStatus,
  FundSettlementMode,
  PaymentConfirmStatus,
  SettlementCondition,
} = require('@prisma/client');
const { CommissionsService } = require('../dist/commissions/commissions.service');

const confirmedAt = new Date('2026-09-07T06:03:11.434Z');
const recordUpdatedAt = '2026-09-07T06:03:12.204Z';
const firstPaymentUpdatedAt = '2026-09-07T06:03:11.434Z';
const secondPaymentUpdatedAt = '2026-09-07T06:03:12.204Z';

function commissionRecord(overrides = {}) {
  return {
    id: 21,
    commissionNo: 'FC000130',
    customerId: 154,
    orderId: 42,
    channelId: 7,
    currency: 'CNY',
    calcBaseType: '实收',
    calcBaseAmount: 11000,
    payableAmount: 1650,
    paidAmount: 0,
    unpaidAmount: 1650,
    clawbackAmount: 0,
    status: CommissionStatus.NOT_DUE,
    suspended: false,
    settlementCondition: SettlementCondition.ON_FULL_PAYMENT,
    commissionMethodSnapshot: CommissionMethod.NET_RECEIVED_RATIO,
    commissionRateSnapshot: 15,
    fundSettlementMode: FundSettlementMode.COMPANY_REBATE,
    actualSettlementAt: null,
    remark: null,
    updatedAt: new Date(recordUpdatedAt),
    customer: {
      id: 154,
      customerNo: 'KH000130',
      name: '刘善瑜',
    },
    channel: {
      settlementCondition: SettlementCondition.ON_EACH_PAYMENT,
    },
    order: {
      id: 42,
      orderNo: 'DD000130',
      payments: [
        {
          id: 57,
          paymentNo: 'SK000130',
          amount: 11000,
          confirmStatus: PaymentConfirmStatus.CONFIRMED,
          confirmedAt,
          updatedAt: new Date(firstPaymentUpdatedAt),
          remark: '首款',
          paidAt: new Date('2026-09-02T00:00:00.000Z'),
        },
        {
          id: 58,
          paymentNo: 'SK000130-02',
          amount: 11000,
          confirmStatus: PaymentConfirmStatus.PENDING,
          confirmedAt: null,
          updatedAt: new Date(secondPaymentUpdatedAt),
          remark: '尾款',
          paidAt: new Date('2026-09-02T09:47:54.154Z'),
        },
      ],
    },
    ...overrides,
  };
}

function setup(record) {
  let updated = null;
  let audited = null;
  const tx = {
    commission: {
      findFirst: async () => record,
      updateMany: async ({ data }) => {
        updated = data;
        return { count: 1 };
      },
      findUnique: async () => ({
        settlementCondition: record.settlementCondition,
      }),
    },
    auditLog: {
      create: async ({ data }) => {
        audited = data;
        return data;
      },
    },
  };
  const prisma = { $transaction: async (operation) => operation(tx) };
  const service = new CommissionsService(prisma, {}, {});
  return {
    service,
    changes: () => ({ updated, audited }),
  };
}

test('migrates an old full-payment commission into per-payment rows', async () => {
  const { service, changes } = setup(commissionRecord());
  const request = {
    expectedCustomerNo: 'KH000130',
    expectedOrderNo: 'DD000130',
    reason: '渠道规则调整为每笔到账后',
  };
  const preview = await service.migrateToEachPayment(
    { id: 1 },
    21,
    { ...request, confirm: false },
  );
  const result = await service.migrateToEachPayment(
    { id: 1 },
    21,
    {
      ...request,
      confirm: true,
      previewFingerprint: preview.previewFingerprint,
    },
  );
  const { updated, audited } = changes();

  assert.equal(result.migrated, true);
  assert.equal(result.payableAmount, 3300);
  assert.equal(result.paidAmount, 0);
  assert.equal(result.unpaidAmount, 3300);
  assert.equal(result.status, CommissionStatus.PENDING_REVIEW);
  assert.deepEqual(
    result.installments.map((item) => ({
      paymentId: item.paymentId,
      payableAmount: item.payableAmount,
      status: item.status,
    })),
    [
      {
        paymentId: 57,
        payableAmount: 1650,
        status: CommissionStatus.PENDING_REVIEW,
      },
      {
        paymentId: 58,
        payableAmount: 1650,
        status: CommissionStatus.NOT_DUE,
      },
    ],
  );
  assert.equal(updated.settlementCondition, SettlementCondition.ON_EACH_PAYMENT);
  assert.equal(updated.calcBaseType, '每笔实收');
  assert.equal(updated.status, CommissionStatus.PENDING_REVIEW);
  assert.equal(updated.expectedSettlementAt, confirmedAt);
  assert.equal(Object.hasOwn(updated, 'paidAmount'), false);
  assert.equal(audited.operatorId, 1);
  assert.equal(audited.action, 'MIGRATE_COMMISSION_TO_EACH_PAYMENT');
});

test('keeps the operation idempotent without duplicating the audit log', async () => {
  const record = commissionRecord({
    settlementCondition: SettlementCondition.ON_EACH_PAYMENT,
    calcBaseType: '每笔实收',
    calcBaseAmount: 22000,
    payableAmount: 3300,
    unpaidAmount: 3300,
    status: CommissionStatus.PENDING_REVIEW,
  });
  const { service, changes } = setup(record);
  const result = await service.migrateToEachPayment(
    { id: 1 },
    21,
    {
      expectedCustomerNo: 'KH000130',
      expectedOrderNo: 'DD000130',
      reason: '安全重试',
      confirm: true,
    },
  );

  assert.equal(result.migrated, false);
  assert.deepEqual(changes(), { updated: null, audited: null });
});

test('preserves an existing paid amount and reopens only the later due row', async () => {
  const secondConfirmedAt = new Date('2026-09-10T03:00:00.000Z');
  const base = commissionRecord();
  const record = commissionRecord({
    paidAmount: 1650,
    unpaidAmount: 0,
    status: CommissionStatus.PAID,
    actualSettlementAt: new Date('2026-09-08T03:00:00.000Z'),
    order: {
      ...base.order,
      payments: base.order.payments.map((payment) =>
        payment.id === 58
          ? {
              ...payment,
              confirmStatus: PaymentConfirmStatus.CONFIRMED,
              confirmedAt: secondConfirmedAt,
            }
          : payment,
      ),
    },
  });
  const { service, changes } = setup(record);
  const request = {
    expectedCustomerNo: 'KH000130',
    expectedOrderNo: 'DD000130',
    reason: '将旧订单改为逐笔返佣',
  };
  const preview = await service.migrateToEachPayment(
    { id: 1 },
    21,
    { ...request, confirm: false },
  );
  const result = await service.migrateToEachPayment(
    { id: 1 },
    21,
    {
      ...request,
      confirm: true,
      previewFingerprint: preview.previewFingerprint,
    },
  );
  const { updated } = changes();

  assert.equal(result.paidAmount, 1650);
  assert.equal(result.unpaidAmount, 1650);
  assert.equal(result.status, CommissionStatus.PENDING_REVIEW);
  assert.equal(result.installments[0].status, CommissionStatus.PAID);
  assert.equal(result.installments[1].status, CommissionStatus.PENDING_REVIEW);
  assert.equal(Object.hasOwn(updated, 'paidAmount'), false);
  assert.equal(Object.hasOwn(updated, 'actualSettlementAt'), false);
});

test('rejects migration when historical paid commission exceeds the recalculation', async () => {
  const record = commissionRecord({ paidAmount: 4000 });
  const { service, changes } = setup(record);

  await assert.rejects(
    service.migrateToEachPayment(
      { id: 1 },
      21,
      {
        expectedCustomerNo: 'KH000130',
        expectedOrderNo: 'DD000130',
        reason: '尝试迁移',
        confirm: true,
      },
    ),
    /已付返佣超过分笔重算金额/,
  );
  assert.deepEqual(changes(), { updated: null, audited: null });
});

test('rejects migration until the current channel uses per-payment settlement', async () => {
  const record = commissionRecord({
    channel: { settlementCondition: SettlementCondition.ON_FULL_PAYMENT },
  });
  const { service, changes } = setup(record);

  await assert.rejects(
    service.migrateToEachPayment(
      { id: 1 },
      21,
      {
        expectedCustomerNo: 'KH000130',
        expectedOrderNo: 'DD000130',
        reason: '尝试迁移',
        confirm: true,
      },
    ),
    /当前渠道尚未设置为每笔到账后/,
  );
  assert.deepEqual(changes(), { updated: null, audited: null });
});

test('previews the exact customer and order without writing data', async () => {
  const { service, changes } = setup(commissionRecord());
  const result = await service.migrateToEachPayment(
    { id: 1 },
    21,
    {
      expectedCustomerNo: 'KH000130',
      expectedOrderNo: 'DD000130',
      reason: '预览迁移',
      confirm: false,
    },
  );

  assert.equal(result.dryRun, true);
  assert.equal(result.migrated, false);
  assert.equal(result.customerName, '刘善瑜');
  assert.match(result.previewFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(changes(), { updated: null, audited: null });
});

test('rejects confirmation when a payment changes after preview', async () => {
  const record = commissionRecord();
  const { service, changes } = setup(record);
  const request = {
    expectedCustomerNo: 'KH000130',
    expectedOrderNo: 'DD000130',
    reason: '确认迁移',
  };
  const preview = await service.migrateToEachPayment(
    { id: 1 },
    21,
    { ...request, confirm: false },
  );
  record.order.payments[1].amount = 12000;
  record.order.payments[1].updatedAt = new Date('2026-09-07T07:00:00.000Z');

  await assert.rejects(
    service.migrateToEachPayment(
      { id: 1 },
      21,
      {
        ...request,
        confirm: true,
        previewFingerprint: preview.previewFingerprint,
      },
    ),
    /返佣记录已发生变化，请重新预览后再确认/,
  );
  assert.deepEqual(changes(), { updated: null, audited: null });
});
