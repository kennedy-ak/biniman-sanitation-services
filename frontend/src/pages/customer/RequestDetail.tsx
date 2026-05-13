import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cancelRequest, fetchMyRequests, fetchRequest, retryRequest } from '@/api/requests'
import { useRequestSocket } from '@/hooks/useRequestSocket'
import { fetchUserSummary } from '@/api/ratings'
import { RatingForm, Stars } from '@/components/RatingForm'
import { LiveMap } from '@/components/LiveMap'
import type { RequestStatus } from '@/types'

const STATUS_STEPS: { value: RequestStatus; label: string; desc: string; icon: string }[] = [
  { value: 'pending', label: 'Submitted', desc: 'Request received', icon: '📝' },
  { value: 'assigned', label: 'Finding driver', desc: 'Searching nearby', icon: '🔍' },
  { value: 'accepted', label: 'Driver assigned', desc: 'A driver accepted', icon: '✓' },
  { value: 'en_route', label: 'En route', desc: 'Driver is on the way', icon: '🚛' },
  { value: 'arrived', label: 'Arrived', desc: 'Driver at your location', icon: '📍' },
  { value: 'completed', label: 'Completed', desc: 'Job done', icon: '🎉' },
]

const WASTE_ICON: Record<string, string> = {
  septic: '🚽',
  soak_pit: '🕳️',
  industrial: '🏭',
}

const STATUS_TONE: Record<RequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  assigned: 'bg-amber-100 text-amber-800',
  accepted: 'bg-blue-100 text-blue-800',
  en_route: 'bg-blue-100 text-blue-800',
  arrived: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  unfulfilled: 'bg-red-100 text-red-800',
}

