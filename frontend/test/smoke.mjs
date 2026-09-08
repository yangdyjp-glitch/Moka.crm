// Run after npm run build: node --experimental-vm-modules test/smoke.mjs.
// Uses the real compiled app, including lazy-loaded chunks, and local-only HTTP fixtures.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { MessageChannel } from 'node:worker_threads'
import * as vm from 'node:vm'
import { JSDOM, VirtualConsole } from 'jsdom'

const assets = new URL('../dist/assets/', import.meta.url)
const assetNames = new Set(await readdir(assets))
const builtHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
const bundleName = builtHtml.match(/<script\b[^>]*\bsrc="\/assets\/([^"]+\.js)"/)?.[1]
assert.ok(bundleName, 'Build the frontend before running the smoke test')
assert.ok(assetNames.has(bundleName), 'The HTML entry must exist in the build assets')
assert.equal(typeof vm.SourceTextModule, 'function', 'Run node --experimental-vm-modules test/smoke.mjs')
const customer = {
  id: 1, customerNo: 'KH000001', name: '测试客户', phone: null, wechat: null, email: null,
  sourceCategory: 'SELF', mainStatus: 'NEW_LEAD', intentionLevel: 'A', ownerUserId: 1,
  ownerName: '测试管理员', discoveredAt: null, createdAt: '2026-09-07T00:00:00Z',
  channel: null, acquisitionChannel: { id: 1, name: '测试获客渠道' },
  salesStage: 'NOT_CONTACTED', hasProblem: false, commissionRateSnapshot: null,
  nextFollowUpAt: null, remark: null, followUps: [], orders: [], referrals: [],
}
const product = {
  id: 1, name: '测试产品', category: null, standardPrice: '1250.50', minPrice: null,
  currency: 'JPY', allowDiscount: true, participateCommission: true, status: 'active',
  servicePeriodDays: null, remark: null,
}
const channel = {
  id: 1, channelNo: 'QD000001', name: '测试第三方渠道', channelType: 'INDIVIDUAL',
  defaultCommissionRate: '12.500', defaultCommissionAmount: null,
  commissionMethod: 'NET_RECEIVED_RATIO', fundSettlementMode: 'COMPANY_REBATE',
  settlementCondition: 'ON_SERVICE_COMPLETE', contactName: null, contactInfo: null,
}
const originalOrder = {
  id: 1, orderNo: 'DD000001', customer, product, currency: 'JPY', unitPrice: '1250.50',
  quantity: 2, originalPrice: '2501.00', discountAmount: '1.00', receivableAmount: '2500.00',
  paidAmount: '500.00', unpaidAmount: '2000.00', refundAmount: '0.00', status: 'PARTIAL_PAID',
  signedAt: '2026-09-07T00:00:00Z', contractNo: null, remark: null,
  salesPerson: { id: 1, name: '测试管理员' }, payments: [], refunds: [],
}
const payment = {
  id: 1, paymentNo: 'SK000001', amount: '500.00', currency: 'JPY', confirmStatus: 'CONFIRMED',
  confirmedAt: '2026-09-07T01:00:00Z', createdAt: '2026-09-07T00:00:00Z', method: null,
  remark: null, order: originalOrder, customer,
}
const refund = {
  id: 1, refundNo: 'TK000001', customer, appliedAt: '2026-09-07T00:00:00Z',
  createdAt: '2026-09-07T00:00:00Z', completedAt: null, nominalAmount: '100.00',
  cashAmount: '100.00', offsetAmount: '0.00', reason: 'CUSTOMER', bearer: 'COMPANY', status: 'PENDING',
}
const commission = {
  id: 1, recordKey: 'commission-1', customer, order: originalOrder, channelNameSnapshot: channel.name,
  fundSettlementMode: 'COMPANY_REBATE', currency: 'JPY', payableAmount: '62.50',
  paidAmount: '0.00', status: 'PENDING_REVIEW', suspended: false,
}
const page = (items) => ({ items, total: items.length })
const financeSummary = (currency) => ({
  currency, orderCount: 1, receivableAmount: 2500, confirmedReceived: 500, unpaidAmount: 2000,
  refundAmount: 0, channelPayable: 62.5, channelSettled: 0, pendingAgentDeduction: 0,
  pendingRebate: 62.5, companyActualReceived: 500, balance: 437.5,
})
const dashboard = (role) => ({
  role,
  counts: {
    custTotal: 1, newToday: 1, newMonth: 1, signedMonth: 1, problem: 0,
    pendingReview: 1, pendingPay: 0, myCustomers: 1, overdue: 0,
    registeredTotal: 1, registeredMonth: 1, total: 1,
  },
  leadStats: { channels: [], products: [], sales: [] },
  trend: [{ date: '2026-09-07', label: '09-07', leads: 1, signed: 1 }],
  byCurrency: { orders: [{ currency: 'JPY', _sum: { receivableAmount: '2500.00', paidAmount: '500.00' } }] },
  byStatus: [{ mainStatus: 'NEW_LEAD', _count: 1 }],
  referrals: [{ currency: 'JPY', collectionStatus: 'PENDING', _count: 1, _sum: { commissionAmount: '50.00' } }],
})

