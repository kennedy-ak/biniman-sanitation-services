import { api } from './client'
import type { Driver, DocumentType, DriverStatus, VehicleType } from '@/types'

export interface OnboardPayload {
  vehicle_reg: string
  vehicle_type: VehicleType
  vehicle_capacity_litres: number
  license_number: string
  base_fee: string
  momo_number?: string
  momo_provider?: string
}

export async function onboardDriver(payload: OnboardPayload) {
  const { data } = await api.post<Driver>('/drivers/onboard/', payload)
  return data
}

export async function fetchMyDriver() {
  const { data } = await api.get<Driver>('/drivers/me/')
  return data
}

export async function uploadDriverDocument(doc_type: DocumentType, file: File) {
  const form = new FormData()
  form.append('doc_type', doc_type)
  form.append('file', file)
  const { data } = await api.post<{ doc_type: DocumentType; file_url: string }>(
    '/drivers/documents/',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

export async function adminListDrivers(status?: DriverStatus) {
  const { data } = await api.get<Driver[]>('/drivers/admin/', {
    params: status ? { status } : undefined,
  })
  return data
}

export async function adminDriverAction(
  driverId: number,
  action: 'approve' | 'reject' | 'suspend',
  reason?: string,
) {
  const { data } = await api.post<Driver>(`/drivers/admin/${driverId}/action/`, {
    action,
    reason,
  })
  return data
}
