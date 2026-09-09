const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Prisma, UserRole, ChannelType } = require('@prisma/client');
const { ChannelMaintenanceService } = require('../dist/channel-maintenance/channel-maintenance.service');
const { ChannelMaintenanceController } = require('../dist/channel-maintenance/channel-maintenance.controller');

const admin = { id: 1, role: UserRole.ADMIN, name: '管理员' };
const market = { id: 2, role: UserRole.MARKET, name: '市场' };
const supervisor = { id: 3, role: UserRole.BUSINESS_SUPERVISOR, name: '营业主管' };
const sales = { id: 4, role: UserRole.SALES, name: '销售' };

function compare(value, filter) {
  if (filter === null || typeof filter !== 'object' || filter instanceof Date) {
    return value instanceof Date && filter instanceof Date
      ? value.getTime() === filter.getTime()
      : value === filter;
  }
  return Object.entries(filter).every(([operator, expected]) => {
    if (expected === undefined) return true;
    switch (operator) {
      case 'equals': return compare(value, expected);
      case 'not': return !compare(value, expected);
      case 'in': return expected.includes(value);
      case 'gte': return value >= expected;
      case 'gt': return value > expected;
      case 'lte': return value <= expected;
      case 'lt': return value < expected;
      case 'is': return matches(value, expected);
      default: return matches(value, filter);
    }
  });
}

function matches(row, where = {}) {
  if (!row) return false;
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true;
    if (key === 'AND') return [].concat(expected).every((item) => matches(row, item));
    if (key === 'OR') return expected.some((item) => matches(row, item));
    if (key === 'NOT') return ![].concat(expected).some((item) => matches(row, item));
    return compare(row[key], expected);
  });
}

function project(row, select) {
  if (!select) return { ...row };
  return Object.fromEntries(Object.entries(select)
    .filter(([, value]) => value)
    .map(([key, value]) => [key, value === true || row[key] == null
      ? row[key]
      : project(row[key], value.select)]));
}

