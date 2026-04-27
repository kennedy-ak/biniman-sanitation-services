import { api } from './client'
import type { Driver, FleetCompany, FleetStatus, ServiceRequest } from '@/types'
import type { Payout } from './payments'

export interface FleetSignupPayload {
  name: string
  registration_number: string
  contact_email?: string
  contact_phone?: string
  region_id: number
}

export async function signupFleet(payload: FleetSignupPayload) {
  const { data } = await api.post<FleetCompany>('/fleets/signup/', payload)
  return data
}

export async function fetchMyFleet() {
  const { data } = await api.get<FleetCompany>('/fleets/me/')
  return data
}

export async function adminListFleets(status?: FleetStatus) {
  const { data } = await api.get<FleetCompany[]>('/fleets/admin/', {
    params: status ? { status } : undefined,
  })
  return data
}

export async function adminFleetAction(
  fleetId: number,
  action: 'approve' | 'reject' | 'suspend',
  reason?: string,
) {
  const { data } = await api.post<FleetCompany>(`/fleets/admin/${fleetId}/action/`, {
    action,
    reason,
  })
  return data
}

// ----- Fleet admin (own fleet) -----

export async function listFleetDrivers() {
  const { data } = await api.get<Driver[]>('/fleets/drivers/')
  return data
}

export async function inviteFleetDriver(payload: { phone: string; full_name?: string }) {
  const { data } = await api.post<Driver>('/fleets/drivers/invite/', payload)
  return data
}

export async function removeFleetDriver(driverId: number) {
  await api.delete(`/fleets/drivers/${driverId}/`)
}

export async function listFleetJobs(status?: string) {
  const { data } = await api.get<ServiceRequest[]>('/fleets/jobs/', {
    params: status ? { status } : undefined,
  })
  return data
}

export async function listFleetPayouts() {
  const { data } = await api.get<Payout[]>('/fleets/payouts/')
  return data
}

export interface WeeklyRow {
  week_start: string
  jobs: number
  gross: string
  commission: string
  payout: string
}

export interface WeeklyEarnings {
  weeks: WeeklyRow[]
  totals: { jobs: string; gross: string; commission: string; payout: string }
}

export async function fleetEarnings() {
  const { data } = await api.get<WeeklyEarnings>('/fleets/earnings/')
  return data
}
