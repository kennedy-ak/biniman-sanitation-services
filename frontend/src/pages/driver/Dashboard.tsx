import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMyDriver } from '@/api/drivers'
import {
  acceptOffer,
  declineOffer,
  fetchActiveRequest,
  fetchCurrentOffer,
  fetchDriverPendingRating,
  fetchDriverStats,
  pingDriverLocation,
  setDriverOnline,
  transitionStatus,
} from '@/api/requests'
import { useDriverSocket } from '@/hooks/useRequestSocket'
import { useLocationBroadcaster } from '@/hooks/useLocationBroadcaster'
import { useLivePosition } from '@/hooks/useLivePosition'
import { RatingForm } from '@/components/RatingForm'
import { DriverRouteMap } from '@/components/DriverRouteMap'
import type { DriverOffer, RequestStatus, ServiceRequest } from '@/types'
import type { LatLng } from '@/lib/mapboxDirections'

// ── Custom keyframes ──────────────────────────────────────────────────────────
const KF = `
  @keyframes radarRing {
    0%   { opacity: 0.5; }
    100% { opacity: 0; transform: translate(-50%,-50%) scale(1.2); }
  }
  @keyframes driverDotPulse {
    0%,100% { opacity:1; transform:scale(1); }
    50%      { opacity:0.55; transform:scale(0.8); }
  }
  @keyframes mapLocPulse {
    0%  { transform:scale(1); opacity:1; }
    70% { transform:scale(2.8); opacity:0; }
    100%{ opacity:0; }
  }
`

// ── Helpers ───────────────────────────────────────────────────────────────────
function navigateUrl(lat: string | number, lng: string | number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
}

function playOfferAlert() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.18, 0.36].forEach((t) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.4, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15)
      osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + 0.15)
    })
  } catch { /* silent */ }
}

const NEXT_STATUS: Record<RequestStatus, RequestStatus | null> = {
  accepted: 'en_route', en_route: 'arrived', arrived: 'completed',
  pending: null, assigned: null, completed: null, cancelled: null, unfulfilled: null,
}
const NEXT_BTN: Partial<Record<RequestStatus, string>> = {
  en_route: 'Start driving', arrived: 'Mark arrived', completed: 'Mark completed',
}

function useClock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => { const iv = setInterval(() => setT(new Date()), 1000); return () => clearInterval(iv) }, [])
  return t
}