let activeCase
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
    const name = url.pathname.slice('/assets/'.length)
    if (!assetNames.has(name)) {
      response.writeHead(404)
      response.end('Unknown local build asset')
      return
    }
    response.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : 'application/javascript')
    response.end(await readFile(new URL(name, assets)))
    return
  }
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString()
  const body = text ? JSON.parse(text) : null
  const record = { method: request.method, path: url.pathname, body }
  activeCase.requests.push(record)
  let value
  if (request.method === 'PATCH' && url.pathname === '/api/orders/1') {
    activeCase.order = {
      ...activeCase.order, ...body,
      payments: [{ ...payment, remark: '已收到本地模拟保存响应' }],
    }
    value = activeCase.order
  } else if (request.method === 'GET') {
    const fixtures = {
      '/api/notifications/unread-count': { count: 0 },
      '/api/notifications': [],
      '/api/reports/dashboard': dashboard(activeCase.role),
      '/api/customers': page([customer]),
      '/api/customers/1': { ...customer, orders: [activeCase.order] },
      '/api/attachments': [],
      '/api/orders': page([activeCase.order]),
      '/api/orders/1': activeCase.order,
      '/api/payments': [payment],
      '/api/refunds': [refund],
      '/api/commissions': page([commission]),
      '/api/commissions/cash-accounts': page([{
        orderId: 1, customerName: customer.name, channelName: channel.name, rebateStatus: '未返佣',
        fundSettlementMode: 'COMPANY_REBATE', currency: 'JPY', contractAmount: 2500,
        actualReceived: 500, balance: 437.5,
      }]),
      '/api/products': [product],
      '/api/channels': [channel],
      '/api/channels/options': [channel],
      '/api/acquisition-channels/all': [{ id: 1, name: '测试获客渠道', active: true }],
      '/api/acquisition-channels': [{ id: 1, name: '测试获客渠道', active: true }],
      '/api/reports/channels': [],
      '/api/reports/sales': [],
      '/api/reports/finance': { summary: [financeSummary('JPY'), financeSummary('CNY')], byMode: [], bySales: [], byProduct: [] },
      '/api/users': [
        { id: 1, username: 'smoke_admin', name: '测试管理员', role: 'ADMIN', status: 'active' },
        { id: 2, username: 'smoke_sales', name: '测试销售', role: 'SALES', status: 'active' },
      ],
      '/api/audit-logs': [{ id: 1, createdAt: '2026-09-07T00:00:00Z', operatorId: 1, relatedType: 'Refund', relatedId: 1, action: 'APPROVE_REFUND', newValue: '测试审计记录' }],
      '/api/auth/impersonation-logs': [{ id: 1, createdAt: '2026-09-07T00:00:00Z', action: 'start', actorId: 1, actorName: '测试管理员', actorUsername: 'smoke_admin', targetUserId: 2, targetName: '测试销售', targetUsername: 'smoke_sales' }],
    }
    value = fixtures[url.pathname]
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (value === undefined) {
    activeCase.errors.push(`Unexpected request: ${record.method} ${record.path}`)
    response.writeHead(404)
    response.end(JSON.stringify({ message: 'Unconfigured local fixture' }))
  } else {
    response.end(JSON.stringify(value))
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

async function evaluateBuild(dom) {
  const context = dom.getInternalVMContext()
  const modules = new Map()
  let linkQueue = Promise.resolve()
  const load = (url) => {
    const name = url.pathname.slice('/assets/'.length)
    assert.ok(url.origin === origin && url.pathname.startsWith('/assets/') && assetNames.has(name), `Blocked non-build module: ${url.href}`)
    if (!modules.has(url.href)) {
      modules.set(url.href, readFile(new URL(name, assets), 'utf8').then((source) => new vm.SourceTextModule(source, {
        context,
        identifier: url.href,
        initializeImportMeta(meta) { meta.url = url.href },
        async importModuleDynamically(specifier, parent) {
          const child = await load(new URL(specifier, parent.identifier))
          await link(child)
          await child.evaluate()
          return child
        },
      })))
    }
    return modules.get(url.href)
  }
  const linker = (specifier, parent) => load(new URL(specifier, parent.identifier))
  const link = (module) => {
    const pending = linkQueue.then(async () => {
      if (module.status === 'unlinked') await module.link(linker)
    })
    linkQueue = pending.catch(() => {})
    return pending
  }
  const entry = await load(new URL(`/assets/${bundleName}`, origin))
  await link(entry)
  await entry.evaluate()
}

async function waitFor(check, description, timeout = 6000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out: ${description}`)
}

async function runCase({ role = 'ADMIN', path = '/', marker, endpoint, action }) {
  const state = { role, requests: [], errors: [], channels: [], order: structuredClone(originalOrder) }
  activeCase = state
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (error) => {
    // jsdom 26 does not parse every CSS rule emitted by Ant Design; no layout claims are made here.
    if (error.type !== 'css parsing') state.errors.push(error.stack || error.message)
  })
  virtualConsole.on('error', (...args) => state.errors.push(args.map(String).join(' ')))
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: origin + path, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
    beforeParse(window) {
      if (path !== '/login') {
        window.localStorage.setItem('token', 'local-smoke-session-only')
        window.localStorage.setItem('user', JSON.stringify({ id: 1, username: 'smoke_user', name: '测试管理员', role }))
      }
      window.structuredClone = structuredClone
      window.MessageChannel = class extends MessageChannel {
        constructor() { super(); state.channels.push(this) }
      }
      window.matchMedia = (query) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true } })
      window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
      const getComputedStyle = window.getComputedStyle.bind(window)
      window.getComputedStyle = (element) => getComputedStyle(element)
      const xhrOpen = window.XMLHttpRequest.prototype.open
      window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        const resolved = new URL(url, window.location.href)
        if (resolved.origin !== origin) {
          state.errors.push(`Blocked external XHR: ${resolved.origin}`)
          throw new Error('Only local smoke-test HTTP requests are allowed')
        }
        return xhrOpen.call(this, method, resolved.href, ...rest)
      }
      window.fetch = (url, options) => {
        const resolved = new URL(typeof url === 'string' ? url : url.url, window.location.href)
        if (resolved.origin !== origin) {
          state.errors.push(`Blocked external fetch: ${resolved.origin}`)
          return Promise.reject(new Error('Only local smoke-test HTTP requests are allowed'))
        }
        return fetch(resolved, options)
      }
      window.addEventListener('error', (event) => state.errors.push(event.error?.stack || event.message))
      window.addEventListener('unhandledrejection', (event) => state.errors.push(String(event.reason)))
    },
  })
  try {
    await evaluateBuild(dom)
    await waitFor(() => state.errors.length || (
      (dom.window.document.querySelector('main') || dom.window.document.querySelector('#root'))?.textContent.includes(marker)
      && (!endpoint || state.requests.some((request) => request.path === endpoint))
      && !dom.window.document.querySelector('.ant-spin-spinning')
    ), `${role} ${path} loaded ${marker}`)
    assert.deepEqual(state.errors, [], `${role} ${path} runtime errors`)
    if (action) await action(dom.window, state)
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.deepEqual(state.errors, [], `${role} ${path} runtime errors after interaction`)
    console.log(`PASS ${role} ${path}${action ? ' (additional checks verified)' : ''}`)
  } finally {
    dom.window.close()
    for (const channel of state.channels) { channel.port1.close(); channel.port2.close() }
  }
}

try {
  await runCase({
    role: 'SIGNED_OUT', path: '/login', marker: '客户与渠道管理系统',
    action(window, state) {
      assert.ok(window.document.querySelector('#username'))
      assert.ok(window.document.querySelector('#password'))
      assert.deepEqual(state.requests, [], 'Login render makes no authentication or backend calls')
    },
  })
  for (const [role, marker] of [
    ['ADMIN', '数据总览'], ['SALES', '我的业绩'], ['MARKET', '我登记的线索'],
    ['BUSINESS_SUPERVISOR', '营业主管总览'], ['DOWNSTREAM_SALES', '我的转介绍收佣'],
  ]) await runCase({ role, marker, endpoint: '/api/reports/dashboard' })

  for (const [path, marker, endpoint] of [
    ['/customers', '测试客户', '/api/customers'],
    ['/customers/1', '测试客户', '/api/customers/1'],
    ['/orders', 'DD000001', '/api/orders'],
    ['/payments', 'SK000001', '/api/payments'],
    ['/payments?tab=refunds', 'TK000001', '/api/refunds'],
    ['/commissions', '测试客户', '/api/commissions'],
    ['/products', '测试产品', '/api/products'],
    ['/channels', '测试第三方渠道', '/api/channels'],
    ['/reports', '财务', '/api/reports/finance'],
    ['/users', 'smoke_sales', '/api/users'],
    ['/audit-logs', '测试审计记录', '/api/audit-logs'],
  ]) await runCase({
    path, marker, endpoint,
    action: path === '/payments' ? (window, state) => {
      const row = [...window.document.querySelectorAll('tr')].find((element) => element.textContent.includes('SK000001'))
      assert.ok(row, 'Confirmed payment is visible')
      const deleteButton = [...row.querySelectorAll('button')].find((button) => button.textContent.includes('删除'))
      assert.ok(deleteButton?.disabled, 'Confirmed payment deletion is disabled')
      deleteButton.click()
      assert.ok(!state.requests.some((request) => request.method === 'DELETE'), 'A disabled action must not delete the payment')
    } : undefined,
  })

  await runCase({
    path: '/orders/1', marker: 'DD000001', endpoint: '/api/orders/1',
    async action(window, state) {
      const document = window.document
      await waitFor(() => document.querySelector('#unitPrice')?.value === '1250.5', 'Decimal unit price hydration')
      assert.equal(document.querySelector('#quantity').value, '2')
      assert.equal(document.querySelector('#discountAmount').value, '1')
      const save = [...document.querySelectorAll('button')].find((button) => button.textContent.replace(/\s/g, '') === '保存')
      assert.ok(save, 'Order detail Save button exists')
      save.click()
      await waitFor(() => state.requests.some((request) => request.method === 'PATCH'), 'order save request')
      const payload = state.requests.find((request) => request.method === 'PATCH').body
      assert.equal(payload.unitPrice, 1250.5)
      assert.equal(payload.quantity, 2)
      assert.equal(payload.discountAmount, 1)
      assert.equal(payload.originalPrice, 2501)
      assert.equal(Object.hasOwn(payload, 'contractNo'), false)
      assert.equal(Object.hasOwn(payload, 'remark'), false)
      await waitFor(() => document.querySelector('main')?.textContent.includes('已收到本地模拟保存响应'), 'order details update from the saved response')
    },
  })
  console.log('Compiled-app smoke checks passed: login render, five dashboard roles, eleven major routes, numeric order save and refresh. No production API was contacted.')
} finally {
  await new Promise((resolve) => server.close(resolve))
}
