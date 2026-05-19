import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMyDriver } from '@/api/drivers'
import {
  acceptOffer,
  declineOffer,
  fetchActiveRequest,
  fetchCurrentOffer,
  fetchDriverPendingRating,
  setDriverOnline,
  transitionStatus,
} from '@/api/requests'
import { useDriverSocket } from '@/hooks/useRequestSocket'
import { useLocationBroadcaster } from '@/hooks/useLocationBroadcaster'
import { useLivePosition } from '@/hooks/useLivePosition'
import { RatingForm } from '@/components/RatingForm'
import { DriverRouteMap } from '@/components/DriverRouteMap'
import type { RequestStatus, ServiceRequest } from '@/types'

function navigateUrl(lat: string | number, lng: string | number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
}

function playOfferAlert() {
  try {
    const ctx = new AudioContext()
    const times = [0, 0.18, 0.36]
    times.forEach((t) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.4, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.15)
    })
  } catch {
    // AudioContext not available — silent fallback
  }
}

const NEXT_STATUS: Record<RequestStatus, RequestStatus | null> = {
  accepted: 'en_route',
  en_route: 'arrived',
  arrived: 'completed',
  pending: null,
  assigned: null,
  completed: null,
  cancelled: null,
  unfulfilled: null,
}

const STATUS_LABEL: Partial<Record<RequestStatus, string>> = {
  en_route: 'Mark en route',
  arrived: 'Mark arrived',
  completed: 'Mark completed',
}

