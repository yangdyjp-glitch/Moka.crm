import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { act, createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useRemoteData } from '../src/hooks/useRemoteData.ts'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fixture(t, initialData = []) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const root = createRoot(document.getElementById('root'))
  let result
  let mounted = true
  function Probe({ loader }) {
    result = useRemoteData(loader, initialData)
    return createElement('output', { 'data-loading': result.loading }, JSON.stringify(result.data))
  }
  const unmount = async () => {
    if (mounted) {
      await act(async () => root.unmount())
      mounted = false
    }
  }
  t.after(async () => {
    await unmount()
    dom.window.close()
    delete globalThis.window
    delete globalThis.document
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  })
  return {
    get state() { return result },
    render: (loader, strict = false) => act(async () => {
      const probe = createElement(Probe, { loader })
      root.render(strict ? createElement(StrictMode, null, probe) : probe)
    }),
    unmount,
  }
}

test('initial load, successful rows, and stable rerenders do not loop requests', async (t) => {
  const pending = deferred()
  let calls = 0
  const loader = () => { calls++; return pending.promise }
  const view = fixture(t)
  await view.render(loader)
  assert.equal(view.state.loading, true)
  assert.deepEqual(view.state.data, [])
  await act(async () => pending.resolve([{ id: 1 }]))
  assert.equal(view.state.loading, false)
  assert.deepEqual(view.state.data, [{ id: 1 }])
  await view.render(loader)
  assert.equal(calls, 1)
})

test('rapid filter changes ignore an older response that finishes last', async (t) => {
  const oldSearch = deferred(), newSearch = deferred()
  const view = fixture(t)
  await view.render(() => oldSearch.promise)
  await view.render(() => newSearch.promise)
  await act(async () => newSearch.resolve([{ name: 'new filter' }]))
  await act(async () => oldSearch.resolve([{ name: 'old filter' }]))
  assert.deepEqual(view.state.data, [{ name: 'new filter' }])
  assert.equal(view.state.loading, false)
})

test('a new detail loader clears old records, including when the new request fails', async (t) => {
  const view = fixture(t, null)
  await view.render(async () => ({ id: 1, name: 'Customer One' }))
  assert.equal(view.state.data.id, 1)
  const second = deferred()
  await view.render(() => second.promise)
  assert.equal(view.state.data, null)
  assert.equal(view.state.loading, true)
  const error = new Error('Customer Two unavailable')
  await act(async () => second.reject(error))
  assert.equal(view.state.data, null)
  assert.equal(view.state.loading, false)
  assert.equal(view.state.error, error)
})

test('reload after a write preserves visible rows until fresh data arrives', async (t) => {
  const requests = []
  const loader = () => { const request = deferred(); requests.push(request); return request.promise }
  const view = fixture(t)
  await view.render(loader)
  await act(async () => requests[0].resolve([{ id: 1, name: 'before save' }]))
  const reload = view.state.reload
  await act(async () => reload())
  assert.equal(view.state.loading, true)
  assert.equal(view.state.data[0].name, 'before save')
  await act(async () => requests[1].resolve([{ id: 1, name: 'after save' }]))
  assert.equal(view.state.loading, false)
  assert.equal(view.state.data[0].name, 'after save')
  assert.equal(view.state.reload, reload)
})

test('reload failures retain the same query data and retry clears the error', async (t) => {
  const requests = []
  const loader = () => { const request = deferred(); requests.push(request); return request.promise }
  const view = fixture(t)
  await view.render(loader)
  await act(async () => requests[0].resolve([{ id: 1 }]))
  await act(async () => view.state.reload())
  const error = new Error('Network failed')
  await act(async () => requests[1].reject(error))
  assert.deepEqual(view.state.data, [{ id: 1 }])
  assert.equal(view.state.error, error)
  assert.equal(view.state.loading, false)
  await act(async () => view.state.reload())
  assert.equal(view.state.error, null)
  await act(async () => requests[2].resolve([{ id: 2 }]))
  assert.deepEqual(view.state.data, [{ id: 2 }])
  assert.equal(view.state.error, null)
})

test('superseded errors cannot overwrite a successful filter result', async (t) => {
  const oldRequest = deferred()
  const view = fixture(t)
  await view.render(() => oldRequest.promise)
  await view.render(async () => ['current'])
  await act(async () => oldRequest.reject(new Error('old error')))
  assert.deepEqual(view.state.data, ['current'])
  assert.equal(view.state.error, null)
})

test('unmount ignores outstanding requests', async (t) => {
  const pending = deferred()
  const view = fixture(t)
  await view.render(() => pending.promise)
  const previous = view.state
  await view.unmount()
  await act(async () => pending.resolve(['late result']))
  assert.equal(view.state, previous)
})

test('StrictMode cleanup prevents its discarded request from winning', async (t) => {
  const requests = []
  const loader = () => { const request = deferred(); requests.push(request); return request.promise }
  const view = fixture(t)
  await view.render(loader, true)
  assert.equal(requests.length, 2)
  await act(async () => requests[1].resolve(['active request']))
  await act(async () => requests[0].resolve(['discarded request']))
  assert.deepEqual(view.state.data, ['active request'])
})
