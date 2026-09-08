import assert from 'node:assert/strict'
import test from 'node:test'
import axios, { AxiosError, AxiosHeaders } from 'axios'
import { installGetCache } from '../src/api/cache.ts'

function response(config, data = '{"ok":true}', status = 200) {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Created',
    headers: new AxiosHeaders({ 'content-type': 'application/json', 'x-source': 'adapter' }),
    config,
    request: { source: 'fake-adapter' },
  }
}

function setup(adapter, now) {
  const calls = []
  const client = axios.create({
    baseURL: 'https://crm.invalid/api',
    adapter: async (config) => {
      calls.push(config)
      return adapter ? adapter(config, calls.length) : response(config)
    },
  })
  const clear = installGetCache(client, now)
  return { client, calls, clear }
}

test('GET cache hits retain data and isolate URLs, base URLs, and parameters', async () => {
  const { client, calls } = setup((config, sequence) => response(config, JSON.stringify({ sequence })))
  const first = await client.get('/customers', { params: { page: 1 } })
  const cached = await client.get('/customers', { params: { page: 1 } })
  assert.deepEqual(first.data, { sequence: 1 })
  assert.deepEqual(cached.data, first.data)
  assert.equal(calls.length, 1)

  assert.deepEqual((await client.get('/customers', { params: { page: 2 } })).data, { sequence: 2 })
  assert.deepEqual((await client.get('/orders', { params: { page: 1 } })).data, { sequence: 3 })
  assert.deepEqual((await client.get('/customers', {
    params: { page: 1 }, baseURL: 'https://other.invalid/api',
  })).data, { sequence: 4 })
  assert.deepEqual((await client.get('/customers', { params: { page: 1 } })).data, { sequence: 1 })
  assert.equal(calls.length, 4)
})

test('noCache and blob GET requests always bypass cached responses', async () => {
  const { client, calls } = setup((config, sequence) => response(config, String(sequence)))
  await client.get('/export')
  await client.get('/export', { noCache: true })
  await client.get('/export', { noCache: true })
  await client.get('/export', { responseType: 'blob' })
  await client.get('/export', { responseType: 'blob' })
  assert.equal(calls.length, 5)
  assert.equal((await client.get('/export')).data, 1)
  assert.equal(calls.length, 5)
})

test('GET cache expires exactly after 30 minutes and refreshes its timestamp', async () => {
  let time = 1_000
  const { client, calls } = setup((config, sequence) => response(config, String(sequence)), () => time)
  assert.equal((await client.get('/products')).data, 1)
  time += 30 * 60 * 1_000 - 1
  assert.equal((await client.get('/products')).data, 1)
  time += 1
  assert.equal((await client.get('/products')).data, 2)
  time += 1
  assert.equal((await client.get('/products')).data, 2)
  assert.equal(calls.length, 2)
})

for (const method of ['post', 'put', 'patch', 'delete']) {
  test(`successful ${method.toUpperCase()} invalidates all cached GET entries`, async () => {
    const { client, calls } = setup((config, sequence) => response(config, JSON.stringify({ sequence })))
    await client.get('/customers')
    await client.get('/orders')
    await client.get('/customers')
    assert.equal(calls.length, 2)
    await client.request({ method, url: '/customers/1', data: { name: 'Updated' } })
    assert.deepEqual((await client.get('/customers')).data, { sequence: 4 })
    assert.deepEqual((await client.get('/orders')).data, { sequence: 5 })
    assert.equal(calls.length, 5)
  })
}

test('failed writes preserve existing cached GET responses', async () => {
  const { client, calls } = setup((config) => {
    if (config.method === 'patch') {
      throw new AxiosError('Write failed', 'ERR_BAD_RESPONSE', config, undefined,
        response(config, '{"message":"Write failed"}', 500))
    }
    return response(config, '{"name":"Existing"}')
  })
  await client.get('/customers')
  await assert.rejects(client.patch('/customers/1', { name: 'Updated' }), /Write failed/)
  assert.deepEqual((await client.get('/customers')).data, { name: 'Existing' })
  assert.equal(calls.length, 2)
})

test('a GET completing after successful write cannot repopulate stale cache', async () => {
  let finishFirstGet
  let firstGetStarted
  const started = new Promise((resolve) => { firstGetStarted = resolve })
  let getCount = 0
  const { client } = setup((config) => {
    if (config.method === 'get') {
      getCount += 1
      if (getCount === 1) {
        firstGetStarted()
        return new Promise((resolve) => {
          finishFirstGet = () => resolve(response(config, '{"name":"Old"}'))
        })
      }
      return response(config, '{"name":"New"}')
    }
    return response(config)
  })

  const staleRequest = client.get('/customers')
  await started
  await client.patch('/customers/1', { name: 'New' })
  finishFirstGet()
  assert.deepEqual((await staleRequest).data, { name: 'Old' })
  assert.deepEqual((await client.get('/customers')).data, { name: 'New' })
  assert.deepEqual((await client.get('/customers')).data, { name: 'New' })
  assert.equal(getCount, 2)
})

test('manual clear invalidates cached responses', async () => {
  const { client, calls, clear } = setup()
  await client.get('/customers')
  clear()
  await client.get('/customers')
  assert.equal(calls.length, 2)
})