/** In-memory Prisma double: transactions roll back and no other financial models exist. */
function setup() {
  let nextId = 100;
  const state = {
    channel: [
      { id: 10, channelNo: 'QD10', name: '合作机构', channelType: ChannelType.ENTERPRISE, cooperationStatus: 'ACTIVE', deletedAt: null },
      { id: 20, channelNo: 'QD20', name: '个人中介', channelType: ChannelType.INDIVIDUAL, cooperationStatus: 'ACTIVE', deletedAt: null },
      { id: 30, channelNo: 'QD30', name: '已删除机构', channelType: ChannelType.ENTERPRISE, cooperationStatus: 'ACTIVE', deletedAt: new Date() },
    ],
    channelMaintenanceRecord: [],
    channelExpense: [],
    channelExpenseReceipt: [],
    audits: [],
  };
  const calls = [];
  const transactions = [];
  const transactionErrors = [];
  let failAudit = false;
  const relations = (name, row) => ({
    ...row,
    ...(name === 'channelMaintenanceRecord' || name === 'channelExpense' ? {
      channel: state.channel.find((item) => item.id === row.channelId),
      createdBy: [admin, market, supervisor, sales].find((item) => item.id === row.createdById),
    } : {}),
    ...(name === 'channelExpense' ? { receipt: state.channelExpenseReceipt.find((item) => item.expenseId === row.id) ?? null } : {}),
    ...(name === 'channelExpenseReceipt' ? { expense: state.channelExpense.find((item) => item.id === row.expenseId) } : {}),
  });
  function client(inTransaction) {
    const models = {};
    for (const name of ['channel', 'channelMaintenanceRecord', 'channelExpense', 'channelExpenseReceipt']) {
      const recordCall = (method, args) => calls.push({ name, method, args, inTransaction });
      const rows = (where) => state[name].map((row) => relations(name, row)).filter((row) => matches(row, where));
      const output = (row, args = {}) => row ? project(relations(name, row), args.select) : null;
      models[name] = {
        findMany: async (args = {}) => {
          recordCall('findMany', args);
          let result = rows(args.where);
          for (const sort of [].concat(args.orderBy ?? []).reverse()) {
            const [key, direction] = Object.entries(sort)[0];
            result.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === 'desc' ? -1 : 1));
          }
          result = result.slice(args.skip ?? 0, args.take == null ? undefined : (args.skip ?? 0) + args.take);
          return result.map((row) => project(row, args.select));
        },
        findFirst: async (args = {}) => { recordCall('findFirst', args); return output(rows(args.where)[0], args); },
        findUnique: async (args = {}) => { recordCall('findUnique', args); return output(rows(args.where)[0], args); },
        count: async (args = {}) => { recordCall('count', args); return rows(args.where).length; },
        groupBy: async (args) => {
          recordCall('groupBy', args);
          assert.deepEqual(args.by, ['currency']);
          const totals = new Map();
          for (const row of rows(args.where)) totals.set(row.currency, (totals.get(row.currency) ?? new Prisma.Decimal(0)).plus(row.amount));
          return [...totals].map(([currency, amount]) => ({ currency, _sum: { amount } }));
        },
        create: async (args) => {
          recordCall('create', args);
          assert.equal(inTransaction, true, 'new business records must use the audit transaction');
          if (args.data.requestId && state[name].some((row) => row.requestId === args.data.requestId)) {
            throw new Prisma.PrismaClientKnownRequestError('duplicate request', { code: 'P2002', clientVersion: 'test', meta: { target: ['requestId'] } });
          }
          const data = { ...args.data };
          const nestedReceipt = data.receipt;
          delete data.receipt;
          const row = { id: nextId++, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...data };
          state[name].push(row);
          if (nestedReceipt?.create) await models.channelExpenseReceipt.create({ data: { expenseId: row.id, ...nestedReceipt.create } });
          return output(row, args);
        },
        update: async (args) => {
          recordCall('update', args);
          assert.equal(inTransaction, true);
          const row = state[name].find((item) => matches(relations(name, item), args.where));
          assert.ok(row, `missing ${name} update target`);
          Object.assign(row, args.data, { updatedAt: new Date() });
          return output(row, args);
        },
        updateMany: async (args) => {
          recordCall('updateMany', args);
          assert.equal(inTransaction, true);
          const result = state[name].filter((item) => matches(relations(name, item), args.where));
          result.forEach((row) => Object.assign(row, args.data, { updatedAt: new Date() }));
          return { count: result.length };
        },
        deleteMany: async (args) => {
          recordCall('deleteMany', args);
          assert.equal(inTransaction, true);
          const removed = state[name].filter((row) => matches(relations(name, row), args.where));
          state[name] = state[name].filter((row) => !removed.includes(row));
          return { count: removed.length };
        },
        upsert: async (args) => {
          recordCall('upsert', args);
          return rows(args.where).length
            ? models[name].update({ where: args.where, data: args.update, select: args.select })
            : models[name].create({ data: args.create, select: args.select });
        },
      };
    }
    return new Proxy(models, {
      get(target, name) {
        if (name in target || typeof name === 'symbol' || name === 'then') return target[name];
        throw new Error(`Out-of-scope Prisma access: ${String(name)}`);
      },
    });
  }
  const tx = client(true);
  const db = client(false);
  const prisma = new Proxy({
    $transaction: async (operation, options) => {
      transactions.push(options);
      if (Array.isArray(operation)) {
        assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.RepeatableRead);
        return Promise.all(operation);
      }
      assert.equal(typeof operation, 'function', 'writes must use an interactive transaction');
      if (transactionErrors.length) throw transactionErrors.shift();
      const before = Object.fromEntries(Object.entries(state).map(([key, value]) => [key, value.map((row) => ({ ...row }))]));
      try { return await operation(tx); } catch (error) { Object.assign(state, before); throw error; }
    },
  }, {
    get(target, name) { return name in target ? target[name] : db[name]; },
  });
  const audit = { log: async (entry, auditTx) => {
    assert.equal(auditTx, tx, 'audit must use the same transaction as the record');
    if (failAudit) throw new Error('audit unavailable');
    state.audits.push(entry);
  } };
  return {
    service: new ChannelMaintenanceService(prisma, audit), state, calls, transactions,
    setAuditFailure: () => { failAudit = true; },
    failNextTransaction: (code) => transactionErrors.push(new Prisma.PrismaClientKnownRequestError('simulated transaction conflict', { code, clientVersion: 'test' })),
  };
}

