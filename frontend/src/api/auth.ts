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
  email?: string
  region_id?: number | null
}) {
  const { data } = await api.patch<User>('/auth/me/update/', payload)
  return data
}

export async function fetchRegions() {
  const { data } = await api.get<Region[]>('/auth/regions/')
  return data
}