export function DriverDashboard() {
  const qc = useQueryClient()
  const driver = useQuery({ queryKey: ['driver', 'me'], queryFn: fetchMyDriver, retry: false })
  const isApproved = driver.data?.status === 'approved'
  const [toggleError, setToggleError] = useState<string | null>(null)

  const offerQuery = useQuery({
    queryKey: ['driver', 'offer'],
    queryFn: fetchCurrentOffer,
    enabled: isApproved && !!driver.data?.is_online,
    refetchInterval: 3000,
  })

  const activeQuery = useQuery({
    queryKey: ['driver', 'active'],
    queryFn: fetchActiveRequest,
    enabled: isApproved,
    refetchInterval: 3000,
  })

  const pendingRatingQuery = useQuery({
    queryKey: ['driver', 'pending-rating'],
    queryFn: fetchDriverPendingRating,
    enabled: isApproved && !activeQuery.data,
    refetchInterval: 30000,
  })

  // Broadcast GPS while online so the driver stays a valid match candidate
  // (last_seen_at + last_lat/lng stay fresh). During an active job, the
  // backend additionally forwards each ping to the customer's WS.
  useLocationBroadcaster(
    isApproved && !!driver.data?.is_online,
  )

  // Live device position for the in-app route map (offer + active job).
  const livePos = useLivePosition(
    isApproved &&
      !!driver.data?.is_online &&
      (!!offerQuery.data || !!activeQuery.data),
  )

  // Subscribe to driver WS to nudge offer refetch faster than polling
  const wsEvent = useDriverSocket(isApproved && !!driver.data?.is_online)
  useEffect(() => {
    if (wsEvent?.type === 'offer.new') {
      qc.invalidateQueries({ queryKey: ['driver', 'offer'] })
      playOfferAlert()
    }
  }, [wsEvent, qc])

  const onlineMut = useMutation({
    mutationFn: async (turnOn: boolean) => {
      let lat: number | undefined
      let lng: number | undefined
      if (turnOn && navigator.geolocation) {
        // Hard timeout so a stuck permission prompt can't block the toggle.
        await Promise.race<void>([
          new Promise<void>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                lat = pos.coords.latitude
                lng = pos.coords.longitude
                resolve()
              },
              () => resolve(),
              { timeout: 5000, enableHighAccuracy: true },
            )
          }),
          new Promise<void>((resolve) => setTimeout(resolve, 6000)),
        ])
      }
      return setDriverOnline({ is_online: turnOn, lat, lng })
    },
    onMutate: () => setToggleError(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver', 'me'] }),
    onError: (err: unknown) => setToggleError(toggleErrorMsg(err)),
  })

  const acceptMut = useMutation({
    mutationFn: (assignmentId: number) => acceptOffer(assignmentId),
    onSuccess: () => {
      qc.refetchQueries({ queryKey: ['driver', 'offer'] })
      qc.refetchQueries({ queryKey: ['driver', 'active'] })
    },
  })

  const declineMut = useMutation({
    mutationFn: (assignmentId: number) => declineOffer(assignmentId),
    onSuccess: () => qc.refetchQueries({ queryKey: ['driver', 'offer'] }),
  })

  const statusMut = useMutation({
    mutationFn: ({ id, next }: { id: number; next: RequestStatus }) =>
      transitionStatus(id, next),
    onSuccess: () => qc.refetchQueries({ queryKey: ['driver', 'active'] }),
  })

  if (driver.isLoading) return <p>Loading…</p>
  if (driver.isError) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold">Could not load profile</h1>
        <p className="mt-2 text-charcoal/70">There was a problem fetching your driver profile.</p>
        <button
          onClick={() => driver.refetch()}
          className="mt-4 inline-block bg-primary text-white px-5 py-2.5 rounded-md font-semibold"
        >
          Retry
        </button>
      </div>
    )
  }
  if (!driver.data) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold">Welcome, driver</h1>
        <p className="mt-2 text-charcoal/70">Complete onboarding to start.</p>
        <Link
          to="/driver/onboard"
          className="mt-4 inline-block bg-primary text-white px-5 py-2.5 rounded-md font-semibold"
        >
          Start onboarding →
        </Link>
      </div>
    )
  }

  if (!isApproved) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold">Awaiting approval</h1>
        <p className="mt-2 text-charcoal/70">
          Status: <span className="font-semibold uppercase">{driver.data.status}</span>
        </p>
        <Link to="/driver/onboard" className="mt-4 inline-block text-primary underline">
          Update profile and documents
        </Link>
      </div>
    )
  }

  const offer = offerQuery.data
  const active = activeQuery.data

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-extrabold">Driver dashboard</h1>
        <button
          type="button"
          disabled={onlineMut.isPending}
          onClick={() => onlineMut.mutate(!driver.data!.is_online)}
          className={`px-4 py-2 rounded-md font-semibold transition disabled:opacity-60 disabled:cursor-wait ${
            driver.data.is_online
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-charcoal/10 text-charcoal hover:bg-charcoal/20'
          }`}
        >
          {onlineMut.isPending
            ? driver.data.is_online
              ? 'Going offline…'
              : 'Going online…'
            : driver.data.is_online
              ? '● Online — tap to go offline'
              : '○ Tap to go online'}
        </button>
      </div>
      {toggleError && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-start justify-between gap-3">
          <span>{toggleError}</span>
          <button
            type="button"
            onClick={() => setToggleError(null)}
            className="text-red-700/70 hover:text-red-900 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {active && (
        <section className="mt-6 card border-primary/40 bg-primary/5">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs uppercase tracking-wider text-primary font-bold">
                Active job
              </div>
              <h2 className="mt-1 text-xl font-bold">
                #{active.id} · {active.waste_type.replace('_', ' ')} · {active.volume_tier}
              </h2>
              <p className="mt-1 text-sm text-charcoal/70">
                {active.pickup_address || `${active.pickup_lat}, ${active.pickup_lng}`}
              </p>
              {active.notes && (
                <p className="mt-1 text-sm">📝 {active.notes}</p>
              )}
              <SiteSurvey req={active} />
              <p className="mt-2 text-sm">
                Earnings (after commission):{' '}
                <span className="font-bold">
                  GHS {(Number(active.quote_total) - Number(active.commission_amount)).toFixed(2)}
                </span>
              </p>
            </div>
            <div className="text-right">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold uppercase bg-amber-100 text-amber-800">
                {active.status.replace('_', ' ')}
              </span>
            </div>
          </div>
          <div className="mt-4">
            <DriverRouteMap
              pickup={{
                lat: Number(active.pickup_lat),
                lng: Number(active.pickup_lng),
              }}
              driver={livePos}
              height={240}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {NEXT_STATUS[active.status] && (
              <button
                onClick={() =>
                  statusMut.mutate({ id: active.id, next: NEXT_STATUS[active.status]! })
                }
                disabled={statusMut.isPending}
                className="bg-accent text-charcoal font-bold px-5 py-2.5 rounded-md hover:brightness-110 disabled:opacity-60"
              >
                {STATUS_LABEL[NEXT_STATUS[active.status]!]}
              </button>
            )}
            <a
              href={navigateUrl(active.pickup_lat, active.pickup_lng)}
              target="_blank"
              rel="noreferrer"
              className="bg-white border border-charcoal/20 text-charcoal font-semibold px-5 py-2.5 rounded-md hover:bg-charcoal/5 transition inline-flex items-center gap-2"
            >
              🧭 Open in Google Maps
            </a>
          </div>
        </section>
      )}

      {!active && offer && (
        <section className="mt-6 card border-accent/60 bg-accent/10 ring-2 ring-accent animate-pulse-once relative">
          <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-accent animate-ping" />
          <div className="text-xs uppercase tracking-wider text-accent font-bold">
            Incoming offer
          </div>
          <h2 className="mt-1 text-xl font-bold">
            {offer.request.waste_type.replace('_', ' ')} · {offer.request.volume_tier}
          </h2>
          <p className="text-sm text-charcoal/70">
            {offer.distance_km.toFixed(2)} km away ·{' '}
            {offer.request.pickup_address || 'Location pinned on map'}
          </p>
          <p className="mt-2 text-sm">
            Quote: <span className="font-bold">GHS {offer.request.quote_total}</span>
          </p>
          <OfferCountdown expiresAt={offer.expires_at} />
          <SiteSurvey req={offer.request} />
          <div className="mt-4">
            <DriverRouteMap
              pickup={{
                lat: Number(offer.request.pickup_lat),
                lng: Number(offer.request.pickup_lng),
              }}
              driver={livePos}
              height={200}
              liveRefresh={false}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => acceptMut.mutate(offer.assignment_id)}
              disabled={acceptMut.isPending}
              className="bg-primary text-white px-5 py-2 rounded-md font-bold hover:bg-primary/90"
            >
              Accept
            </button>
            <button
              onClick={() => declineMut.mutate(offer.assignment_id)}
              disabled={declineMut.isPending}
              className="bg-white border border-charcoal/20 px-5 py-2 rounded-md font-medium hover:bg-charcoal/5"
            >
              Decline
            </button>
            <a
              href={navigateUrl(offer.request.pickup_lat, offer.request.pickup_lng)}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-sm text-primary font-semibold hover:underline inline-flex items-center gap-1.5"
            >
              🧭 Preview in Google Maps
            </a>
          </div>
        </section>
      )}

      {!active && pendingRatingQuery.data && (
        <section className="mt-6">
          <p className="text-sm text-charcoal/70">
            Rate the customer for completed job #{pendingRatingQuery.data.id}.
          </p>
          <RatingForm
            requestId={pendingRatingQuery.data.id}
            label="Rate the customer"
          />
        </section>
      )}

      {!active && !offer && !pendingRatingQuery.data && driver.data.is_online && (
        <p className="mt-6 text-charcoal/60">Waiting for jobs nearby…</p>
      )}
      {!driver.data.is_online && (
        <p className="mt-6 text-charcoal/60">
          You're offline. Toggle online above to start receiving jobs.
        </p>
      )}

    </div>
  )
}