const recordBody = (overrides = {}) => ({ requestId: randomUUID(), channelId: 10, maintainedAt: '2026-09-09', content: '沟通合作安排', nextMaintenanceAt: '2026-09-20', ...overrides });
const expenseBody = (overrides = {}) => ({ requestId: randomUUID(), channelId: 10, incurredAt: '2026-09-09', category: 'HOTEL', amount: '10.20', currency: 'CNY', note: '拜访住宿', ...overrides });
const pdfReceipt = () => { const buffer = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n'); return { buffer, size: buffer.length, mimetype: 'application/pdf', originalname: 'receipt.pdf' }; };
const status = (code) => (error) => { assert.equal(error.getStatus?.(), code, error.stack); return true; };

test('service-level roles block sales and keep all expense actions administrator-only', async () => {
  const { service, calls } = setup();
  for (const action of [
    () => service.channels(sales), () => service.records(sales, {}),
    () => service.createRecord(sales, recordBody()), () => service.updateRecord(sales, 1, { content: '改动' }),
    () => service.removeRecord(sales, 1),
    ...[market, supervisor, sales].flatMap((user) => [
      () => service.expenses(user, {}), () => service.createExpense(user, expenseBody()),
      () => service.updateExpense(user, 1, { note: '改动' }), () => service.removeExpense(user, 1),
      () => service.receipt(user, 1),
    ]),
  ]) await assert.rejects(async () => action(), status(403));
  assert.equal(calls.length, 0, 'unauthorized roles must not query data');
});

test('market and supervisor can only list and maintain INDIVIDUAL channels, including direct-ID access', async () => {
  for (const user of [market, supervisor]) {
    const { service } = setup();
    assert.deepEqual((await service.channels(user)).map((row) => row.id), [20]);
    const individual = await service.createRecord(user, recordBody({ channelId: 20 }));
    const enterprise = await service.createRecord(admin, recordBody());
    assert.deepEqual((await service.records(user, {})).rows.map((row) => row.id), [individual.id]);
    await assert.rejects(service.createRecord(user, recordBody()), (error) => [403, 404].includes(error.getStatus()));
    await assert.rejects(service.updateRecord(user, enterprise.id, { content: '越权修改' }), (error) => [403, 404].includes(error.getStatus()));
    await assert.rejects(service.removeRecord(user, enterprise.id), (error) => [403, 404].includes(error.getStatus()));
    await assert.rejects(service.updateRecord(user, individual.id, { channelId: 10 }), (error) => [403, 404].includes(error.getStatus()));
  }
});

test('non-administrators can read another person\'s individual-channel notes but cannot edit or delete them', async () => {
  const { service, state } = setup();
  const own = await service.createRecord(market, recordBody({ channelId: 20 }));
  assert.equal((await service.records(supervisor, {})).rows.some((row) => row.id === own.id), true);
  await assert.rejects(service.updateRecord(supervisor, own.id, { content: '改别人记录' }), (error) => [403, 404].includes(error.getStatus()));
  await assert.rejects(service.removeRecord(supervisor, own.id), (error) => [403, 404].includes(error.getStatus()));
  await service.updateRecord(market, own.id, { content: '本人补充' });
  await service.updateRecord(admin, own.id, { content: '管理员更正' });
  await service.removeRecord(admin, own.id);
  assert.ok(state.channelMaintenanceRecord[0].deletedAt instanceof Date);
});

test('deleting a channel preserves historical notes and cost totals but prevents new or edited entries', async () => {
  const { service, state } = setup();
  const record = await service.createRecord(admin, recordBody());
  const expense = await service.createExpense(admin, expenseBody());
  state.channel.find((row) => row.id === 10).deletedAt = new Date();
  assert.equal((await service.records(admin, {})).rows.some((row) => row.id === record.id), true);
  assert.deepEqual((await service.expenses(admin, {})).summary, { CNY: '10.2', JPY: '0' });
  assert.equal((await service.channels(admin)).some((row) => row.id === 10), false);
  await assert.rejects(service.createRecord(admin, recordBody()), status(404));
  await assert.rejects(service.createExpense(admin, expenseBody()), status(404));
  await assert.rejects(service.updateRecord(admin, record.id, { content: '失效渠道修改' }), status(404));
  await assert.rejects(service.updateExpense(admin, expense.id, { amount: '20.00' }), status(404));
});

test('record list applies channel/date filters before pagination and excludes soft-deleted records', async () => {
  const { service, calls } = setup();
  const first = await service.createRecord(admin, recordBody({ maintainedAt: '2026-09-01' }));
  await service.createRecord(admin, recordBody({ maintainedAt: '2026-09-30', nextMaintenanceAt: null }));
  await service.createRecord(admin, recordBody({ maintainedAt: '2026-08-31' }));
  await service.createRecord(admin, recordBody({ channelId: 20 }));
  const deleted = await service.createRecord(admin, recordBody());
  await service.removeRecord(admin, deleted.id);
  const result = await service.records(admin, { channelId: '10', startDate: '2026-09-01', endDate: '2026-09-30', page: '2', pageSize: '1' });
  assert.equal(result.total, 2);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 1);
  assert.deepEqual(result.rows.map((row) => row.id), [first.id]);
  const readCalls = calls.filter((call) => call.name === 'channelMaintenanceRecord');
  assert.deepEqual(readCalls.findLast((call) => call.method === 'findMany').args.where, readCalls.findLast((call) => call.method === 'count').args.where);
  assert.equal('requestHash' in result.rows[0], false);
  assert.equal('requestId' in result.rows[0], false);
});

