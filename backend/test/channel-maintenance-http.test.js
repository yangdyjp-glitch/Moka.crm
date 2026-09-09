const test = require('node:test');
const assert = require('node:assert/strict');
const { Module, UnauthorizedException, ValidationPipe } = require('@nestjs/common');
const { NestFactory, Reflector } = require('@nestjs/core');
const { RolesGuard } = require('../dist/auth/roles.guard');
const { ChannelMaintenanceController } = require('../dist/channel-maintenance/channel-maintenance.controller');
const { ChannelMaintenanceService } = require('../dist/channel-maintenance/channel-maintenance.service');
const { MAX_RECEIPT_BYTES } = require('../dist/channel-maintenance/validation');

// Real HTTP routing/interceptors/guards, with no database or external connection.
test('channel maintenance HTTP contract', async (t) => {
  const calls = [];
  const pdf = Buffer.from('%PDF-1.4\nfixture\n%%EOF');
  const service = {};
  for (const method of [
    'channels', 'records', 'createRecord', 'updateRecord', 'removeRecord',
    'expenses', 'createExpense', 'updateExpense', 'removeExpense',
  ]) {
    service[method] = (...args) => {
      calls.push({ method, args });
      return { ok: true };
    };
  }
  service.receipt = (...args) => {
    calls.push({ method: 'receipt', args });
    return { fileName: '费用凭证.pdf', contentType: 'application/pdf', size: pdf.length, data: pdf };
  };
  class HttpFixtureModule {}
  Module({
    controllers: [ChannelMaintenanceController],
    providers: [{ provide: ChannelMaintenanceService, useValue: service }],
  })(HttpFixtureModule);
  const app = await NestFactory.create(HttpFixtureModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalGuards({
    canActivate(context) {
      const req = context.switchToHttp().getRequest();
      const role = req.headers['x-fixture-role'];
      if (!role) throw new UnauthorizedException();
      req.user = { id: 41, username: 'fixture', name: '测试人员', role };
      return true;
    },
  }, new RolesGuard(new Reflector()));
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const base = `${await app.getUrl()}/api/channel-maintenance`;
  const request = (path, role = 'ADMIN', options = {}) => fetch(`${base}${path}`, {
    ...options,
    headers: { ...(role ? { 'x-fixture-role': role } : {}), ...options.headers },
  });

  await t.test('unauthenticated and sales roles cannot reach maintenance service', async () => {
    const before = calls.length;
    for (const [role, status] of [[null, 401], ['SALES', 403], ['DOWNSTREAM_SALES', 403]]) {
      assert.equal((await request('/records', role)).status, status);
    }
    assert.equal(calls.length, before);
  });

  await t.test('maintenance role and raw JSON/query payload survive global validation', async () => {
    const response = await request('/records?channelId=9&startDate=2026-09-01&page=2', 'MARKET');
    assert.equal(response.status, 200);
    assert.deepEqual({ ...calls.at(-1).args[1] }, { channelId: '9', startDate: '2026-09-01', page: '2' });
    const payload = { channelId: 9, maintainedAt: '2026-09-09', content: '渠道电话沟通', requestId: 'c22139c4-11d9-43de-b3fd-32a1fbd917b6' };
    const created = await request('/records', 'BUSINESS_SUPERVISOR', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    assert.equal(created.status, 201);
    assert.equal(calls.at(-1).args[0].role, 'BUSINESS_SUPERVISOR');
    assert.deepEqual(calls.at(-1).args[1], payload);
  });

  await t.test('every expense route is admin-only before service or upload work', async () => {
    const before = calls.length;
    for (const role of ['MARKET', 'BUSINESS_SUPERVISOR']) {
      for (const [path, method] of [
        ['/expenses', 'GET'], ['/expenses', 'POST'], ['/expenses/1', 'PATCH'],
        ['/expenses/1', 'DELETE'], ['/expenses/1/receipt', 'GET'],
      ]) assert.equal((await request(path, role, { method })).status, 403);
    }
    assert.equal(calls.length, before);
  });

  await t.test('multipart keeps decimal strings, fields and private receipt bytes', async () => {
    const form = new FormData();
    const payload = { channelId: '9', incurredAt: '2026-09-09', category: 'HOTEL', amount: '999999999999.99', currency: 'CNY', note: '接待费用', requestId: 'ed815f34-c216-46ba-9930-af585734ad16' };
    for (const [key, value] of Object.entries(payload)) form.set(key, value);
    form.set('file', new Blob([pdf], { type: 'application/pdf' }), 'receipt.pdf');
    assert.equal((await request('/expenses', 'ADMIN', { method: 'POST', body: form })).status, 201);
    const call = calls.at(-1);
    assert.equal(call.method, 'createExpense');
    assert.deepEqual({ ...call.args[1] }, payload);
    assert.deepEqual(call.args[2].buffer, pdf);
    assert.equal(call.args[2].size, pdf.length);
    const edit = new FormData();
    edit.set('note', '仅修改说明');
    assert.equal((await request('/expenses/12', 'ADMIN', { method: 'PATCH', body: edit })).status, 200);
    assert.equal(calls.at(-1).method, 'updateExpense');
    assert.equal(calls.at(-1).args[1], 12);
    assert.deepEqual({ ...calls.at(-1).args[2] }, { note: '仅修改说明' });
    assert.equal(calls.at(-1).args[3], undefined);
  });

  await t.test('oversized receipts and unexpected file fields never reach service', async () => {
    const before = calls.length;
    const big = new FormData();
    big.set('file', new Blob([Buffer.alloc(MAX_RECEIPT_BYTES + 1)]), 'big.pdf');
    assert.equal((await request('/expenses', 'ADMIN', { method: 'POST', body: big })).status, 413);
    const wrong = new FormData();
    wrong.set('unrecognised-file', new Blob([pdf]), 'receipt.pdf');
    assert.equal((await request('/expenses', 'ADMIN', { method: 'POST', body: wrong })).status, 400);
    assert.equal(calls.length, before);
  });

  await t.test('receipt download is an attachment with no-store and nosniff', async () => {
    const response = await request('/expenses/12/receipt');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.match(response.headers.get('content-disposition'), /^attachment;/);
    assert.ok(response.headers.get('content-disposition').includes(encodeURIComponent('费用凭证.pdf')));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
    assert.equal(calls.at(-1).args[1], 12);
  });

  await t.test('invalid path IDs are rejected before service dispatch', async () => {
    const before = calls.length;
    assert.equal((await request('/records/not-a-number', 'ADMIN', { method: 'DELETE' })).status, 400);
    assert.equal((await request('/expenses/1.5/receipt')).status, 400);
    assert.equal(calls.length, before);
  });
});
