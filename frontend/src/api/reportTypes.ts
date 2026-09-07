import type { DecimalValue } from './models'

export interface LeadCountRow {
  name: string
  customerCount: number
  signedCount: number
}
export interface ChannelLeadRow extends LeadCountRow { key: string; type: string }
export interface ProductLeadRow extends LeadCountRow { productId: number; category: string | null }
export interface SalesReportRow extends LeadCountRow { ownerUserId: number }
export interface TrendPoint { date: string; label: string; leads: number; signed: number }
export interface CurrencyOrderTotal {
  currency: string
  _sum: { receivableAmount: DecimalValue | null; paidAmount: DecimalValue | null }
}
interface CustomerStatusCount { mainStatus: string; _count: number }
interface SalesCounts { myCustomers: number; overdue: number; signedMonth: number }
export interface ReferralTotal {
  currency: string
  collectionStatus: string
  _count: number
  _sum: { commissionAmount: DecimalValue | null }
}

export type DashboardData =
  | {
    role: 'ADMIN'
    counts: { custTotal: number; newToday: number; newMonth: number; signedMonth: number; problem: number; pendingReview: number; pendingPay: number }
    leadStats: { channels: ChannelLeadRow[]; products: ProductLeadRow[]; sales: SalesReportRow[] }
    trend: TrendPoint[]
  }
  | { role: 'SALES'; counts: SalesCounts; byCurrency: { orders: CurrencyOrderTotal[] } }
  | {
    role: 'BUSINESS_SUPERVISOR'
    counts: SalesCounts & { registeredTotal: number; registeredMonth: number }
    byCurrency: { orders: CurrencyOrderTotal[] }
    byStatus: CustomerStatusCount[]
  }
  | { role: 'DOWNSTREAM_SALES'; referrals: ReferralTotal[] }
  | { role: 'MARKET'; counts: { total: number; newMonth: number }; byStatus: CustomerStatusCount[] }

export interface FinanceSummary {
  currency: string
  orderCount: number
  receivableAmount: number
  confirmedReceived: number
  unpaidAmount: number
  refundAmount: number
  channelPayable: number
  channelSettled: number
  pendingAgentDeduction: number
  pendingRebate: number
  companyActualReceived: number
  balance: number
}
export interface FinanceModeRow extends FinanceSummary { fundSettlementMode: string }
export interface FinanceSalesRow extends FinanceSummary { salesUserId: number | null; salesName: string }
export interface FinanceProductRow extends FinanceSummary { productId: number; productName: string }
export interface FinanceReport {
  summary: FinanceSummary[]
  byMode: FinanceModeRow[]
  bySales: FinanceSalesRow[]
  byProduct: FinanceProductRow[]
}
export interface ChannelReportRow {
  channelId: number
  currency: string
  channel: { id: number; name: string; channelType: string } | null
  _count: number
  _sum: { payableAmount: number; paidAmount: number; unpaidAmount: number }
}
