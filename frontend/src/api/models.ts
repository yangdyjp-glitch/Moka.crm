/** Prisma Decimal values are serialized as strings; form controls use numbers. */
export type DecimalValue = number | string

export interface ProductOption {
  id: number
  name: string
  category: string | null
  standardPrice: DecimalValue
  minPrice: DecimalValue | null
  currency: string
  status: string
  allowDiscount: boolean
  participateCommission: boolean
  servicePeriodDays: number | null
  remark: string | null
}

export interface ChannelOption {
  id: number
  channelNo: string
  name: string
  channelType: string
  defaultCommissionRate: DecimalValue | null
  defaultCommissionAmount: DecimalValue | null
  commissionMethod: string
  fundSettlementMode: string
  settlementCondition: string
}

export interface AcquisitionChannelOption {
  id: number
  name: string
  active: boolean
}

export interface UserOption {
  id: number
  name: string
  username: string
  role: string
}
