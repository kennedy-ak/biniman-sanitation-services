import { api } from './client'
import type { Region } from '@/types'

export interface PricingConfig {
  region: Region
  base_fee_min: string
  base_fee_max: string
  distance_rate_per_km: string
  tier_small_fee: string
  tier_medium_fee: string
  tier_large_fee: string
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
