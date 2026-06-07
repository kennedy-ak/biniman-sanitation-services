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
  has_password: boolean
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
  has_location: boolean
  documents: DriverDocument[]
  created_at: string
}

export type WasteType = 'septic' | 'soak_pit' | 'industrial'
export type VolumeTier = 'small' | 'medium' | 'full'

export type GateFit = 'yes' | 'no' | 'unsure'
export type TankLocation =
  | 'front'
  | 'side'
  | 'back'
  | 'under_driveway'
  | 'other'
export type ParkingDistance = 'at_gate' | '5_10' | '10_20' | '20_plus'
export type TankCoverState =
  | 'open'
  | 'closed_accessible'
  | 'sealed'
  | 'unknown'
export type LastEmptied =
  | 'lt_6m'
  | '6_12m'
  | '1_2y'
  | 'gt_2y'
  | 'never'
  | 'unknown'
export type PreferredTime = 'asap' | 'morning' | 'afternoon' | 'evening'

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
  gate_fits_truck: GateFit | ''
  gate_photo: string | null
  tank_location: TankLocation | ''
  truck_parking_distance: ParkingDistance | ''
  tank_cover_photo: string | null
  tank_cover_state: TankCoverState | ''
  last_emptied: LastEmptied | ''
  is_overflowing: boolean | null
  preferred_time: PreferredTime | ''
  someone_on_site: boolean | null
  num_trips: number
  quote_total: string
  quote_base_fee: string
  quote_distance_km: string
  quote_billable_distance_km: string
  quote_distance_fee: string
  quote_volume_multiplier: string
  quote_trips_multiplier: string
  commission_amount: string
  status: RequestStatus
  cancel_reason: string
  payment_status: 'pending' | 'succeeded' | 'failed' | 'refunded' | null
  created_at: string
  accepted_at: string | null
  en_route_at: string | null
  arrived_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  receipt_url: string | null
  receipt_generated_at: string | null
}

export interface QuotePreview {
  base_fee: string
  distance_km: string
  billable_distance_km: string
  distance_fee: string
  subtotal: string
  volume_tier: string
  volume_multiplier: string
  adjusted_subtotal: string
  num_trips: number
  trips_multiplier: string
  total: string
  commission: string
  driver_payout: string
  // Booking context (present unless no drivers are online)
  nearest_driver_km?: number
  requires_confirmation?: boolean
  no_drivers?: boolean
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