test('invalid calendar dates, reversed ranges, pagination, empty content and deleted channels are rejected', async () => {
  const { service, state } = setup();
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-09-00', '2026-9-1', '2026-09-09T00:00:00Z', '1899-12-31', '2101-01-01']) {
    await assert.rejects(service.createRecord(admin, recordBody({ maintainedAt: date })), status(400));
    await assert.rejects(service.createExpense(admin, expenseBody({ incurredAt: date })), status(400));
  }
  for (const query of [{ startDate: '2026-09-20', endDate: '2026-09-01' }, { page: '-1' }, { page: '1.5' }, { pageSize: '0' }, { channelId: '1xyz' }]) {
    await assert.rejects(service.records(admin, query), status(400));
    await assert.rejects(service.expenses(admin, query), status(400));
  }
  await assert.rejects(service.createRecord(admin, recordBody({ content: '  ' })), status(400));
  await assert.rejects(service.createRecord(admin, recordBody({ channelId: 30 })), status(404));
  assert.equal(state.channelMaintenanceRecord.length, 0);
  assert.equal(state.channelExpense.length, 0);
});

test('record create is idempotent after later editing and rejects reuse with a different payload', async () => {
  const { service, state } = setup();
  const body = recordBody();
  const original = await service.createRecord(admin, body);
  const retry = await service.createRecord(admin, body);
  assert.equal(retry.id, original.id);
  assert.equal(state.channelMaintenanceRecord.length, 1);
  assert.equal(state.audits.length, 1);
  await service.updateRecord(admin, original.id, { content: '会面结果已补充', nextMaintenanceAt: null });
  const afterEdit = await service.createRecord(admin, body);
  assert.equal(afterEdit.id, original.id);
  assert.equal(afterEdit.content, '会面结果已补充');
  assert.equal(afterEdit.nextMaintenanceAt, null);
  await assert.rejects(service.createRecord(admin, { ...body, content: '复用请求编号写入另一次维护' }), status(409));
  assert.equal(state.audits.length, 2);
});

test('request IDs are bound to their creator and cannot resurrect deleted records or expenses', async () => {
  const { service, state } = setup();
  const body = recordBody({ channelId: 20 });
  const original = await service.createRecord(market, body);
  await assert.rejects(service.createRecord(supervisor, body), status(409));
  await service.removeRecord(market, original.id);
  await assert.rejects(service.createRecord(market, body), status(409));
  const expense = expenseBody();
  const initial = await service.createExpense(admin, expense);
  await service.removeExpense(admin, initial.id);
  await assert.rejects(service.createExpense(admin, expense), status(409));
  assert.equal(state.channelMaintenanceRecord.length, 1);
  assert.equal(state.channelExpense.length, 1);
});

