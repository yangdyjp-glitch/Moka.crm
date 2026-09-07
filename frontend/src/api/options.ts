import client from './client'
import type { AcquisitionChannelOption, ChannelOption, ProductOption, UserOption } from './models'

export async function loadProducts() {
  const { data } = await client.get<ProductOption[]>('/products')
  return data
}
export async function loadChannelOptions() {
  const { data } = await client.get<ChannelOption[]>('/channels/options')
  return data
}
export async function loadAcqChannels() {
  const { data } = await client.get<AcquisitionChannelOption[]>('/acquisition-channels')
  return data
}
export async function loadUserOptions(role?: string) {
  const { data } = await client.get<UserOption[]>('/users/options', { params: { role } })
  return data
}
