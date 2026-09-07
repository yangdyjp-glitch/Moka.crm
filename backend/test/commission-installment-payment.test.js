const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CommissionMethod,
  CommissionStatus,
  FundSettlementMode,
  PaymentConfirmStatus,
  Prisma,
  SettlementCondition,
} = require('@prisma/client');
const { CommissionsService } = require('../dist/commissions/commissions.service');

function commissionRecord(overrides = {}) {
  return {
    id: 21,
    channelId: 7,
    currency: 'CNY',
    commissionMethodSnapshot: CommissionMethod.NET_RECEIVED_RATIO,
    commissionRateSnapshot: 15,
    fundSettlementMode: FundSettlementMode.COMPANY_REBATE,
    paidAmount: 0,
    unpaidAmount: 3300,
    payableAmount: 3300,
    clawbackAmount: 0,
    status: CommissionStatus.PENDING_REVIEW,
    suspended: false,
    settlementCondition: SettlementCondition.ON_EACH_PAYMENT,
    actualSettlementAt: null,
    remark: null,
    updatedAt: new Date('2026-09-07T08:00:00.000Z'),
    order: {
      payments: [
        {
          id: 57,
          paymentNo: 'SK000130',
          amount: 11000,
          confirmStatus: PaymentConfirmStatus.CONFIRMED,
          confirmedAt: new Date('2026-09-07T06:03:11.434Z'),
          updatedAt: new Date('2026-09-07T06:03:11.434Z'),
          remark: '首款',
          paidAt: new Date('2026-09-02T00:00:00.000Z'),
        },
        {
          id: 58,
          paymentNo: 'SK000130-02',
          amount: 11000,
          confirmStatus: PaymentConfirmStatus.PENDING,
          confirmedAt: null,
          updatedAt: new Date('2026-09-07T06:03:12.204Z'),
          remark: '尾款',
          paidAt: new Date('2026-09-02T09:47:54.154Z'),
        },
      ],
    },
    ...overrides,
  };
}

function setup(record, balance = 0) {
  let transactionOptions = null;
  let claimed = null;
  const ledgerCalls = { balances: [], entries: [] };
  const auditCalls = [];
  const tx = {
    commission: {
      findFirst: async () => record,
      updateMany: async (args) => {
        claimed = args;
        return { count: 1 };
      },
    },
  };
  const prisma = {
    $transaction: async (operation, options) => {
      transactionOptions = options;
      return operation(tx);
    },
  };
  const ledger = {
    getBalance: async (...args) => {
      ledgerCalls.balances.push(args);
      return balance;
    },
    addEntry: async (...args) => {
      ledgerCalls.entries.push(args);
      return args[0];
    },
  };
  const audit = {
    log: async (...args) => {
      auditCalls.push(args);
      return args[0];
    },
  };
  return {
    service: new CommissionsService(prisma, ledger, audit),
    tx,
    state: () => ({
      transactionOptions,
      claimed,
      ledgerCalls,
      auditCalls,
    }),
  };
}

test('pays one installment with commission, ledger and audit in one serializable transaction', async () => {
  const record = commissionRecord();
  const { service, tx, state } = setup(record, 650);

  const result = await service.payInstallment({ id: 9 }, 21, 57, 123);
  const { transactionOptions, claimed, ledgerCalls, auditCalls } = state();

  assert.equal(
    transactionOptions.isolationLevel,
    Prisma.TransactionIsolationLevel.Serializable,
  );
  assert.equal(result.payable, 1650);
  assert.equal(result.offset, 650);
  assert.equal(result.cashOut, 1000);
  assert.equal(claimed.where.id, 21);
  assert.equal(claimed.where.updatedAt, record.updatedAt);
  assert.equal(claimed.where.paidAmount, record.paidAmount);
  assert.equal(
    claimed.where.settlementCondition,
    SettlementCondition.ON_EACH_PAYMENT,
  );
  assert.deepEqual(claimed.data.paidAmount, { increment: 1650 });
  assert.equal(claimed.data.unpaidAmount, 1650);
  assert.equal(claimed.data.status, CommissionStatus.NOT_DUE);
  assert.equal(ledgerCalls.balances[0][2], tx);
  assert.equal(ledgerCalls.entries.length, 1);
  assert.equal(ledgerCalls.entries[0][0].amount, -650);
  assert.equal(ledgerCalls.entries[0][1], tx);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0][0].action, 'PAY_COMMISSION_INSTALLMENT');
  assert.equal(auditCalls[0][1], tx);
});