export function CustomerRequestDetail() {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)
  const location = useLocation()
  const stateSeq: number | undefined = (location.state as { seq?: number } | null)?.seq

  // Fallback: derive seq from cached list if navigated directly (no state)
  const listQuery = useQuery({
    queryKey: ['requests', 'mine'],
    queryFn: fetchMyRequests,
    enabled: stateSeq == null,
    staleTime: 60_000,
  })
  const seq = stateSeq ?? (() => {
    if (!listQuery.data) return null
    const sorted = [...listQuery.data].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
    const idx = sorted.findIndex((r) => r.id === id)
    return idx >= 0 ? idx + 1 : null
  })()
  const qc = useQueryClient()
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const reqQuery = useQuery({
    queryKey: ['request', id],
    queryFn: () => fetchRequest(id),
    enabled: Number.isFinite(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      const terminal = status === 'completed' || status === 'cancelled' || status === 'unfulfilled'
      return terminal ? false : 3000
    },
  })

  const { latest, driverLoc } = useRequestSocket(Number.isFinite(id) ? id : null)

  useEffect(() => {
    if (latest?.type === 'request.status') {
      qc.invalidateQueries({ queryKey: ['request', id] })
    }
  }, [latest, id, qc])

  const [cancelError, setCancelError] = useState<string | null>(null)

  const cancelMut = useMutation({
    mutationFn: (reason: string) => cancelRequest(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['request', id] })
      setShowCancel(false)
      setCancelError(null)
    },
    onError: (err: Error & { response?: { data?: { detail?: string; reason?: string[] } } }) => {
      const data = err.response?.data
      setCancelError(
        data?.detail ?? data?.reason?.[0] ?? err.message ?? 'Could not cancel the request.',
      )
    },
  })

  const [retryError, setRetryError] = useState<string | null>(null)
  const retryMut = useMutation({
    mutationFn: () => retryRequest(id),
    onSuccess: (data) => {
      setRetryError(null)
      qc.setQueryData(['request', id], data)
    },
    onError: (err: { response?: { status?: number; data?: unknown } }) => {
      const data = err.response?.data
      const detail =
        typeof data === 'object' && data !== null && 'detail' in data
          ? String((data as { detail: unknown }).detail)
          : typeof data === 'string'
            ? data
            : `Error ${err.response?.status ?? 'unknown'}`
      setRetryError(detail)
    },
  })

  if (reqQuery.isLoading) return <p className="text-charcoal/60">Loading…</p>
  if (!reqQuery.data) return <p className="text-charcoal/60">Not found.</p>

  const sr = reqQuery.data
  // When completed, push index past the last step so every step renders as done (green ✓).
  const currentStepIdx = sr.status === 'completed'
    ? STATUS_STEPS.length
    : STATUS_STEPS.findIndex((s) => s.value === sr.status)
  const isTerminal =
    sr.status === 'completed' || sr.status === 'cancelled' || sr.status === 'unfulfilled'
  const showMap = sr.driver && ['accepted', 'en_route', 'arrived'].includes(sr.status)

  return (
    <div className="space-y-6">
      <Link
        to="/customer/requests"
        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
      >
        ← Back to requests
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary to-[#084d29] text-white rounded-2xl p-6 md:p-8 shadow-lg">
        <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur grid place-items-center text-3xl border border-white/20 flex-shrink-0">
            {WASTE_ICON[sr.waste_type] || '🛢️'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest text-accent font-bold">
              {seq != null ? `Request ${seq}` : `Request #${sr.id}`}
            </div>
            <h1 className="mt-1 font-heading text-3xl md:text-4xl font-extrabold capitalize">
              {sr.waste_type.replace('_', ' ')} · {sr.volume_tier} tank
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_TONE[sr.status]}`}
              >
                {sr.status.replace('_', ' ')}
              </span>
              <span className="text-white/85">
                Booked{' '}
                {new Date(sr.created_at).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </div>
          </div>
          <div className="w-full sm:w-auto bg-white/10 backdrop-blur rounded-xl px-5 py-3 border border-white/15 text-center sm:text-right">
            <div className="text-[10px] uppercase tracking-wider text-white/60 font-semibold">
              Quote
            </div>
            <div className="font-heading text-3xl font-extrabold">
              GHS {sr.quote_total}
            </div>
          </div>
        </div>
      </div>

      {/* Pay CTA — pay-first flow: shown until payment succeeds. */}
      {(sr.payment_status == null || sr.payment_status === 'pending') && !isTerminal && (
        <Link
          to={`/customer/requests/${sr.id}/pay`}
          className="block bg-gradient-to-r from-accent to-amber-300 text-charcoal rounded-2xl p-5 shadow-sm hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/40 grid place-items-center text-xl">
                💳
              </div>
              <div>
                <div className="font-bold">Complete payment to dispatch a driver</div>
                <div className="text-sm text-charcoal/70">
                  Your request is on hold until payment is confirmed. We'll
                  start matching a driver the moment it clears.
                </div>
              </div>
            </div>
            <span className="font-bold text-sm group-hover:translate-x-1 transition">
              Pay GHS {sr.quote_total} →
            </span>
          </div>
        </Link>
      )}

      {/* Status timeline */}
      <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm p-6">
        <h2 className="font-heading font-bold text-lg">Status</h2>
        {sr.status === 'cancelled' || sr.status === 'unfulfilled' ? (
          <div
            className={`mt-4 p-4 rounded-xl border ${
              sr.status === 'cancelled'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <div className="font-bold">
              {sr.status === 'cancelled' ? 'Request cancelled' : 'Could not match a driver'}
            </div>
            <div className="text-sm mt-1">
              {sr.status === 'cancelled'
                ? sr.cancel_reason || 'No reason provided.'
                : 'No drivers were available in your area.'}
            </div>
            {sr.status === 'unfulfilled' && (
              <div className="mt-3">
                <button
                  onClick={() => retryMut.mutate()}
                  disabled={retryMut.isPending}
                  className="inline-flex items-center gap-2 bg-primary text-white font-bold px-5 py-2.5 rounded-lg hover:bg-primary/90 transition disabled:opacity-60"
                >
                  {retryMut.isPending ? 'Searching…' : '🔄 Find me a driver'}
                </button>
                {retryError && (
                  <p className="mt-2 text-sm text-red-700">{retryError}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <ol className="mt-5 relative">
            <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-charcoal/10" />
            <div
              className="absolute left-[15px] top-2 w-0.5 bg-primary transition-all"
              style={{
                height: `calc(${Math.max(0, currentStepIdx) * 64}px + 12px)`,
              }}
            />
            {STATUS_STEPS.map((step, idx) => {
              const done = currentStepIdx > idx
              const active = currentStepIdx === idx
              return (
                <li key={step.value} className="relative flex items-start gap-4 pb-6 last:pb-0">
                  <span
                    className={`relative z-10 w-8 h-8 rounded-full grid place-items-center text-xs font-bold flex-shrink-0 transition ${
                      done
                        ? 'bg-primary text-white'
                        : active
                          ? 'bg-accent text-charcoal ring-4 ring-accent/30'
                          : 'bg-charcoal/10 text-charcoal/40'
                    }`}
                  >
                    {done ? '✓' : idx + 1}
                  </span>
                  <div className="pt-0.5">
                    <div
                      className={`font-bold ${active ? 'text-primary' : done ? 'text-charcoal' : 'text-charcoal/50'}`}
                    >
                      {step.label}
                    </div>
                    <div className="text-xs text-charcoal/60">
                      {active && step.value === 'pending'
                        ? 'Searching for the nearest driver…'
                        : active &&
                            step.value === 'completed' &&
                            sr.payment_status !== 'succeeded'
                          ? 'Job done — settle payment to release driver payout'
                          : step.desc}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* Driver + map split */}
      {sr.driver && (
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4">
          <DriverCard
            driverUserId={sr.driver.user.id}
            name={sr.driver.user.full_name || sr.driver.user.phone}
            phone={sr.driver.user.phone}
            vehicleReg={sr.driver.vehicle_reg}
            vehicleType={sr.driver.vehicle_type}
          />
          {showMap && (
            <div className="bg-white border border-charcoal/5 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-charcoal/5 flex items-center justify-between">
                <h2 className="font-heading font-bold">Where's my driver?</h2>
                {!driverLoc && (
                  <span className="text-xs text-charcoal/60 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    Awaiting first ping
                  </span>
                )}
              </div>
              <LiveMap
                pickup={{ lat: Number(sr.pickup_lat), lng: Number(sr.pickup_lng) }}
                driver={driverLoc}
                height={320}
              />
            </div>
          )}
        </div>
      )}

      {/* Pickup details */}
      <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm p-6">
        <h2 className="font-heading font-bold text-lg">Pickup details</h2>
        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <Detail label="Location" icon="📍">
            {sr.pickup_address || `${sr.pickup_lat}, ${sr.pickup_lng}`}
          </Detail>
          <Detail label="Volume" icon="📦">
            {sr.volume_tier} tank
          </Detail>
          {sr.notes && (
            <Detail label="Notes for driver" icon="📝" full>
              {sr.notes}
            </Detail>
          )}
        </div>
      </section>

      {/* Quote breakdown */}
      <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm p-6">
        <h2 className="font-heading font-bold text-lg">Quote breakdown</h2>
        <div className="mt-4 space-y-2 text-sm">
          <Row label="Base fee" value={`GHS ${sr.quote_base_fee}`} />
          <Row
            label={`Distance (${Number(sr.quote_distance_km).toFixed(1)} km)`}
            value={`GHS ${sr.quote_distance_fee}`}
          />
          <Row label="Tank size fee" value={`GHS ${sr.quote_tier_fee}`} />
          <div className="pt-3 mt-2 border-t border-charcoal/10 flex justify-between items-center">
            <span className="font-bold">Total</span>
            <span className="font-heading text-2xl font-extrabold text-primary">
              GHS {sr.quote_total}
            </span>
          </div>
        </div>
      </section>

      {/* Rating */}
      {sr.status === 'completed' && sr.driver && (
        <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm p-6">
          <RatingForm requestId={sr.id} label="Rate your driver" />
        </section>
      )}

      {/* Cancel */}
      {!isTerminal && (
        <section className="border border-red-200 bg-red-50/40 rounded-2xl p-5">
          {!showCancel ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-red-900">Need to cancel?</h3>
                <p className="text-sm text-red-800/80">
                  Cancellation may incur fees if a driver is already on the way.
                </p>
              </div>
              <button
                onClick={() => setShowCancel(true)}
                className="bg-white border border-red-300 text-red-700 font-bold px-4 py-2 rounded-lg hover:bg-red-50 transition"
              >
                Cancel request
              </button>
            </div>
          ) : (
            <div>
              <h3 className="font-bold text-red-900">Cancel request #{sr.id}?</h3>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Tell us why (optional)…"
                rows={3}
                className="input mt-3 resize-none"
              />
              {cancelError && (
                <p className="mt-2 text-sm text-red-700 bg-red-100 border border-red-200 rounded-md px-3 py-2">
                  {cancelError}
                </p>
              )}
              <div className="mt-3 flex gap-2 justify-end">
                <button
                  onClick={() => setShowCancel(false)}
                  className="px-4 py-2 rounded-lg text-charcoal/70 hover:bg-white/60 font-semibold text-sm"
                >
                  Keep request
                </button>
                <button
                  disabled={cancelMut.isPending}
                  onClick={() => cancelMut.mutate(cancelReason)}
                  className="bg-red-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-60 transition text-sm"
                >
                  {cancelMut.isPending ? 'Cancelling…' : 'Yes, cancel'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function DriverCard({
  driverUserId,
  name,
  phone,
  vehicleReg,
  vehicleType,
}: {
  driverUserId: number
  name: string
  phone: string
  vehicleReg: string
  vehicleType: string
}) {
  const summary = useQuery({
    queryKey: ['rating-summary', driverUserId],
    queryFn: () => fetchUserSummary(driverUserId),
  })
  const init = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="bg-white border border-charcoal/5 rounded-2xl shadow-sm p-6">
      <div className="text-xs uppercase tracking-widest text-charcoal/50 font-bold">
        Your driver
      </div>
      <div className="mt-3 flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-primary text-white grid place-items-center font-bold text-lg flex-shrink-0">
          {init}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-heading font-extrabold text-lg text-charcoal truncate">
            {name}
          </div>
          {summary.data?.avg !== null && summary.data?.avg !== undefined && (
            <div className="mt-1 flex items-center gap-2 text-sm">
              <Stars score={Math.round(summary.data.avg)} />
              <span className="text-charcoal/70 text-xs">
                {summary.data.avg.toFixed(1)} ({summary.data.count})
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-charcoal/80">
          <span className="text-charcoal/50">🚛</span>
          <span className="font-medium capitalize">
            {vehicleType.replace('_', ' ')} · {vehicleReg}
          </span>
        </div>
        <a
          href={`tel:${phone}`}
          className="flex items-center gap-2 text-primary font-semibold hover:underline"
        >
          <span>📞</span>
          <span>{phone}</span>
        </a>
      </div>
    </div>
  )
}

function Detail({
  label,
  icon,
  children,
  full,
}: {
  label: string
  icon: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <div className="text-[10px] uppercase tracking-wider text-charcoal/50 font-semibold">
        {label}
      </div>
      <div className="mt-1 text-charcoal flex items-start gap-2">
        <span className="text-charcoal/40">{icon}</span>
        <span className="capitalize">{children}</span>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-charcoal/80">
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}