test('an earlier GET finishing last cannot overwrite a newer response for the same key', async () => {
  let finishFirstGet
  let firstGetStarted
  const started = new Promise((resolve) => { firstGetStarted = resolve })
  let getCount = 0
  const { client } = setup((config) => {
    getCount += 1
    if (getCount === 1) {
      firstGetStarted()
      return new Promise((resolve) => {
        finishFirstGet = () => resolve(response(config, '{"revision":"old"}'))
      })
    }
    return response(config, '{"revision":"new"}')
  })
  const first = client.get('/customers')
  await started
  assert.deepEqual((await client.get('/customers')).data, { revision: 'new' })
  finishFirstGet()
  assert.deepEqual((await first).data, { revision: 'old' })
  assert.deepEqual((await client.get('/customers')).data, { revision: 'new' })
  assert.equal(getCount, 2)
})

test('request ordering is independent for different GET keys', async () => {
  let finishCustomers
  let customersStarted
  const started = new Promise((resolve) => { customersStarted = resolve })
  const { client, calls } = setup((config) => {
    if (config.url === '/customers') {
      customersStarted()
      return new Promise((resolve) => {
        finishCustomers = () => resolve(response(config, '{"source":"customers"}'))
      })
    }
    return response(config, '{"source":"orders"}')
  })
  const customers = client.get('/customers')
  await started
  await client.get('/orders')
  finishCustomers()
  await customers
  assert.deepEqual((await client.get('/customers')).data, { source: 'customers' })
  assert.deepEqual((await client.get('/orders')).data, { source: 'orders' })
  assert.equal(calls.length, 2)
})

test('an already-aborted request rejects even when a GET cache entry exists', async () => {
  const { client, calls } = setup()
  await client.get('/customers')
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(client.get('/customers', { signal: controller.signal }), axios.isCancel)
  assert.equal(calls.length, 1)
})

test('an adapter finishing after request cancellation does not populate the GET cache', async () => {
  let finishFirstGet
  let firstGetStarted
  const started = new Promise((resolve) => { firstGetStarted = resolve })
  const { client, calls } = setup((config, sequence) => {
    if (sequence === 1) {
      firstGetStarted()
      return new Promise((resolve) => {
        finishFirstGet = () => resolve(response(config, '{"cancelled":true}'))
      })
    }
    return response(config, '{"cancelled":false}')
  })
  const controller = new AbortController()
  const first = client.get('/customers', { signal: controller.signal })
  await started
  controller.abort()
  finishFirstGet()
  await assert.rejects(first, axios.isCancel)
  assert.deepEqual((await client.get('/customers')).data, { cancelled: false })
  assert.equal(calls.length, 2)
})

test('cached responses use current request config and preserve response metadata', async () => {
  const { client, calls } = setup((config) => response(config, '{"id":1}', 201))
  await client.get('/customers', { headers: { 'x-trace': 'first' } })
  const cached = await client.get('/customers', { headers: { 'x-trace': 'second' } })
  assert.equal(calls.length, 1)
  assert.equal(cached.config.headers.get('x-trace'), 'second')
  assert.equal(cached.status, 201)
  assert.equal(cached.statusText, 'Created')
  assert.equal(cached.headers.get('x-source'), 'adapter')
  assert.deepEqual(cached.request, { source: 'fake-adapter' })
  assert.deepEqual(cached.data, { id: 1 })
})

test('response transforms run once per request over the original adapter data', async () => {
  const { client, calls } = setup((config) => response(config, 'raw'))
  const transformResponse = [(data) => `${data}!`]
  assert.equal((await client.get('/transform', { transformResponse })).data, 'raw!')
  assert.equal((await client.get('/transform', { transformResponse })).data, 'raw!')
  assert.equal((await client.get('/transform', { transformResponse: [(data) => `${data}?`] })).data, 'raw?')
  assert.equal(calls.length, 1)
})

test('rejected GET responses are retried instead of cached', async () => {
  const { client, calls } = setup((config, sequence) => {
    if (sequence === 1) {
      throw new AxiosError('Read failed', 'ERR_BAD_RESPONSE', config, undefined,
        response(config, '{"message":"Read failed"}', 500))
    }
    return response(config, '{"ok":true}')
  })
  await assert.rejects(client.get('/customers'), /Read failed/)
  assert.deepEqual((await client.get('/customers')).data, { ok: true })
  assert.equal(calls.length, 2)
})

test('in-place transforms and callers cannot mutate the raw cached payload', async () => {
  const { client, calls } = setup((config) => response(config, { nested: { visits: 0 } }))
  const transformResponse = [(data) => { data.nested.visits++; return data }]
  const first = await client.get('/object', { transformResponse })
  assert.equal(first.data.nested.visits, 1)
  first.data.nested.visits = 99
  const second = await client.get('/object', { transformResponse })
  assert.equal(second.data.nested.visits, 1)
  assert.equal(calls.length, 1)
})

test('non-cloneable adapter responses are returned successfully without caching', async () => {
  const data = { read: () => 'stream content' }
  const { client, calls } = setup((config) => response(config, data))
  assert.equal((await client.get('/stream')).data.read(), 'stream content')
  assert.equal((await client.get('/stream')).data.read(), 'stream content')
  assert.equal(calls.length, 2)
})