function toggleErrorMsg(err: unknown): string {
  const resp = (err as { response?: { status?: number; data?: unknown } })?.response
  const { status, data } = resp ?? {}
  if (status === 403) return 'Your account is not approved — cannot go online.'
  if (typeof data === 'string') {
    if (/<html|<!doctype/i.test(data)) return status === 500 ? 'Server error (500).' : `HTTP ${status ?? '?'} error.`
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
  if (!navigator.onLine) return 'You appear to be offline.'
  return 'Could not toggle online status. Try again.'
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
const IC = {
  Check: ({ c }: { c: string }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  Dollar: ({ c }: { c: string }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
  Clock: ({ c }: { c: string }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  Star: ({ c }: { c: string }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  Cal: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  Trend: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  Pin: ({ c = 'currentColor' }: { c?: string }) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  Maps: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  ),
}

// ── Main component ────────────────────────────────────────────────────────────
export function DriverDashboard() {
  const qc = useQueryClient()
  const now = useClock()
  const [toggleError, setToggleError] = useState<string | null>(null)

  const driver = useQuery({ queryKey: ['driver', 'me'], queryFn: fetchMyDriver, retry: false })
  const isApproved = driver.data?.status === 'approved'

  const statsQuery = useQuery({
    queryKey: ['driver', 'stats'],
    queryFn: fetchDriverStats,
    enabled: isApproved,
    refetchInterval: 30000,
  })
  const offerQuery = useQuery({
    queryKey: ['driver', 'offer'],
    queryFn: fetchCurrentOffer,
    enabled: isApproved && !!driver.data?.is_online,
    refetchInterval: 8000,
  })
  const activeQuery = useQuery({
    queryKey: ['driver', 'active'],
    queryFn: fetchActiveRequest,
    enabled: isApproved,
    refetchInterval: 10000,
  })
  const pendingRatingQuery = useQuery({
    queryKey: ['driver', 'pending-rating'],
    queryFn: fetchDriverPendingRating,
    enabled: isApproved && !activeQuery.data,
    refetchInterval: 30000,
  })

  useLocationBroadcaster(isApproved && !!driver.data?.is_online)
  const livePos = useLivePosition(
    isApproved && !!driver.data?.is_online && (!!offerQuery.data || !!activeQuery.data),
  )

  const wsEvent = useDriverSocket(isApproved && !!driver.data?.is_online)
  useEffect(() => {
    if (wsEvent?.type === 'offer.new') {
      qc.invalidateQueries({ queryKey: ['driver', 'offer'] })
      playOfferAlert()
    }
  }, [wsEvent, qc])

  const onlineMut = useMutation({
    mutationFn: async (turnOn: boolean) => {
      let lat: number | undefined, lng: number | undefined
      if (turnOn && navigator.geolocation) {
        await Promise.race<void>([
          new Promise<void>((res) => navigator.geolocation.getCurrentPosition(
            (p) => { lat = p.coords.latitude; lng = p.coords.longitude; res() },
            () => res(),
            { timeout: 5000, enableHighAccuracy: true },
          )),
          new Promise<void>((res) => setTimeout(res, 6000)),
        ])
      }
      return setDriverOnline({ is_online: turnOn, lat, lng })
    },
    onMutate: () => setToggleError(null),
    onSuccess: (_, turnOn) => {
      qc.invalidateQueries({ queryKey: ['driver', 'me'] })
      qc.invalidateQueries({ queryKey: ['driver', 'stats'] })
      // If GPS wasn't ready at toggle time, retry sending location once it is.
      // This closes the window where the cascade fires before lat/lng is set.
      if (turnOn && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (p) => pingDriverLocation(p.coords.latitude, p.coords.longitude).catch(() => {}),
          undefined,
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
        )
      }
    },
    onError: (err: unknown) => setToggleError(toggleErrorMsg(err)),
  })
  const acceptMut = useMutation({
    mutationFn: (id: number) => acceptOffer(id),
    onSuccess: () => { qc.refetchQueries({ queryKey: ['driver', 'offer'] }); qc.refetchQueries({ queryKey: ['driver', 'active'] }) },
  })
  const declineMut = useMutation({
    mutationFn: (id: number) => declineOffer(id),
    onSuccess: () => qc.refetchQueries({ queryKey: ['driver', 'offer'] }),
  })
  const statusMut = useMutation({
    mutationFn: ({ id, next }: { id: number; next: RequestStatus }) => transitionStatus(id, next),
    onSuccess: (_, { next }) => {
      qc.refetchQueries({ queryKey: ['driver', 'active'] })
      if (next === 'completed') qc.invalidateQueries({ queryKey: ['driver', 'stats'] })
    },
  })

  // ── Non-approved states ──────────────────────────────────────────────────────
  if (driver.isLoading) return <p className="text-charcoal/60">Loading…</p>
  if (driver.isError) return (
    <div>
      <h1 className="text-2xl font-extrabold text-charcoal">Could not load profile</h1>
      <button onClick={() => driver.refetch()} className="mt-4 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold">Retry</button>
    </div>
  )
  if (!driver.data) return (
    <div>
      <h1 className="text-2xl font-extrabold text-charcoal">Welcome, driver</h1>
      <p className="mt-2 text-charcoal/60">Complete onboarding to start.</p>
      <Link to="/driver/onboard" className="mt-4 inline-block bg-primary text-white px-5 py-2.5 rounded-lg font-semibold">Start onboarding →</Link>
    </div>
  )
  if (!isApproved) return (
    <div>
      <h1 className="text-2xl font-extrabold text-charcoal">Awaiting approval</h1>
      <p className="mt-2 text-charcoal/60">Status: <span className="font-semibold uppercase">{driver.data.status}</span></p>
      <Link to="/driver/onboard" className="mt-4 inline-block text-primary underline">Update profile and documents</Link>
    </div>
  )

  const offer      = offerQuery.data ?? null
  const active     = activeQuery.data ?? null
  const isOnline   = driver.data.is_online
  const hasLocation = driver.data.has_location
  const pending    = pendingRatingQuery.data ?? null
  const idle       = !active && !offer

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="space-y-5 pb-12">
      <style>{KF}</style>

      {/* ── Hero / status bar ── */}
      <div className="bg-primary rounded-2xl overflow-hidden relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 150% at 110% 50%, rgba(93,212,160,0.10) 0%, transparent 55%)' }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-7 py-5">
          <div>
            <p className="text-[9px] uppercase tracking-[2.5px] text-[#7aad8e] font-medium mb-1">
              {isOnline ? 'Online — receiving jobs' : 'Status'}
            </p>
            <h1 className="font-heading text-[22px] text-white tracking-[-0.3px] leading-none">
              Driver Dashboard
            </h1>
            <p className="text-sm text-white/45 mt-1.5">
              {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {toggleError && (
              <button onClick={() => setToggleError(null)} className="text-xs text-red-300 max-w-[160px] truncate hover:text-red-100">
                {toggleError} ✕
              </button>
            )}
            <div className="font-mono text-[12px] text-white/50 px-3 py-1.5 rounded-lg border border-white/15">
              {timeStr}
            </div>
            <button
              type="button"
              disabled={onlineMut.isPending}
              onClick={() => onlineMut.mutate(!isOnline)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition disabled:opacity-60 ${
                isOnline
                  ? 'bg-white text-primary hover:bg-white/90'
                  : 'bg-white/10 text-white/70 hover:bg-white/20 border border-white/20'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: isOnline ? '#1a3d2e' : 'rgba(255,255,255,0.5)', animation: isOnline ? 'driverDotPulse 2s infinite' : 'none' }}
              />
              {onlineMut.isPending
                ? isOnline ? 'Going offline…' : 'Going online…'
                : isOnline ? 'Online' : 'Go online'}
            </button>
          </div>
        </div>
      </div>

      {/* ── No-location warning ── */}
      {isOnline && !hasLocation && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <span className="text-lg leading-none flex-shrink-0">⚠️</span>
          <p>
            <strong>Location not shared.</strong> You're online but your device location hasn't been received —
            you won't appear in job matching until GPS is enabled and a location ping is sent.
          </p>
        </div>
      )}

      {/* ── Stats ── */}
      {(() => {
        const s = statsQuery.data
        const jobsVal = s ? String(s.jobs_today) : '—'
        const earnedVal = s ? s.earned_today.toFixed(2) : '—'
        const ratingVal = s?.rating != null ? String(s.rating) : '—'
        const hoursVal = s?.hours_online != null ? String(s.hours_online) : '—'
        const onlineSinceSub = s?.online_since
          ? `Since ${new Date(s.online_since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : isOnline ? `Since ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Offline'
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard accent="#5dd4a0" iconBg="rgba(93,212,160,0.12)" icon={<IC.Check c="#5dd4a0" />} label="Jobs today"   value={jobsVal} sub="completed" />
            <StatCard accent="#60a5fa" iconBg="rgba(96,165,250,0.12)" icon={<IC.Dollar c="#60a5fa" />} label="Earned today" value={earnedVal} prefix={s ? "GHS" : undefined} sub="after commission" />
            <StatCard accent="#f59e0b" iconBg="rgba(245,158,11,0.12)" icon={<IC.Clock c="#f59e0b" />} label="Hours online" value={hoursVal} sub={onlineSinceSub} />
            <StatCard accent="#a78bfa" iconBg="rgba(167,139,250,0.12)" icon={<IC.Star c="#a78bfa" />} label="Rating"        value={ratingVal} sub="From trips" />
          </div>
        )
      })()}

      {/* ── Main grid ── */}
      <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">

        {/* Left col */}
        <div className="space-y-4">
          <LiveFeedPanel
            offer={offer}
            active={active}
            pending={pending}
            isOnline={isOnline}
            livePos={livePos}
            onAccept={() => offer && acceptMut.mutate(offer.assignment_id)}
            onDecline={() => offer && declineMut.mutate(offer.assignment_id)}
            onAction={(next) => active && statusMut.mutate({ id: active.id, next })}
            acceptPending={acceptMut.isPending}
            declinePending={declineMut.isPending}
            statusPending={statusMut.isPending}
          />
          {idle && <MapStrip />}
        </div>

        {/* Right col */}
        <div className="space-y-3">
          <SchedulePanel active={active} />
          <EarningsPanel now={now} />
        </div>
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  accent, iconBg, icon, label, value, prefix, sub,
}: {
  accent: string; iconBg: string; icon: ReactNode
  label: string; value: string; prefix?: string; sub?: string
}) {
  return (
    <div className="bg-white border border-charcoal/8 rounded-xl px-5 py-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: accent }} />
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3 mt-1" style={{ background: iconBg }}>
        {icon}
      </div>
      <p className="text-[10px] uppercase tracking-[1.6px] text-charcoal/65 font-semibold mb-1">{label}</p>
      <p className="font-sans font-bold text-[26px] leading-none text-charcoal">
        {prefix && <span className="text-xs font-normal text-charcoal/50 mr-0.5">{prefix} </span>}
        {value}
      </p>
      {sub && <p className="text-[11.5px] text-charcoal/55 mt-1.5">{sub}</p>}
    </div>
  )
}

// ── Live feed panel ───────────────────────────────────────────────────────────

function LiveFeedPanel({
  offer, active, pending, isOnline, livePos,
  onAccept, onDecline, onAction,
  acceptPending, declinePending, statusPending,
}: {
  offer: DriverOffer | null
  active: ServiceRequest | null
  pending: { id: number } | null
  isOnline: boolean
  livePos: LatLng | null
  onAccept: () => void; onDecline: () => void; onAction: (next: RequestStatus) => void
  acceptPending: boolean; declinePending: boolean; statusPending: boolean
}) {
  return (
    <div className="bg-white border border-charcoal/8 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-charcoal/6 flex items-center gap-2">
        <span className="text-charcoal/40"><IC.Search /></span>
        <h2 className="text-sm font-semibold text-charcoal">Live job feed</h2>
      </div>

      {active ? (
        <ActiveBody req={active} livePos={livePos} onAction={onAction} isPending={statusPending} />
      ) : offer ? (
        <OfferBody offer={offer} livePos={livePos} onAccept={onAccept} onDecline={onDecline} acceptPending={acceptPending} declinePending={declinePending} />
      ) : pending ? (
        <div className="p-5">
          <p className="text-sm text-charcoal/60 mb-4">Rate the customer for completed job #{pending.id}.</p>
          <RatingForm requestId={pending.id} label="Rate the customer" />
        </div>
      ) : isOnline ? (
        <WaitingBody />
      ) : (
        <OfflineBody />
      )}
    </div>
  )
}

// ── Active job body ───────────────────────────────────────────────────────────

function ActiveBody({
  req, livePos, onAction, isPending,
}: {
  req: ServiceRequest; livePos: LatLng | null
  onAction: (next: RequestStatus) => void; isPending: boolean
}) {
  const next = NEXT_STATUS[req.status]
  const earnings = (Number(req.quote_total) - Number(req.commission_amount)).toFixed(2)
  return (
    <div>
      <div className="px-5 py-4 flex items-start justify-between gap-3 border-b border-charcoal/6">
        <div>
          <p className="text-[9px] uppercase tracking-[2.5px] text-primary font-medium mb-1">Active job</p>
          <h2 className="text-[17px] font-bold text-charcoal">
            #{req.id} · {req.waste_type.replace('_', ' ')}
          </h2>
          <p className="text-sm text-charcoal/55 mt-0.5">
            {req.volume_tier} · {req.pickup_address || `${req.pickup_lat}, ${req.pickup_lng}`}
          </p>
          {req.notes && <p className="text-sm text-charcoal/55 mt-1">📝 {req.notes}</p>}
        </div>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0">
          {req.status.replace('_', ' ')}
        </span>
      </div>

      <div className="px-5 py-4 flex items-center gap-8 border-b border-charcoal/6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-charcoal/40 mb-0.5">Your earnings</p>
          <p className="font-heading text-2xl font-bold text-primary">GHS {earnings}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-charcoal/40 mb-0.5">Quote total</p>
          <p className="font-heading text-xl text-charcoal">GHS {req.quote_total}</p>
        </div>
      </div>

      {(req.gate_fits_truck || req.tank_location || req.gate_photo || req.tank_cover_photo) && (
        <div className="px-5 py-4 border-b border-charcoal/6">
          <SiteSurveyLight req={req} />
        </div>
      )}

      <div className="px-5 py-4 border-b border-charcoal/6">
        <DriverRouteMap pickup={{ lat: Number(req.pickup_lat), lng: Number(req.pickup_lng) }} driver={livePos} height={200} />
      </div>

      <div className="px-5 py-4 flex flex-wrap gap-3">
        {next && (
          <button
            onClick={() => onAction(next)}
            disabled={isPending}
            className="bg-primary text-white px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-primary/90 disabled:opacity-60 transition"
          >
            {NEXT_BTN[next] ?? next.replace('_', ' ')}
          </button>
        )}
        <a
          href={navigateUrl(req.pickup_lat, req.pickup_lng)}
          target="_blank" rel="noreferrer"
          className="px-5 py-2.5 rounded-lg font-semibold text-sm inline-flex items-center gap-2 bg-white border border-charcoal/15 text-charcoal hover:bg-charcoal/5 transition"
        >
          🧭 Open in Google Maps
        </a>
      </div>
    </div>
  )
}

// ── Offer body ────────────────────────────────────────────────────────────────

function OfferBody({
  offer, livePos, onAccept, onDecline, acceptPending, declinePending,
}: {
  offer: DriverOffer; livePos: LatLng | null
  onAccept: () => void; onDecline: () => void
  acceptPending: boolean; declinePending: boolean
}) {
  return (
    <div>
      <div className="px-5 py-4 flex items-start justify-between gap-3 bg-primary/5 border-b border-primary/10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#5dd4a0] animate-pulse flex-shrink-0" />
            <p className="text-[9px] uppercase tracking-[2.5px] text-primary font-medium">Incoming offer</p>
          </div>
          <h2 className="text-[17px] font-bold text-charcoal">
            {offer.request.waste_type.replace('_', ' ')} · {offer.request.volume_tier}
          </h2>
          <p className="text-sm text-charcoal/55 mt-0.5">
            {offer.distance_km.toFixed(2)} km away · {offer.request.pickup_address || 'Location pinned on map'}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-charcoal/40 mb-0.5">Quote</p>
          <p className="font-heading text-2xl font-bold text-primary">GHS {offer.request.quote_total}</p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4 border-b border-charcoal/6">
        <OfferCountdown expiresAt={offer.expires_at} />
        <SiteSurveyLight req={offer.request} />
        <DriverRouteMap
          pickup={{ lat: Number(offer.request.pickup_lat), lng: Number(offer.request.pickup_lng) }}
          driver={livePos} height={180} liveRefresh={false}
        />
      </div>

      <div className="px-5 py-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onAccept} disabled={acceptPending}
          className="bg-primary text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-primary/90 disabled:opacity-60 transition"
        >
          {acceptPending ? 'Accepting…' : 'Accept'}
        </button>
        <button
          onClick={onDecline} disabled={declinePending}
          className="bg-white border border-charcoal/15 text-charcoal/70 px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-charcoal/5 disabled:opacity-60 transition"
        >
          {declinePending ? 'Declining…' : 'Decline'}
        </button>
        <a
          href={navigateUrl(offer.request.pickup_lat, offer.request.pickup_lng)}
          target="_blank" rel="noreferrer"
          className="ml-auto text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1.5"
        >
          🧭 Preview in Maps
        </a>
      </div>
    </div>
  )
}

// ── Waiting body ──────────────────────────────────────────────────────────────

function WaitingBody() {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-8 gap-5 text-center">
      <div className="relative" style={{ width: 100, height: 100 }}>
        {([0, 0.7, 1.4] as const).map((delay, i) => {
          const sz = [30, 60, 90][i]
          return (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: sz, height: sz,
                top: '50%', left: '50%',
                transform: 'translate(-50%,-50%)',
                border: '1.5px solid rgba(26,61,46,0.18)',
                animation: `radarRing 2.5s ease-out ${delay}s infinite`,
              }}
            />
          )
        })}
        <div
          className="absolute rounded-full"
          style={{
            width: 14, height: 14,
            top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            background: '#1a3d2e',
            boxShadow: '0 0 10px rgba(26,61,46,0.35)',
          }}
        />
      </div>

      <div>
        <p className="text-[15px] font-semibold text-charcoal mb-1">Scanning for nearby jobs…</p>
        <p className="text-[13px] text-charcoal/50 max-w-[240px] leading-relaxed">
          You'll be notified automatically when a collection job is dispatched in your zone.
        </p>
      </div>

      <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-mono border border-charcoal/10 bg-charcoal/4 text-charcoal/50">
        <IC.Pin c="#5dd4a0" /> Online &amp; ready
      </div>
    </div>
  )
}

