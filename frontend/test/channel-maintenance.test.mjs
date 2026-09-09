import assert from 'node:assert/strict'
import test from 'node:test'
import {
  amountError, amountInputValue, expensePayload, formatMaintenanceAmount, isCalendarDate, receiptError, recordPayload,
} from '../src/api/channelMaintenance.ts'

test('maintenance accepts real calendar dates without timezone conversion', () => {
  for (const value of ['2026-09-09', '2024-02-29', '2026-12-31']) assert.equal(isCalendarDate(value), true)
  for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-01', '', '2026-09-09T00:00:00Z', '1899-12-31', '2101-01-01']) {
    assert.equal(isCalendarDate(value), false)
  }
})

test('CNY accepts positive amounts up to two decimals and twelve integer digits', () => {
  for (const value of ['1', '0.01', '12.30', ' 123.45 ', '999999999999.99']) assert.equal(amountError(value, 'CNY'), undefined)
  for (const value of ['', '0', '0.00', '-1', '1.001', '1000000000000', '0000000000001', '1e5', 'NaN', '1,000', '.1']) {
    assert.equal(typeof amountError(value, 'CNY'), 'string')
  }
})

test('JPY requires positive integers and edits only strip a zero fraction', () => {
  for (const value of ['1', '5000', '999999999999']) assert.equal(amountError(value, 'JPY'), undefined)
  for (const value of ['0', '-1', '1.0', '0.1', '1000000000000']) assert.equal(typeof amountError(value, 'JPY'), 'string')
  assert.equal(amountInputValue('123.00', 'JPY'), '123')
  assert.equal(amountInputValue('123.50', 'JPY'), '123.50')
  assert.equal(amountInputValue('123.40', 'CNY'), '123.40')
})

test('money display preserves large decimal totals and keeps currencies separate', () => {
  assert.equal(formatMaintenanceAmount('9007199254740993.10', 'CNY'), '9,007,199,254,740,993.10')
  assert.equal(formatMaintenanceAmount('12000', 'JPY'), '12,000')
  assert.equal(formatMaintenanceAmount('0', 'CNY'), '0.00')
})

test('receipt validation accepts only supported nonempty files of at most 5 MiB', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']) {
    assert.equal(receiptError({ type, size: 5 * 1024 * 1024 }), undefined)
  }
  for (const value of [{ type: 'text/html', size: 10 }, { type: '', size: 10 }, { type: 'image/png', size: 0 },
    { type: 'application/pdf', size: 5 * 1024 * 1024 + 1 }]) assert.equal(typeof receiptError(value), 'string')
})

test('record payload trims text, explicitly clears next contact and retains an idempotency key', () => {
  const values = { channelId: 1, maintainedAt: '2026-09-09', content: ' 电话沟通 ', nextMaintenanceAt: '' }
  const payload = recordPayload(values, 'same-request-key')
  assert.deepEqual(payload, { channelId: 1, maintainedAt: '2026-09-09', content: '电话沟通', nextMaintenanceAt: null, requestId: 'same-request-key' })
  assert.deepEqual(recordPayload(values, 'same-request-key'), payload)
  assert.equal(Object.hasOwn(recordPayload(values), 'requestId'), false)
  assert.equal(recordPayload({ ...values, nextMaintenanceAt: '2026-09-20' }).nextMaintenanceAt, '2026-09-20')
})

const expense = { channelId: 3, incurredAt: '2026-09-09', category: 'HOTEL', amount: ' 123.40 ', currency: 'CNY', note: ' 出差 ' }
test('expense form preserves exact decimal text and sends empty notes to clear existing values', () => {
  assert.deepEqual(Object.fromEntries(expensePayload(expense, { requestId: 'stable-request' })), {
    channelId: '3', incurredAt: '2026-09-09', category: 'HOTEL', amount: '123.40', currency: 'CNY', note: '出差', requestId: 'stable-request',
  })
  assert.equal(expensePayload({ ...expense, note: undefined }).get('note'), '')
})

test('editing an expense retains the receipt unless explicitly removed or replaced', () => {
  const untouched = expensePayload(expense)
  assert.equal(untouched.has('file'), false)
  assert.equal(untouched.has('removeReceipt'), false)
  assert.equal(untouched.has('requestId'), false)
  const removed = expensePayload(expense, { removeReceipt: true })
  assert.equal(removed.get('removeReceipt'), 'true')
  const file = new File(['%PDF-1.7'], 'receipt.pdf', { type: 'application/pdf' })
  const replaced = expensePayload(expense, { file, removeReceipt: true })
  assert.equal(replaced.get('file').name, 'receipt.pdf')
  assert.equal(replaced.has('removeReceipt'), false)
})
