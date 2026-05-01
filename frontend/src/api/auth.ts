import { api } from './client'
import type { AuthTokens, Region, Role, User } from '@/types'

export interface VerifyResponse {
  user: User
  tokens: AuthTokens
  created: boolean
}

export async function requestOtp(
  phone: string,
  purpose: 'login' | 'signup' = 'login',
  channel: 'sms' | 'email' = 'sms',
  email?: string,
) {
  const payload: Record<string, unknown> = { phone, purpose, channel }
  if (channel === 'email' && email) payload.email = email
  const { data } = await api.post('/auth/otp/request/', payload)
  return data as { sent: boolean; phone: string; channel: 'sms' | 'email' }
}

export async function verifyOtp(payload: {
  phone: string
  code: string
  role?: Role
  full_name?: string
  region_id?: number
}) {
  const { data } = await api.post<VerifyResponse>('/auth/otp/verify/', payload)
  return data
}

export async function fetchMe() {
  const { data } = await api.get<User>('/auth/me/')
  return data
}

export async function updateProfile(payload: {
  full_name?: string
  region_id?: number | null
}) {
  const { data } = await api.patch<User>('/auth/me/update/', payload)
  return data
}

export async function requestEmailOtp(email: string) {
  const { data } = await api.post<{ sent: boolean; email: string }>(
    '/auth/email/request/',
    { email },
  )
  return data
}

export async function verifyEmailOtp(email: string, code: string) {
  const { data } = await api.post<User>('/auth/email/verify/', { email, code })
  return data
}

export async function fetchRegions() {
  const { data } = await api.get<Region[]>('/auth/regions/')
  return data
}

export async function adminListRegions() {
  const { data } = await api.get<Region[]>('/auth/admin/regions/')
  return data
}

export async function adminCreateRegion(payload: {
  name: string
  code: string
  is_active?: boolean
}) {
  const { data } = await api.post<Region>('/auth/admin/regions/', payload)
  return data
}

export async function adminUpdateRegion(
  id: number,
  payload: Partial<Pick<Region, 'name' | 'code' | 'is_active'>>,
) {
  const { data } = await api.patch<Region>(`/auth/admin/regions/${id}/`, payload)
  return data
}

export async function adminDeleteRegion(id: number) {
  await api.delete(`/auth/admin/regions/${id}/`)
}
