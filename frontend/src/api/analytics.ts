import { api } from './client'
import type { Driver, Role, ServiceRequest } from '@/types'

export interface Overview {
  window_days: number
  requests: {
    total: number
    completed: number
    cancelled: number
    unfulfilled: number
    unfulfilled_rate: number
  }
  money: {
    gmv: string
    commission: string
    refunded: string
  }
  drivers: {
    total: number
    approved: number
    online: number
  }
  customers_total: number
}

export interface DailyRow {
  day: string
  total: number
  completed: number
  unfulfilled: number
  cancelled: number
}

export interface TopDriver {
  driver_id: number
  phone: string
  name: string
  jobs: number
  gross: string
  commission: string
  payout: string
}

export interface Dispute {
  kind: 'failed_payout' | 'stuck_payout' | 'refund_pending'
  request_id: number
  amount: string
  driver_phone?: string
  customer_phone?: string
  reason?: string
  request_status?: string
  created_at: string
}

export async function fetchOverview(days = 30) {
  const { data } = await api.get<Overview>('/analytics/overview/', { params: { days } })
  return data
}

export async function fetchDaily(days = 14) {
  const { data } = await api.get<{ window_days: number; rows: DailyRow[] }>(
    '/analytics/daily/',
    { params: { days } },
  )
  return data
}

export async function fetchTopDrivers(days = 30) {
  const { data } = await api.get<TopDriver[]>('/analytics/top-drivers/', {
    params: { days },
  })
  return data
}

export async function fetchDisputes() {
  const { data } = await api.get<Dispute[]>('/analytics/disputes/')
  return data
}

export async function forceRefund(requestId: number) {
  const { data } = await api.post(`/analytics/requests/${requestId}/refund/`)
  return data
}

export async function forcePayout(requestId: number) {
  const { data } = await api.post(`/analytics/requests/${requestId}/payout/`)
  return data
}

export async function forceComplete(requestId: number) {
  const { data } = await api.post(`/analytics/requests/${requestId}/force-complete/`)
  return data
}

export async function markPayoutSucceeded(payoutId: number) {
  const { data } = await api.post(`/analytics/payouts/${payoutId}/mark-succeeded/`)
  return data
}

export interface UserListRow {
  id: number
  phone: string
  email: string | null
  full_name: string
  role: Role
  region: string | null
  is_active: boolean
  is_phone_verified: boolean
  created_at: string
  stats: {
    trips_total: number
    trips_completed: number
    spent?: string
    gross?: string
    earnings?: string
  }
}

export interface UserDetailResponse {
  user: Omit<UserListRow, 'stats'>
  stats: UserListRow['stats']
  rating: { avg: number | null; count: number }
  driver: Driver | null
  trips: ServiceRequest[]
}

export interface UserCreatePayload {
  phone: string
  full_name?: string
  email?: string | null
  role: Role
  region_id?: number | null
  // driver-only (optional)
  vehicle_reg?: string
  vehicle_type?: 'small_tanker' | 'medium_tanker' | 'large_tanker'
  vehicle_capacity_litres?: number
  license_number?: string
  base_fee?: string
  momo_number?: string
  momo_provider?: 'mtn' | 'vodafone' | 'airteltigo'
}

export async function createAdminUser(payload: UserCreatePayload) {
  const { data } = await api.post<UserListRow>('/analytics/users/create/', payload)
  return data
}

export async function fetchAdminUsers(params: { role?: Role; q?: string } = {}) {
  const { data } = await api.get<UserListRow[]>('/analytics/users/', { params })
  return data
}

export async function fetchAdminUser(userId: number) {
  const { data } = await api.get<UserDetailResponse>(`/analytics/users/${userId}/`)
  return data
}

export interface UserUpdatePayload {
  full_name?: string
  email?: string | null
  role?: Role
  region_id?: number | null
}

export async function updateAdminUser(userId: number, payload: UserUpdatePayload) {
  const { data } = await api.patch(`/analytics/users/${userId}/update/`, payload)
  return data
}

export async function setUserActive(userId: number, active: boolean) {
  const { data } = await api.post(`/analytics/users/${userId}/active/`, { active })
  return data as { id: number; is_active: boolean }
}

export async function deleteAdminUser(userId: number) {
  const { data } = await api.delete(`/analytics/users/${userId}/delete/`)
  return data as { deleted: boolean }
}

export interface BulkDeleteResult {
  requested: number
  deleted: number
  skipped_self: number
  not_found: number[]
}

export async function bulkDeleteAdminUsers(ids: number[]) {
  const { data } = await api.post<BulkDeleteResult>('/analytics/users/bulk-delete/', {
    ids,
  })
  return data
}