test('serialization and uniqueness conflicts retry safely without duplicate records or duplicate audits', async () => {
  for (const code of ['P2034', 'P2002']) {
    const { service, state, transactions, failNextTransaction } = setup();
    failNextTransaction(code);
    await service.createRecord(admin, recordBody());
    assert.equal(state.channelMaintenanceRecord.length, 1);
    assert.equal(state.audits.length, 1);
    assert.equal(transactions.length, 2);
    assert.ok(transactions.every((options) => options.isolationLevel === Prisma.TransactionIsolationLevel.Serializable));
  }
  const { service, state, failNextTransaction } = setup();
  for (let attempt = 0; attempt < 3; attempt += 1) failNextTransaction('P2034');
  await assert.rejects(service.createExpense(admin, expenseBody()), status(409));
  assert.equal(state.channelExpense.length, 0);
  assert.equal(state.audits.length, 0);
});

test('writes and audit are atomic, use serializable transactions, and never call existing finance models', async () => {
  const { service, state, transactions, setAuditFailure } = setup();
  await service.createRecord(admin, recordBody());
  assert.equal(transactions[0].isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
  setAuditFailure();
  await assert.rejects(service.createExpense(admin, expenseBody()), /audit unavailable/);
  assert.equal(state.channelExpense.length, 0);
  assert.equal(state.audits.length, 1);
});

test('expense amounts reject zero, negative, excess precision and non-decimal forms without silent rounding', async () => {
  const { service, state } = setup();
  for (const amount of ['0', '-1', '0.001', '10.999', '1e3', 'NaN', 'Infinity', '1000000000000.00', '12abc', '', null]) {
    await assert.rejects(service.createExpense(admin, expenseBody({ amount })), status(400));
  }
  await assert.rejects(service.createExpense(admin, expenseBody({ currency: 'USD' })), status(400));
  await assert.rejects(service.createExpense(admin, expenseBody({ currency: 'JPY', amount: '1.01' })), status(400));
  await assert.rejects(service.createExpense(admin, expenseBody({ category: 'OTHER' })), status(400));
  assert.equal(state.channelExpense.length, 0);
  const accepted = await service.createExpense(admin, expenseBody({ amount: '0.01' }));
  assert.equal(accepted.amount, '0.01');
});

test('currency summaries use every matching expense, not just the page, and refresh after edit or deletion', async () => {
  const { service, calls } = setup();
  const one = await service.createExpense(admin, expenseBody({ amount: '0.10' }));
  const two = await service.createExpense(admin, expenseBody({ amount: '0.20', category: 'GIFT' }));
  await service.createExpense(admin, expenseBody({ amount: '40000', currency: 'JPY' }));
  await service.createExpense(admin, expenseBody({ amount: '500', channelId: 20 }));
  await service.createExpense(admin, expenseBody({ amount: '999', incurredAt: '2026-08-31' }));
  const query = { channelId: '10', startDate: '2026-09-01', endDate: '2026-09-30', page: '1', pageSize: '1' };
  const result = await service.expenses(admin, query);
  assert.equal(result.total, 3);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.summary, { CNY: '0.3', JPY: '40000' });
  const relevant = calls.filter((call) => call.name === 'channelExpense');
  const listWhere = relevant.findLast((call) => call.method === 'findMany').args.where;
  assert.deepEqual(listWhere, relevant.findLast((call) => call.method === 'count').args.where);
  assert.deepEqual(listWhere, relevant.findLast((call) => call.method === 'groupBy').args.where);
  await service.updateExpense(admin, one.id, { amount: '1.10' });
  await service.removeExpense(admin, two.id);
  const updated = await service.expenses(admin, query);
  assert.equal(updated.total, 2);
  assert.deepEqual(updated.summary, { CNY: '1.1', JPY: '40000' });
});

test('expense retries retain original idempotency digest even after amount changes', async () => {
  const { service, state } = setup();
  const body = expenseBody();
  const initial = await service.createExpense(admin, body);
  assert.equal((await service.createExpense(admin, body)).id, initial.id);
  await service.updateExpense(admin, initial.id, { amount: '20.40' });
  assert.equal((await service.createExpense(admin, body)).amount, '20.4');
  await assert.rejects(service.createExpense(admin, { ...body, amount: '20.40' }), status(409));
  assert.equal(state.channelExpense.length, 1);
  assert.equal(state.audits.length, 2);
});

