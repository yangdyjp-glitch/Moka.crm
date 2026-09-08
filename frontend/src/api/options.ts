import client from './client'
import type { AcquisitionChannelOption, ChannelOption, ProductOption, UserOption } from './models'

export type { AcquisitionChannelOption, ChannelOption, ProductOption, UserOption } from './models'
export type { DecimalValue as MoneyValue } from './models'

export async function loadProducts(): Promise<ProductOption[]> {
  const { data } = await client.get<ProductOption[]>('/products')
  return data
}
export async function loadChannelOptions(): Promise<ChannelOption[]> {
  const { data } = await client.get<ChannelOption[]>('/channels/options')
  return data
}
export async function loadAcqChannels(): Promise<AcquisitionChannelOption[]> {
  const { data } = await client.get<AcquisitionChannelOption[]>('/acquisition-channels')
  return data
}
export async function loadUserOptions(role?: string): Promise<UserOption[]> {
  const { data } = await client.get<UserOption[]>('/users/options', { params: { role } })
  return data
}
