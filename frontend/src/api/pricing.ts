import { api } from './client'
import type { Region } from '@/types'

export interface PricingConfig {
  region: Region
  base_fee: string
  distance_rate_per_km: string
  min_billable_km: number
  small_discount_pct: string
  medium_discount_pct: string
  extra_trip_surcharge_pct: string
  commission_pct: string
  matching_radius_km: number
  accept_window_seconds: number
  updated_at: string
}

export type PricingConfigUpdate = Partial<
  Omit<PricingConfig, 'region' | 'updated_at'>
>

export async function adminListPricing() {
  const { data } = await api.get<PricingConfig[]>('/pricing/admin/configs/')
  return data
}

export async function adminUpdatePricing(regionId: number, payload: PricingConfigUpdate) {
  const { data } = await api.patch<PricingConfig>(
    `/pricing/admin/configs/${regionId}/`,
    payload,
  )
  return data
}