// ── Offline body ──────────────────────────────────────────────────────────────

function OfflineBody() {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-8 gap-4 text-center">
      <div className="w-14 h-14 rounded-full bg-charcoal/5 border border-charcoal/8 flex items-center justify-center text-2xl">
        🌙
      </div>
      <div>
        <p className="text-[15px] font-semibold text-charcoal mb-1">You're offline</p>
        <p className="text-[13px] text-charcoal/50">Go online to start receiving job offers.</p>
      </div>
    </div>
  )
}

// ── Map strip ─────────────────────────────────────────────────────────────────

function MapStrip() {
  return (
    <div
      className="bg-white border border-charcoal/8 rounded-2xl overflow-hidden relative flex items-center justify-center shadow-sm"
      style={{ height: 120 }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'linear-gradient(rgba(26,61,46,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(26,61,46,0.05) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      <div className="absolute" style={{ top: 46, left: 180, zIndex: 2 }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: '#1a3d2e', animation: 'mapLocPulse 2s ease-out infinite' }}
        />
        <div className="relative rounded-full" style={{ width: 8, height: 8, background: '#1a3d2e', boxShadow: '0 0 6px rgba(26,61,46,0.6)' }} />
      </div>
      <div className="relative z-10 flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] bg-white/90 border border-charcoal/10 text-charcoal/60 shadow-sm">
        <IC.Maps /> Current position updating…
      </div>
    </div>
  )
}

// ── Schedule panel ────────────────────────────────────────────────────────────

function SchedulePanel({ active }: { active: ServiceRequest | null }) {
  return (
    <div className="bg-white border border-charcoal/8 rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3.5 border-b border-charcoal/6 flex items-center gap-2">
        <span className="text-charcoal/40"><IC.Cal /></span>
        <h2 className="text-sm font-semibold text-charcoal">Today's schedule</h2>
      </div>

      {active ? (
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="font-mono text-[11px] text-charcoal/35 w-9 flex-shrink-0">Now</span>
          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-amber-400" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-charcoal truncate">
              {active.waste_type.replace('_', ' ')} · {active.volume_tier}
            </p>
            <p className="text-[11px] text-charcoal/40 mt-0.5 truncate">
              {active.pickup_address || `${active.pickup_lat}, ${active.pickup_lng}`}
            </p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded font-medium uppercase bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0">
            Active
          </span>
        </div>
      ) : (
        <div className="py-8 text-center">
          <p className="text-[13px] text-charcoal/40">No jobs scheduled today</p>
        </div>
      )}
    </div>
  )
}

// ── Earnings panel ────────────────────────────────────────────────────────────

function EarningsPanel({ now }: { now: Date }) {
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Today', 'Sun']
  const rawDay = now.getDay() // 0=Sun,1=Mon,...
  // Map to our DAYS index: Mon=0...Fri=4, Today=5 (we show Sat as Today if that's today, or adjust)
  // Simplify: highlight whichever column matches today
  const todayLabel = rawDay === 0 ? 6 : rawDay === 6 ? 5 : rawDay - 1

  return (
    <div className="bg-white border border-charcoal/8 rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3.5 border-b border-charcoal/6 flex items-center gap-2">
        <span className="text-charcoal/40"><IC.Trend /></span>
        <h2 className="text-sm font-semibold text-charcoal">Weekly earnings</h2>
      </div>

      <div className="px-4 py-4">
        <div className="flex items-baseline gap-1 mb-4">
          <span className="text-xs text-charcoal/40 font-mono">GHS</span>
          <span className="font-heading text-[28px] font-extrabold leading-none text-charcoal">0</span>
          <span className="text-xs text-charcoal/40 ml-1">this week</span>
        </div>

        <div className="flex items-end gap-1 mb-2" style={{ height: 28 }}>
          {DAYS.map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm transition-colors"
              style={{
                height: '12%',
                background: i === todayLabel ? '#1a3d2e' : 'rgba(26,26,26,0.07)',
              }}
            />
          ))}
        </div>

        <div className="flex">
          {DAYS.map((d, i) => (
            <span
              key={d}
              className="flex-1 text-center font-mono"
              style={{ fontSize: 10, color: i === todayLabel ? '#1a3d2e' : 'rgba(26,26,26,0.35)' }}
            >
              {d === 'Today' ? 'Today' : d}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Offer countdown ───────────────────────────────────────────────────────────

function OfferCountdown({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(() =>
    Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  )
  useEffect(() => {
    const iv = setInterval(() => setSecs(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000))), 1000)
    return () => clearInterval(iv)
  }, [expiresAt])

  const urgent = secs <= 30
  const pct = Math.min(100, (secs / 60) * 100)

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] uppercase tracking-wider text-charcoal/40 font-medium">Time to accept</p>
        <p className={`text-sm font-bold tabular-nums ${urgent ? 'text-red-600' : 'text-primary'}`}>
          {secs > 0 ? `${secs}s` : 'Expired'}
        </p>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-charcoal/8">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: urgent ? '#ef4444' : '#1a3d2e', transition: 'width 1s linear, background 0.3s' }}
        />
      </div>
    </div>
  )
}

// ── Site survey (light) ───────────────────────────────────────────────────────

const LABELS = {
  gate:  { yes: 'Fits', no: 'Too small', unsure: 'Not sure' } as Record<string, string>,
  tank:  { front: 'Front', side: 'Side', back: 'Back', under_driveway: 'Under driveway', other: 'Other' } as Record<string, string>,
  park:  { at_gate: 'At gate', '5_10': '5–10 m', '10_20': '10–20 m', '20_plus': '20 m+' } as Record<string, string>,
  cover: { open: 'Open', closed_accessible: 'Closed (accessible)', sealed: 'Sealed (break)', unknown: 'Unknown' } as Record<string, string>,
  last:  { lt_6m: '<6 mo', '6_12m': '6–12 mo', '1_2y': '1–2 y', gt_2y: '2 y+', never: 'Never', unknown: 'Unknown' } as Record<string, string>,
  time:  { asap: 'ASAP', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' } as Record<string, string>,
}

function SiteSurveyLight({ req }: { req: ServiceRequest }) {
  const facts: { k: string; v: string }[] = []
  if (req.gate_fits_truck)         facts.push({ k: 'Gate',         v: LABELS.gate[req.gate_fits_truck]          ?? req.gate_fits_truck })
  if (req.tank_location)           facts.push({ k: 'Tank',         v: LABELS.tank[req.tank_location]            ?? req.tank_location })
  if (req.truck_parking_distance)  facts.push({ k: 'Park',         v: LABELS.park[req.truck_parking_distance]   ?? req.truck_parking_distance })
  if (req.tank_cover_state)        facts.push({ k: 'Cover',        v: LABELS.cover[req.tank_cover_state]        ?? req.tank_cover_state })
  if (req.last_emptied)            facts.push({ k: 'Last emptied', v: LABELS.last[req.last_emptied]             ?? req.last_emptied })
  if (req.is_overflowing != null)  facts.push({ k: 'Overflowing',  v: req.is_overflowing ? 'Yes' : 'No' })
  if (req.preferred_time)          facts.push({ k: 'When',         v: LABELS.time[req.preferred_time]           ?? req.preferred_time })
  if (req.someone_on_site != null) facts.push({ k: 'On site',      v: req.someone_on_site ? 'Yes' : 'No' })

  if (facts.length === 0 && !req.gate_photo && !req.tank_cover_photo) return null

  return (
    <div className="rounded-xl p-3.5 bg-charcoal/[0.025] border border-charcoal/8">
      <p className="text-[10px] uppercase tracking-wider font-bold text-charcoal/40 mb-2.5">Site survey</p>
      {facts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {facts.map((f) => (
            <span key={f.k} className="text-xs px-2.5 py-1 rounded-full bg-charcoal/6 border border-charcoal/10 text-charcoal">
              <span className="text-charcoal/45">{f.k}: </span><span className="font-medium">{f.v}</span>
            </span>
          ))}
        </div>
      )}
      {(req.gate_photo || req.tank_cover_photo) && (
        <div className="flex gap-3">
          {req.gate_photo && (
            <a href={req.gate_photo} target="_blank" rel="noreferrer" className="block flex-shrink-0">
              <img src={req.gate_photo} alt="Gate" className="w-20 h-20 object-cover rounded-lg border border-charcoal/10"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              <p className="text-[10px] text-center mt-1 text-charcoal/40">Gate</p>
            </a>
          )}
          {req.tank_cover_photo && (
            <a href={req.tank_cover_photo} target="_blank" rel="noreferrer" className="block flex-shrink-0">
              <img src={req.tank_cover_photo} alt="Tank cover" className="w-20 h-20 object-cover rounded-lg border border-charcoal/10"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              <p className="text-[10px] text-center mt-1 text-charcoal/40">Tank</p>
            </a>
          )}
        </div>
      )}
    </div>
  )
}