function OfferCountdown({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(() =>
    Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  )
  useEffect(() => {
    const iv = setInterval(() => {
      setSecs(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(iv)
  }, [expiresAt])

  const urgent = secs <= 30
  return (
    <p className={`text-sm font-semibold mt-1 ${urgent ? 'text-red-600 animate-pulse' : 'text-charcoal/60'}`}>
      ⏱ {secs > 0 ? `${secs}s to accept` : 'Offer expired'}
    </p>
  )
}

function toggleErrorMsg(err: unknown): string {
  const resp = (err as { response?: { status?: number; data?: unknown } })?.response
  const status = resp?.status
  const data = resp?.data
  if (status === 403) {
    return 'Your driver account is not approved yet, so you cannot go online.'
  }
  if (typeof data === 'string') {
    if (/<html|<!doctype/i.test(data)) {
      return status === 500
        ? 'Server error (500). Try again or check the backend logs.'
        : `HTTP ${status ?? '?'} — could not toggle online status.`
    }
    return data
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (typeof obj.detail === 'string') return obj.detail
    const parts: string[] = []
    for (const [k, v] of Object.entries(obj)) {
      const flat = Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : ''
      if (flat) parts.push(k === 'non_field_errors' ? flat : `${k}: ${flat}`)
    }
    if (parts.length) return parts.join(' • ')
  }
  if (!navigator.onLine) return 'You appear to be offline. Check your connection.'
  return 'Could not toggle online status. Try again.'
}

const GATE_FIT_LABEL: Record<string, string> = {
  yes: 'Fits',
  no: 'Too small',
  unsure: 'Not sure',
}
const TANK_LOC_LABEL: Record<string, string> = {
  front: 'Front',
  side: 'Side',
  back: 'Back',
  under_driveway: 'Under driveway',
  other: 'Other',
}
const PARKING_LABEL: Record<string, string> = {
  at_gate: 'At gate',
  '5_10': '5–10 m',
  '10_20': '10–20 m',
  '20_plus': '20 m+',
}
const COVER_LABEL: Record<string, string> = {
  open: 'Open',
  closed_accessible: 'Closed (accessible)',
  sealed: 'Sealed (break)',
  unknown: 'Unknown',
}
const LAST_LABEL: Record<string, string> = {
  lt_6m: '<6 mo',
  '6_12m': '6–12 mo',
  '1_2y': '1–2 y',
  gt_2y: '2 y+',
  never: 'Never',
  unknown: 'Unknown',
}
const TIME_LABEL: Record<string, string> = {
  asap: 'ASAP',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

function SiteSurvey({ req }: { req: ServiceRequest }) {
  const facts: { k: string; v: string }[] = []
  if (req.gate_fits_truck) facts.push({ k: 'Gate', v: GATE_FIT_LABEL[req.gate_fits_truck] })
  if (req.tank_location) facts.push({ k: 'Tank at', v: TANK_LOC_LABEL[req.tank_location] })
  if (req.truck_parking_distance)
    facts.push({ k: 'Park', v: PARKING_LABEL[req.truck_parking_distance] })
  if (req.tank_cover_state) facts.push({ k: 'Cover', v: COVER_LABEL[req.tank_cover_state] })
  if (req.last_emptied) facts.push({ k: 'Last emptied', v: LAST_LABEL[req.last_emptied] })
  if (req.is_overflowing != null)
    facts.push({ k: 'Overflowing', v: req.is_overflowing ? 'Yes' : 'No' })
  if (req.preferred_time) facts.push({ k: 'When', v: TIME_LABEL[req.preferred_time] })
  if (req.someone_on_site != null)
    facts.push({ k: 'On site', v: req.someone_on_site ? 'Yes' : 'No' })

  if (facts.length === 0 && !req.gate_photo && !req.tank_cover_photo) return null

  return (
    <div className="mt-3 rounded-lg border border-white/20 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wider font-bold text-charcoal/50 mb-2">
        Site survey
      </div>
      {facts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {facts.map((f) => (
            <span
              key={f.k}
              className="text-xs px-2.5 py-1 rounded-full bg-charcoal/8 border border-charcoal/10 text-charcoal"
            >
              <span className="font-semibold text-charcoal/50">{f.k}:</span>{' '}
              <span className="font-medium">{f.v}</span>
            </span>
          ))}
        </div>
      )}
      {(req.gate_photo || req.tank_cover_photo) && (
        <div className="flex gap-3">
          {req.gate_photo && (
            <a href={req.gate_photo} target="_blank" rel="noreferrer" className="block flex-shrink-0">
              <img
                src={req.gate_photo}
                alt="Gate photo"
                className="w-24 h-24 object-cover rounded-lg border border-charcoal/10 bg-charcoal/5"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
              <div className="text-[10px] text-center text-charcoal/50 mt-1 font-medium">Gate</div>
            </a>
          )}
          {req.tank_cover_photo && (
            <a href={req.tank_cover_photo} target="_blank" rel="noreferrer" className="block flex-shrink-0">
              <img
                src={req.tank_cover_photo}
                alt="Tank cover photo"
                className="w-24 h-24 object-cover rounded-lg border border-charcoal/10 bg-charcoal/5"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
              <div className="text-[10px] text-center text-charcoal/50 mt-1 font-medium">Tank</div>
            </a>
          )}
        </div>
      )}
    </div>
  )
}
