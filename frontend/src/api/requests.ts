import { api } from './client'
import type {
  DriverOffer,
  QuotePreview,
  RequestStatus,
  ServiceRequest,
  VolumeTier,
  WasteType,
} from '@/types'

// ----- Customer -----

export interface QuotePayload {
  region_id: number
  pickup_lat: string
  pickup_lng: string
  volume_tier: VolumeTier
}

export async function previewQuote(payload: QuotePayload) {
  const { data } = await api.post<QuotePreview>('/requests/quote/', payload)
  return data
}

export interface CreateRequestPayload {
  region_id: number
  waste_type: WasteType
  volume_tier: VolumeTier
  pickup_lat: string
  pickup_lng: string
  pickup_address?: string
  notes?: string
}

export async function createRequest(payload: CreateRequestPayload) {
  const { data } = await api.post<ServiceRequest>('/requests/', payload)
  return data
}

export async function fetchMyRequests() {
  const { data } = await api.get<ServiceRequest[]>('/requests/mine/')
  return data
}

export async function fetchRequest(id: number) {
  const { data } = await api.get<ServiceRequest>(`/requests/${id}/`)
  return data
}

export async function cancelRequest(id: number, reason?: string) {
  const { data } = await api.post<ServiceRequest>(`/requests/${id}/cancel/`, { reason })
  return data
}

// ----- Driver -----

export async function setDriverOnline(payload: {
  is_online: boolean
  lat?: number
  lng?: number
}) {
  const { data } = await api.post<{ is_online: boolean }>(
    '/requests/driver/online/',
    payload,
  )
  return data
}

export async function pingDriverLocation(lat: number, lng: number) {
  await api.post('/requests/driver/ping/', { lat, lng })
}

export async function fetchCurrentOffer() {
  const { data } = await api.get<DriverOffer | null>('/requests/driver/offer/')
  return data
}

export async function fetchActiveRequest() {
  const { data } = await api.get<ServiceRequest | null>('/requests/driver/active/')
  return data
}

export async function fetchDriverPendingRating() {
  const { data } = await api.get<ServiceRequest | null>('/requests/driver/pending-rating/')
  return data
}

export async function acceptOffer(assignmentId: number) {
  const { data } = await api.post<ServiceRequest>(
    `/requests/driver/${assignmentId}/accept/`,
  )
  return data
}

export async function declineOffer(assignmentId: number) {
  await api.post(`/requests/driver/${assignmentId}/decline/`)
}

export async function transitionStatus(requestId: number, status: RequestStatus) {
  const { data } = await api.post<ServiceRequest>(
    `/requests/driver/${requestId}/status/`,
    { status },
  )
  return data
}
