// API amounts may be serialized Prisma decimals or calculated numeric values.
type MoneyValue = string | number
type Currency = 'CNY' | 'JPY'
type FundSettlementMode = 'COMPANY_DIRECT' | 'AGENT_NET' | 'COMPANY_REBATE'
type OrderStatus = 'PENDING_PAYMENT' | 'PARTIAL_PAID' | 'FULLY_PAID' | 'IN_SERVICE' | 'COMPLETED' | 'REFUNDED' | 'CANCELLED'
type PaymentConfirmStatus = 'PENDING' | 'CONFIRMED' | 'PROBLEM'
type RefundReason = 'SERVICE_FAILURE' | 'CUSTOMER' | 'VISA' | 'APPLICATION_FAILED' | 'OTHER'
type RefundStatus = 'PENDING' | 'APPROVED' | 'REFUNDED' | 'REJECTED' | 'ABNORMAL'
type RefundBearer = 'COMPANY' | 'THIRD_PARTY'
type CommissionStatus = 'SELF_DEDUCTED' | 'NOT_DUE' | 'PENDING_REVIEW' | 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED'

export interface PageResult<T> {
  items: T[]
  total: number
}

export interface CustomerOption {
  id: number
  name: string
  customerNo: string
}

interface OrderAmounts {
  id: number
  orderNo: string
  receivableAmount: MoneyValue
  paidAmount: MoneyValue
  unpaidAmount: MoneyValue
}

export interface Order extends OrderAmounts {
  currency: Currency
  signedAt: string
  unitPrice: MoneyValue | null
  quantity: number
  originalPrice: MoneyValue
  discountAmount: MoneyValue
  refundAmount: MoneyValue
  contractNo: string | null
  remark: string | null
  status: OrderStatus
}

export interface OrderListItem extends Order {
  customer: CustomerOption & { ownerUserId: number | null }
  product: { id: number; name: string }
  salesPerson: { id: number; name: string } | null
}

export interface OrderDetails extends Order {
  customer: CustomerOption
  product: { id: number; name: string }
  payments: Payment[]
  refunds: Refund[]
}

export interface OrderEditValues {
  unitPrice: number
  quantity: number
  discountAmount?: number
  contractNo?: string | null
  signedAt?: string
  remark?: string | null
}

export interface OrderCreateValues extends OrderEditValues {
  customerId: number
  productId: number
  currency: Currency
  firstPaymentAmount: number
  firstPaymentPaidAt?: string
  tailPaymentAmount?: number
}

export interface Payment {
  id: number
  paymentNo: string
  amount: MoneyValue
  currency: Currency
  confirmStatus: PaymentConfirmStatus
  confirmedAt: string | null
  createdAt: string
  method: string | null
  remark: string | null
}

export interface PaymentListItem extends Payment {
  order: OrderAmounts
  customer: {
    id: number
    name: string
    channelNameSnapshot: string | null
    channel: { id: number; name: string } | null
    acquisitionChannel: { id: number; name: string } | null
  }
}

export interface PaymentCreateValues {
  orderId: number
  amount: number
}

export interface PaymentEditValues {
  amount: number
  method?: string | null
  remark?: string | null
}

export interface Refund {
  id: number
  refundNo: string
  appliedAt: string
  completedAt: string | null
  createdAt: string
  nominalAmount: MoneyValue
  cashAmount: MoneyValue
  offsetAmount: MoneyValue
  reason: RefundReason
  bearer: RefundBearer
  status: RefundStatus
}

export interface RefundListItem extends Refund {
  customer: { id: number; name: string }
}

export interface RefundCreateValues {
  orderId: number
  refundPercent: number
  reason: RefundReason
  reasonNote?: string
  bearer: RefundBearer
  appliedAt?: string
}

interface CommissionBase {
  id: number
  recordKey: string
  customer: { name: string }
  order: { orderNo: string }
  channelNameSnapshot: string
  fundSettlementMode: FundSettlementMode
  currency: Currency
  payableAmount: MoneyValue
  paidAmount: MoneyValue
  status: CommissionStatus
  suspended: boolean
}

// Per-payment settlement rows include parent actions only on the first installment.
export type CommissionListItem = CommissionBase & (
  | {
    isPaymentInstallment: true
    parentStatus: CommissionStatus
    installmentIndex: number
    paymentId: number
    paymentNo: string
    paymentRemark: string | null
  }
  | {
    isPaymentInstallment?: false
    paymentId?: never
    paymentNo?: never
    paymentRemark?: never
  }
)

export interface CommissionPaymentResult {
  id: number
  paymentNo?: string
  payable: number
  offset: number
  cashOut: number
}

export interface CashAccount {
  orderId: number
  customerName: string
  channelName: string
  rebateStatus: '未到账' | '部分自扣' | '已自扣' | '未返佣' | '部分返佣' | '已返佣' | '无返佣'
  fundSettlementMode: FundSettlementMode
  currency: Currency
  contractAmount: number
  actualReceived: number
  balance: number
}
