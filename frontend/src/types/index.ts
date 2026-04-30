export type Role = 'customer' | 'driver' | 'fleet_admin' | 'admin'

export interface Region {
  id: number
  name: string
  code: string
  is_active: boolean
}

export interface User {
  id: number
  phone: string
  email: string | null
  full_name: string
  role: Role
  region: Region | null
  is_phone_verified: boolean
  is_email_verified: boolean
  is_active: boolean
  created_at: string
}

export interface AuthTokens {
  access: string
  refresh: string
}

export type DriverStatus = 'pending' | 'approved' | 'suspended' | 'rejected'

export type VehicleType = 'small_tanker' | 'medium_tanker' | 'large_tanker'

export type DocumentType =
  | 'national_id'
  | 'driving_license'
  | 'vehicle_registration'
  | 'epa_permit'

export interface DriverDocument {
  id: number
  doc_type: DocumentType
  file_url: string
  uploaded_at: string
}

export interface Driver {
  id: number
  user: User
  fleet: number | null
  vehicle_reg: string
  vehicle_type: VehicleType
  vehicle_capacity_litres: number
  license_number: string
  base_fee: string
  momo_number: string
  momo_provider: string
  status: DriverStatus
  rejection_reason: string
  approved_at: string | null
  is_online: boolean
  last_seen_at: string | null
  documents: DriverDocument[]
  created_at: string
}

export type WasteType = 'septic' | 'soak_pit' | 'industrial'
export type VolumeTier = 'small' | 'medium' | 'large'

export type RequestStatus =
  | 'pending'
  | 'assigned'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'completed'
  | 'cancelled'
  | 'unfulfilled'

export interface ServiceRequest {
  id: number
  customer: User
  driver: Driver | null
  region: number
  waste_type: WasteType
  volume_tier: VolumeTier
  pickup_lat: string
  pickup_lng: string
  pickup_address: string
  notes: string
  quote_total: string
  quote_base_fee: string
  quote_distance_km: string
  quote_distance_fee: string
  quote_tier_fee: string
  commission_amount: string
  status: RequestStatus
  cancel_reason: string
  created_at: string
  accepted_at: string | null
  en_route_at: string | null
  arrived_at: string | null
  completed_at: string | null
  cancelled_at: string | null
}

export interface QuotePreview {
  base_fee: string
  distance_km: string
  distance_fee: string
  tier_fee: string
  total: string
  commission: string
  driver_payout: string
}

export interface DriverOffer {
  assignment_id: number
  request: ServiceRequest
  distance_km: number
  expires_at: string
}

export type FleetStatus = 'pending' | 'approved' | 'suspended' | 'rejected'

export interface FleetCompany {
  id: number
  name: string
  registration_number: string
  contact_email: string
  contact_phone: string
  owner: User
  region: Region
  status: FleetStatus
  rejection_reason: string
  approved_at: string | null
  created_at: string
}
