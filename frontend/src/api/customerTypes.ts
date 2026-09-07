// Fields consumed by the customer screens, matching the customers service and DTOs.
export interface CustomerRecord {
  id: number
  customerNo: string
  name: string
  phone: string | null
  wechat: string | null
  email: string | null
  sourceCategory: string
  mainStatus: string
  intentionLevel: string | null
  ownerUserId: number | null
  discoveredAt: string | null
  createdAt: string
  channel: { id: number; name: string; channelType: string } | null
  acquisitionChannel: { id: number; name: string } | null
}

export interface CustomerListItem extends CustomerRecord {
  ownerName: string | null
}

export interface CustomerListResponse {
  items: CustomerListItem[]
  total: number
}

export interface CustomerFormValues {
  name: string
  phone?: string
  wechat?: string
  email?: string
  sourceCategory: string
  mainStatus?: string
  intentionLevel?: string | null
  ownerUserId?: number
  discoveredAt?: string
  channelId?: number | null
  acquisitionChannelId?: number | null
  remark?: string
}

export type CustomerUpdate = Partial<Pick<CustomerFormValues,
  'name' | 'mainStatus' | 'intentionLevel' | 'sourceCategory' | 'channelId' | 'acquisitionChannelId' | 'discoveredAt'
>>

export interface CustomerOrder {
  id: number
  orderNo: string
  signedAt: string
  currency: 'CNY' | 'JPY'
  receivableAmount: number | string
  paidAmount: number | string
  unpaidAmount: number | string
  status: string
}

export interface FollowUpRecord {
  id: number
  followedAt: string
  method: string
  content: string
  result: string | null
  nextFollowUpAt: string | null
}

export interface CustomerReferral {
  id: number
  serviceType: string
  downstreamCompany: string
  commissionAmount: number | string
  currency: 'CNY' | 'JPY'
  collectionStatus: string
}

export interface CustomerDetailRecord extends CustomerRecord {
  salesStage: string | null
  hasProblem: boolean
  commissionRateSnapshot: number | string | null
  nextFollowUpAt: string | null
  remark: string | null
  followUps: FollowUpRecord[]
  orders: CustomerOrder[]
  referrals: CustomerReferral[]
}

export interface CustomerAttachment {
  id: number
  fileName: string
  fileType: string | null
  createdAt: string
}

export interface FollowUpFormValues {
  method: string
  content: string
  result?: string
  nextFollowUpAt?: string
}
