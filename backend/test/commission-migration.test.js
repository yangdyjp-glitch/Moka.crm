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
  let claimedWhere = null;
  const tx = {
    commission: {
      findFirst: async () => record,
      updateMany: async ({ where, data }) => {
        claimedWhere = where;
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
    claimWhere: () => claimedWhere,
  };
}

test('migrates an old full-payment commission into per-payment rows', async () => {
  const { service, changes, claimWhere } = setup(commissionRecord());
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
  assert.equal(
    claimWhere().settlementCondition,
    SettlementCondition.ON_FULL_PAYMENT,
  );
});

test('migrates an old on-sign commission into confirmed and pending payment rows', async () => {
  const firstConfirmedAt = new Date('2026-09-01T05:00:00.000Z');
  const record = commissionRecord({
    id: 20,
    commissionNo: 'FC000088',
    customerId: 112,
    orderId: 41,
    channelId: 10,
    calcBaseAmount: 12000,
    payableAmount: 1800,
    unpaidAmount: 1800,
    status: CommissionStatus.PENDING_REVIEW,
    settlementCondition: SettlementCondition.ON_SIGN,
    customer: {
      id: 112,
      customerNo: 'KH000088',
      name: '张子彦',
    },
    order: {
      id: 41,
      orderNo: 'DD000088',
      payments: [
        {
          id: 55,
          paymentNo: 'SK000088',
          amount: 12000,
          confirmStatus: PaymentConfirmStatus.CONFIRMED,
          confirmedAt: firstConfirmedAt,
          updatedAt: new Date('2026-09-01T05:00:00.000Z'),
          remark: '首款',
          paidAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        {
          id: 56,
          paymentNo: 'SK000088-02',
          amount: 12000,
          confirmStatus: PaymentConfirmStatus.PENDING,
          confirmedAt: null,
          updatedAt: new Date('2026-09-01T05:01:00.000Z'),
          remark: '尾款',
          paidAt: new Date('2026-09-01T00:01:00.000Z'),
        },
      ],
    },
  });
  const { service, changes, claimWhere } = setup(record);
  const request = {
    expectedCustomerNo: 'KH000088',
    expectedOrderNo: 'DD000088',
    reason: '将签约后快照迁移为每笔到账后',
  };

  const preview = await service.migrateToEachPayment(
    { id: 1 },
    20,
    { ...request, confirm: false },
  );
  const result = await service.migrateToEachPayment(
    { id: 1 },
    20,
    {
      ...request,
      confirm: true,
      previewFingerprint: preview.previewFingerprint,
    },
  );
  const { updated, audited } = changes();

  assert.equal(preview.dryRun, true);
  assert.equal(result.migrated, true);
  assert.equal(result.commissionNo, 'FC000088');
  assert.equal(result.customerNo, 'KH000088');
  assert.equal(result.orderNo, 'DD000088');
  assert.equal(result.payableAmount, 3600);
  assert.equal(result.paidAmount, 0);
  assert.equal(result.unpaidAmount, 3600);
  assert.equal(result.status, CommissionStatus.PENDING_REVIEW);
  assert.deepEqual(
    result.installments.map((item) => ({
      paymentNo: item.paymentNo,
      payableAmount: item.payableAmount,
      paidAmount: item.paidAmount,
      unpaidAmount: item.unpaidAmount,
      status: item.status,
    })),
    [
      {
        paymentNo: 'SK000088',
        payableAmount: 1800,
        paidAmount: 0,
        unpaidAmount: 1800,
        status: CommissionStatus.PENDING_REVIEW,
      },
      {
        paymentNo: 'SK000088-02',
        payableAmount: 1800,
        paidAmount: 0,
        unpaidAmount: 1800,
        status: CommissionStatus.NOT_DUE,
      },
    ],
  );
  assert.equal(updated.settlementCondition, SettlementCondition.ON_EACH_PAYMENT);
  assert.equal(updated.expectedSettlementAt, firstConfirmedAt);
  assert.equal(claimWhere().id, 20);
  assert.equal(claimWhere().updatedAt, record.updatedAt);
  assert.equal(claimWhere().settlementCondition, SettlementCondition.ON_SIGN);
  assert.match(audited.oldValue, /"settlementCondition":"ON_SIGN"/);
  assert.match(
    audited.newValue,
    /"settlementCondition":"ON_EACH_PAYMENT"/,
  );
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

test('rejects an on-sign migration with historical paid commission', async () => {
  const record = commissionRecord({
    settlementCondition: SettlementCondition.ON_SIGN,
    paidAmount: 1,
    unpaidAmount: 1649,
  });
  const { service, changes } = setup(record);

  await assert.rejects(
    service.migrateToEachPayment(
      { id: 1 },
      21,
      {
        expectedCustomerNo: 'KH000130',
        expectedOrderNo: 'DD000130',
        reason: '尝试迁移已付签约后返佣',
        confirm: false,
      },
    ),
    /已有支付金额.*请人工核对/,
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