test('rejects a later installment while any earlier installment remains unpaid', async () => {
  for (const earlierStatus of [
    PaymentConfirmStatus.PENDING,
    PaymentConfirmStatus.PROBLEM,
  ]) {
    const base = commissionRecord();
    const record = commissionRecord({
      order: {
        payments: base.order.payments.map((payment) =>
          payment.id === 57
            ? {
                ...payment,
                confirmStatus: earlierStatus,
                confirmedAt: null,
              }
            : {
                ...payment,
                confirmStatus: PaymentConfirmStatus.CONFIRMED,
                confirmedAt: new Date('2026-09-07T07:00:00.000Z'),
              },
        ),
      },
    });
    const { service, state } = setup(record);

    await assert.rejects(
      service.payInstallment({ id: 9 }, 21, 58),
      /请先处理较早的返佣分笔（SK000130）/,
    );
    const { claimed, ledgerCalls, auditCalls } = state();
    assert.equal(claimed, null);
    assert.equal(ledgerCalls.balances.length, 0);
    assert.equal(ledgerCalls.entries.length, 0);
    assert.equal(auditCalls.length, 0);
  }
});

test('CAS allows only one of two concurrent installment payments to write', async () => {
  const initialUpdatedAt = new Date('2026-09-07T08:00:00.000Z');
  const base = commissionRecord({
    commissionRateSnapshot: 10,
    paidAmount: 0,
    unpaidAmount: 100,
    payableAmount: 100,
    updatedAt: initialUpdatedAt,
    order: {
      payments: [
        {
          id: 57,
          paymentNo: 'SK000130',
          amount: 1000,
          confirmStatus: PaymentConfirmStatus.CONFIRMED,
          confirmedAt: new Date('2026-09-07T06:03:11.434Z'),
          updatedAt: new Date('2026-09-07T06:03:11.434Z'),
          remark: '首款',
          paidAt: new Date('2026-09-02T00:00:00.000Z'),
        },
      ],
    },
  });
  let storedPaidAmount = 0;
  let storedUpdatedAt = initialUpdatedAt;
  let readers = 0;
  let releaseReaders;
  const bothRead = new Promise((resolve) => {
    releaseReaders = resolve;
  });
  let successfulClaims = 0;
  const ledgerEntries = [];
  const audits = [];
  const tx = {
    commission: {
      findFirst: async () => {
        const snapshot = {
          ...base,
          paidAmount: storedPaidAmount,
          updatedAt: storedUpdatedAt,
        };
        readers += 1;
        if (readers === 2) releaseReaders();
        await bothRead;
        return snapshot;
      },
      updateMany: async ({ where, data }) => {
        if (
          where.updatedAt !== storedUpdatedAt ||
          Number(where.paidAmount) !== storedPaidAmount
        ) {
          return { count: 0 };
        }
        storedPaidAmount += Number(data.paidAmount.increment);
        storedUpdatedAt = new Date(storedUpdatedAt.getTime() + 1);
        successfulClaims += 1;
        return { count: 1 };
      },
    },
  };
  const prisma = { $transaction: async (operation) => operation(tx) };
  const ledger = {
    getBalance: async () => 50,
    addEntry: async (entry) => {
      ledgerEntries.push(entry);
      return entry;
    },
  };
  const audit = {
    log: async (entry) => {
      audits.push(entry);
      return entry;
    },
  };
  const service = new CommissionsService(prisma, ledger, audit);

  const results = await Promise.allSettled([
    service.payInstallment({ id: 9 }, 21, 57),
    service.payInstallment({ id: 9 }, 21, 57),
  ]);

  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
  assert.match(
    results.find((item) => item.status === 'rejected').reason.message,
    /返佣记录刚刚发生变化/,
  );
  assert.equal(successfulClaims, 1);
  assert.equal(storedPaidAmount, 100);
  assert.equal(ledgerEntries.length, 1);
  assert.equal(audits.length, 1);
});