test('receipt bytes stay private, authorized download works, and deleted expense receipts cannot be downloaded', async () => {
  const { service, state } = setup();
  const file = pdfReceipt();
  const expense = await service.createExpense(admin, expenseBody(), file);
  assert.equal(expense.receipt.fileName, 'receipt.pdf');
  assert.equal('data' in expense.receipt, false);
  const list = await service.expenses(admin, {});
  assert.equal('data' in list.rows[0].receipt, false);
  const download = await service.receipt(admin, expense.id);
  assert.deepEqual(Buffer.from(download.data), file.buffer);
  assert.equal(JSON.stringify(state.audits).includes('%PDF'), false);
  await assert.rejects(service.receipt(market, expense.id), status(403));
  await service.removeExpense(admin, expense.id);
  await assert.rejects(service.receipt(admin, expense.id), status(404));
});

test('receipt replacement and removal are atomic with the expense and cannot be requested together', async () => {
  const { service, state, setAuditFailure } = setup();
  const expense = await service.createExpense(admin, expenseBody(), pdfReceipt());
  const newFile = { ...pdfReceipt(), originalname: 'replacement.pdf' };
  await assert.rejects(service.updateExpense(admin, expense.id, { removeReceipt: true }, newFile), status(400));
  const replacement = await service.updateExpense(admin, expense.id, { note: '换票据' }, newFile);
  assert.equal(replacement.receipt.fileName, 'replacement.pdf');
  assert.equal(state.channelExpenseReceipt.length, 1);
  setAuditFailure();
  await assert.rejects(service.updateExpense(admin, expense.id, { removeReceipt: 'true' }), /audit unavailable/);
  assert.equal(state.channelExpenseReceipt.length, 1, 'failed audit restores the removed receipt');
  assert.equal((await service.receipt(admin, expense.id)).fileName, 'replacement.pdf');
  const other = setup();
  const removable = await other.service.createExpense(admin, expenseBody(), pdfReceipt());
  assert.equal((await other.service.updateExpense(admin, removable.id, { removeReceipt: true })).receipt, null);
  await assert.rejects(other.service.receipt(admin, removable.id), status(404));
});

test('expense HTTP methods have administrator-only metadata and receipt responses prevent caching and inline sniffing', async () => {
  for (const name of ['expenses', 'createExpense', 'updateExpense', 'removeExpense', 'receipt']) {
    assert.deepEqual(Reflect.getMetadata('roles', ChannelMaintenanceController.prototype[name]), [UserRole.ADMIN]);
  }
  const { service } = setup();
  const file = pdfReceipt();
  const expense = await service.createExpense(admin, expenseBody(), file);
  const headers = {};
  let attachment;
  let sent;
  const response = {
    setHeader(name, value) { headers[name] = value; },
    attachment(name) { attachment = name; },
    send(value) { sent = value; },
  };
  await new ChannelMaintenanceController(service).receipt(admin, expense.id, response);
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Content-Type'], 'application/pdf');
  assert.equal(headers['Content-Length'], file.buffer.length);
  assert.equal(attachment, 'receipt.pdf');
  assert.deepEqual(sent, file.buffer);
});

test('receipt validation uses bytes rather than the claimed MIME and sanitizes filenames', async () => {
  const { service } = setup();
  const file = { ...pdfReceipt(), mimetype: 'image/png', originalname: '../../<unsafe>receipt.png' };
  const result = await service.createExpense(admin, expenseBody(), file);
  assert.equal(result.receipt.contentType, 'application/pdf');
  assert.equal(result.receipt.fileName, 'unsafereceipt.pdf');
});

test('receipts reject oversized bodies and malformed file signatures', async () => {
  const { service, state } = setup();
  const base = pdfReceipt();
  for (const file of [
    { ...base, buffer: Buffer.alloc(5 * 1024 * 1024 + 1), size: 5 * 1024 * 1024 + 1 },
    { ...base, buffer: Buffer.from('%PDF-1.4 missing eof'), size: 20 },
    { ...base, buffer: Buffer.from('<script>alert(1)</script>'), size: 25 },
  ]) await assert.rejects(service.createExpense(admin, expenseBody(), file), status(400));
  assert.equal(state.channelExpense.length, 0);
  assert.equal(state.channelExpenseReceipt.length, 0);
});
