import { api } from './client'
import type {
  DriverOffer,
  GateFit,
  LastEmptied,
  ParkingDistance,
  PreferredTime,
  QuotePreview,
  RequestStatus,
  ServiceRequest,
  TankCoverState,
  TankLocation,
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
  gate_fits_truck?: GateFit | ''
  gate_photo?: File | null
  tank_location?: TankLocation | ''
  truck_parking_distance?: ParkingDistance | ''
  tank_cover_photo?: File | null
  tank_cover_state?: TankCoverState | ''
  last_emptied?: LastEmptied | ''
  is_overflowing?: boolean | null
  preferred_time?: PreferredTime | ''
  someone_on_site?: boolean | null
}

export async function createRequest(payload: CreateRequestPayload) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null || v === '') continue
    if (v instanceof File) fd.append(k, v)
    else fd.append(k, String(v))
  }
  const { data } = await api.post<ServiceRequest>('/requests/', fd)
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

export async function retryRequest(id: number) {
  const { data } = await api.post<ServiceRequest>(`/requests/${id}/retry/`)
  return data
}

export async function downloadReceipt(id: number): Promise<void> {
  const response = await api.get(`/requests/${id}/receipt/`, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `receipt-${id}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export interface DisputeThreadMessage {
  id: number
  sender_type: 'admin' | 'customer'
  sender_name: string
  content: string
  attachment_url: string
  created_at: string
}

export async function fetchDisputeThread(id: number) {
  const { data } = await api.get<DisputeThreadMessage[]>(`/requests/${id}/dispute-thread/`)
  return data
}

export async function replyToDispute(id: number, content: string) {
  const { data } = await api.post<DisputeThreadMessage>(`/requests/${id}/dispute-reply/`, { content })
  return data
}

export async function submitCancelReason(id: number, reason: string) {
  const { data } = await api.post<{ ok: boolean }>(`/requests/${id}/cancel-reason/`, { reason })
  return data
}

// ----- Driver -----

// Backend DecimalField(max_digits=10, decimal_places=7) — round before sending.
function trimCoord(n: number | undefined): number | undefined {
  return n === undefined ? undefined : Number(n.toFixed(7))
}

export async function setDriverOnline(payload: {
  is_online: boolean
  lat?: number
  lng?: number
}) {
  const { data } = await api.post<{ is_online: boolean }>(
    '/requests/driver/online/',
    {
      is_online: payload.is_online,
      lat: trimCoord(payload.lat),
      lng: trimCoord(payload.lng),
    },
  )
  return data
}

export async function pingDriverLocation(lat: number, lng: number) {
  await api.post('/requests/driver/ping/', {
    lat: trimCoord(lat),
    lng: trimCoord(lng),
  })
}

export interface DriverStats {
  jobs_today: number
  earned_today: number
  rating: number | null
  hours_online: number | null
  online_since: string | null
}

export async function fetchDriverStats() {
  const { data } = await api.get<DriverStats>('/requests/driver/stats/')
  return data
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

export async function fetchDriverHistory() {
  const { data } = await api.get<ServiceRequest[]>('/requests/driver/history/')
  return data
}
