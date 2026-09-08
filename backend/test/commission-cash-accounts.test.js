const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CommissionStatus,
  FundSettlementMode,
} = require('@prisma/client');
const { CommissionsService } = require('../dist/commissions/commissions.service');

function orderWithCommission({ payableAmount, paidAmount, status }) {
  return {
    id: 1,
    currency: 'CNY',
    receivableAmount: 20000,
    paidAmount: 10000,
    fundSettlementMode: FundSettlementMode.COMPANY_REBATE,
    customer: {
      name: '测试客户',
      channelNameSnapshot: '测试渠道',
      channel: null,
      acquisitionChannel: null,
    },
    commission: {
      deletedAt: null,
      payableAmount,
      paidAmount,
      status,
      fundSettlementMode: FundSettlementMode.COMPANY_REBATE,
      channelNameSnapshot: '测试渠道',
    },
    refunds: [],
  };
}

async function cashAccountStatus(commission) {
  const order = orderWithCommission(commission);
  const prisma = {
    order: {
      findMany: async () => [order],
      count: async () => 1,
    },
    $transaction: async (operations) => Promise.all(operations),
  };
  const service = new CommissionsService(prisma, {}, {});
  const result = await service.cashAccounts({ all: '1' });
  return result.items[0].rebateStatus;
}

test('cash account rebate status follows the amount already paid', async () => {
  assert.equal(
    await cashAccountStatus({
      payableAmount: 3000,
      paidAmount: 0,
      status: CommissionStatus.PAID,
    }),
    '未返佣',
  );
  assert.equal(
    await cashAccountStatus({
      payableAmount: 3000,
      paidAmount: 1500,
      status: CommissionStatus.NOT_DUE,
    }),
    '已部分返佣',
  );
  assert.equal(
    await cashAccountStatus({
      payableAmount: 3000,
      paidAmount: 3000,
      status: CommissionStatus.PENDING_REVIEW,
    }),
    '已返佣',
  );
});
