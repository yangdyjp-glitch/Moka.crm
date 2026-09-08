import assert from 'node:assert/strict'
import test from 'node:test'
import { AxiosError } from 'axios'
import { apiErrorMessage, getErrorMessage } from '../src/api/errors.ts'

function apiError(data) {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    data, status: 400, statusText: 'Bad Request', headers: {}, config: {},
  })
}

test('returns a nonempty server-provided error message', () => {
  assert.equal(getErrorMessage(apiError({ message: '项目名称已存在' }), '操作失败'), '项目名称已存在')
})

test('joins validation error strings while ignoring nonstring array items', () => {
  assert.equal(getErrorMessage(apiError({ message: ['name is required', 12, null, 'price must be a number'] }), '操作失败'),
    'name is required；price must be a number')
})

test('falls back for missing, empty, or unsupported server messages', () => {
  for (const data of [undefined, null, {}, { message: '' }, { message: [] }, { message: [null, 1] }, { message: 123 }]) {
    assert.equal(getErrorMessage(apiError(data), '操作失败'), '操作失败')
  }
})

test('falls back for network failures and unrelated exceptions', () => {
  for (const error of [new AxiosError('Network Error'), new Error('failure'), null, undefined, 'failure',
    { response: { data: { message: 'not an Axios error' } } }]) {
    assert.equal(getErrorMessage(error, '操作失败'), '操作失败')
  }
})

test('TY error entry point shares safe parsing of API error messages', () => {
  assert.equal(apiErrorMessage(apiError({ message: '项目名称已存在' }), '操作失败'), '项目名称已存在')
  assert.equal(apiErrorMessage(apiError({ message: ['name is required', 12, null, 'price must be a number'] }), '操作失败'),
    'name is required；price must be a number')
  assert.equal(apiErrorMessage({ response: { data: { message: 'not an Axios error' } } }, '操作失败'), '操作失败')
})

test('TY local validation errors retain their message while Moka fallback contract stays unchanged', () => {
  const error = new Error('本次支付不能超过待支付余额')
  assert.equal(apiErrorMessage(error, '操作失败'), '本次支付不能超过待支付余额')
  assert.equal(getErrorMessage(error, '操作失败'), '操作失败')
  assert.equal(apiErrorMessage(new Error(''), '操作失败'), '操作失败')
})

test('empty and whitespace server messages do not produce empty error notifications', () => {
  for (const message of ['   ', ['', '  '], [' ', null]]) {
    assert.equal(getErrorMessage(apiError({ message }), '操作失败'), '操作失败')
    assert.equal(apiErrorMessage(apiError({ message }), '操作失败'), 'Request failed')
  }
})
