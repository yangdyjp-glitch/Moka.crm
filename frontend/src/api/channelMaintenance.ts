export type MaintenanceCurrency = 'CNY' | 'JPY'
export type ExpenseCategory = 'HOTEL' | 'TRANSPORT' | 'GIFT' | 'ENTERTAINMENT'

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  HOTEL: '酒店', TRANSPORT: '交通', GIFT: '伴手礼', ENTERTAINMENT: '宴请',
}

export interface MaintenanceChannel {
  id: number
  name: string
  channelType: string
}

interface Creator {
  id: number
  name: string
  username: string
}

export interface MaintenanceRecord {
  id: number
  channelId: number
  maintainedAt: string
  content: string
  nextMaintenanceAt: string | null
  createdBy: Creator | null
  channel: MaintenanceChannel
}

export interface ExpenseReceipt {
  id: number
  fileName: string
  contentType: string
  size: number
}

export interface MaintenanceExpense {
  id: number
  channelId: number
  incurredAt: string
  category: ExpenseCategory
  amount: string
  currency: MaintenanceCurrency
  note: string | null
  createdBy: Creator | null
  channel: MaintenanceChannel
  receipt: ExpenseReceipt | null
}

export interface MaintenancePage<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

export interface ExpensePage extends MaintenancePage<MaintenanceExpense> {
  summary: Record<MaintenanceCurrency, string>
}

export interface MaintenanceFilters {
  channelId?: number
  startDate?: string
  endDate?: string
}

export interface RecordValues {
  channelId: number
  maintainedAt: string
  content: string
  nextMaintenanceAt?: string
}

export interface ExpenseValues {
  channelId: number
  incurredAt: string
  category: ExpenseCategory
  amount: string
  currency: MaintenanceCurrency
  note?: string
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2100-12-31') return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function amountError(value: string, currency: MaintenanceCurrency): string | undefined {
  const amount = value.trim()
  const pattern = currency === 'JPY' ? /^\d+$/ : /^\d+(?:\.\d{1,2})?$/
  if (!pattern.test(amount)) return currency === 'JPY' ? '日元金额必须为整数' : '人民币金额最多保留两位小数'
  if (!/[1-9]/.test(amount)) return '金额必须大于 0'
  if (amount.split('.')[0].length > 12) return '金额整数部分不能超过 12 位'
  return undefined
}

export function amountInputValue(amount: string, currency: MaintenanceCurrency): string {
  return currency === 'JPY' ? amount.replace(/\.0+$/, '') : amount
}

/** Format database decimal strings without rounding large totals through Number. */
export function formatMaintenanceAmount(amount: string, currency: MaintenanceCurrency): string {
  const [integer, fraction = ''] = amount.split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return currency === 'CNY' ? `${grouped}.${fraction.padEnd(2, '0')}` : grouped
}

export function receiptError(file: Pick<File, 'type' | 'size'>): string | undefined {
  if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type)) {
    return '凭证仅支持 PNG、JPG、WebP 或 PDF'
  }
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) return '凭证必须大于 0 且不超过 5 MiB'
  return undefined
}

export function recordPayload(values: RecordValues, requestId?: string) {
  return {
    channelId: values.channelId,
    maintainedAt: values.maintainedAt,
    content: values.content.trim(),
    nextMaintenanceAt: values.nextMaintenanceAt || null,
    ...(requestId ? { requestId } : {}),
  }
}

/** No file/remove flag on edits means preserve the existing receipt. */
export function expensePayload(
  values: ExpenseValues,
  options: { requestId?: string; file?: File | null; removeReceipt?: boolean } = {},
): FormData {
  const data = new FormData()
  data.set('channelId', String(values.channelId))
  data.set('incurredAt', values.incurredAt)
  data.set('category', values.category)
  data.set('amount', values.amount.trim())
  data.set('currency', values.currency)
  data.set('note', values.note?.trim() ?? '')
  if (options.requestId) data.set('requestId', options.requestId)
  if (options.file) data.set('file', options.file)
  else if (options.removeReceipt) data.set('removeReceipt', 'true')
  return data
}
