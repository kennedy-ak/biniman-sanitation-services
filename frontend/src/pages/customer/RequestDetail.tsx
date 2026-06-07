import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cancelRequest, fetchMyRequests, fetchRequest, fetchDisputeThread, replyToDispute, submitCancelReason, downloadReceipt, retryRequest, type DisputeThreadMessage } from '@/api/requests'
import { useRequestSocket } from '@/hooks/useRequestSocket'
import { fetchUserSummary } from '@/api/ratings'
import { RatingForm, Stars } from '@/components/RatingForm'
import { LiveMap } from '@/components/LiveMap'
import type { RequestStatus } from '@/types'

const STATUS_STEPS: { value: RequestStatus; label: string; desc: string }[] = [
  { value: 'pending',   label: 'Submitted',       desc: 'Request received' },
  { value: 'assigned',  label: 'Finding driver',   desc: 'Searching nearby' },
  { value: 'accepted',  label: 'Driver assigned',  desc: 'A driver accepted' },
  { value: 'en_route',  label: 'En route',         desc: 'Driver is on the way' },
  { value: 'arrived',   label: 'Arrived',          desc: 'Driver at your location' },
  { value: 'completed', label: 'Completed',        desc: 'Job done' },
]

const WASTE_ICON: Record<string, string> = {
  septic: '🚽',
  soak_pit: '🕳️',
  industrial: '🏭',
}

const STATUS_BADGE: Record<RequestStatus, { label: string; cls: string; dot?: boolean }> = {
  pending:     { label: 'Finding driver', cls: 'bg-amber-100 text-amber-800', dot: true },
  assigned:    { label: 'Offering driver', cls: 'bg-amber-100 text-amber-800', dot: true },
  accepted:    { label: 'Driver assigned', cls: 'bg-blue-100 text-blue-800' },
  en_route:    { label: 'En route', cls: 'bg-blue-100 text-blue-800', dot: true },
  arrived:     { label: 'Arrived', cls: 'bg-purple-100 text-purple-800' },
  completed:   { label: 'Completed', cls: 'bg-green-100 text-green-800' },
  cancelled:   { label: 'Cancelled', cls: 'bg-red-100 text-red-800' },
  unfulfilled: { label: 'Unfulfilled', cls: 'bg-red-100 text-red-800' },
}

export function CustomerRequestDetail() {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)
  const location = useLocation()
  const locationState = location.state as { seq?: number; justPaid?: boolean } | null
  const stateSeq: number | undefined = locationState?.seq

  // After payment, the cascade might complete before the browser navigates here.
  // Give it a 30-second window where we keep polling even if the status is terminal,
  // so the customer sees the "Finding driver" state rather than landing on UNFULFILLED.
  const [justPaidUntil] = useState<number>(() =>
    locationState?.justPaid ? Date.now() + 30_000 : 0
  )

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
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [receiptDownloading, setReceiptDownloading] = useState(false)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [retryError, setRetryError] = useState<string | null>(null)

  const reqQuery = useQuery({
    queryKey: ['request', id],
    queryFn: () => fetchRequest(id),
    enabled: Number.isFinite(id),
    refetchInterval: (query) => {
      const data = query.state.data
      const status = data?.status
      const terminal = status === 'completed' || status === 'cancelled' || status === 'unfulfilled'
      if (terminal && Date.now() < justPaidUntil) return 5000
      return terminal ? false : 10000
    },
  })

  const { latest, driverLoc } = useRequestSocket(Number.isFinite(id) ? id : null)

  useEffect(() => {
    if (latest?.type === 'request.status') {
      qc.invalidateQueries({ queryKey: ['request', id] })
    }
  }, [latest, id, qc])

  const cancelMut = useMutation({
    mutationFn: (reason: string) => cancelRequest(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['request', id] })
      setShowCancel(false)
      setCancelError(null)
    },
    onError: (err: Error & { response?: { data?: { detail?: string; reason?: string[] } } }) => {
      const data = err.response?.data
      setCancelError(data?.detail ?? data?.reason?.[0] ?? err.message ?? 'Could not cancel.')
    },
  })

  async function handleDownloadReceipt() {
    setReceiptDownloading(true)
    setReceiptError(null)
    try {
      await downloadReceipt(id)
    } catch {
      setReceiptError('Could not download receipt. Please try again.')
    } finally {
      setReceiptDownloading(false)
    }
  }

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
          : typeof data === 'string' ? data : `Error ${err.response?.status ?? 'unknown'}`
      setRetryError(detail)
    },
  })

  if (reqQuery.isLoading) return <p className="text-charcoal/60">Loading…</p>
  if (!reqQuery.data) return <p className="text-charcoal/60">Not found.</p>

  const sr = reqQuery.data
  const currentStepIdx = sr.status === 'completed'
    ? STATUS_STEPS.length
    : STATUS_STEPS.findIndex((s) => s.value === sr.status)
  const isTerminal = sr.status === 'completed' || sr.status === 'cancelled' || sr.status === 'unfulfilled'
  const showMap = sr.driver && ['accepted', 'en_route', 'arrived'].includes(sr.status)
  const badge = STATUS_BADGE[sr.status]
  const seqLabel = seq != null ? `Request #${seq}` : `Request #${sr.id}`

  return (
    <div className="space-y-5 pb-12">
      {/* Back link */}
      <Link
        to="/customer/requests"
        className="inline-flex items-center gap-1.5 text-sm text-charcoal/50 hover:text-charcoal transition"
      >
        ← Back to requests
      </Link>

      {/* ── Hero ── */}
      <div className="bg-primary rounded-2xl overflow-hidden relative">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 120% at 110% 50%, rgba(93,212,160,0.08) 0%, transparent 60%)' }}
        />
        <div className="relative flex items-stretch">
          {/* Icon */}
          <div className="px-7 py-8 flex items-start flex-shrink-0">
            <div className="w-13 h-13 w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center text-2xl border border-white/10">
              {WASTE_ICON[sr.waste_type] || '🛢️'}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 py-8 min-w-0">
            <p className="text-[10px] uppercase tracking-[2.5px] text-accent font-medium mb-2">
              {seqLabel}
            </p>
            <h2 className="font-heading text-3xl text-white font-bold capitalize leading-tight">
              {sr.waste_type.replace('_', ' ')} · {sr.volume_tier} Tank
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${badge.cls}`}>
                {badge.dot && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                )}
                {badge.label}
              </span>
              <span className="text-sm text-white/50">
                Booked {new Date(sr.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </div>
          </div>

          {/* Price */}
          <div className="px-8 py-8 flex flex-col items-end justify-center border-l border-white/10 flex-shrink-0">
            <p className="text-[10px] uppercase tracking-[2px] text-white/40 mb-1.5">Quote</p>
            <p className="font-heading text-4xl text-white leading-none">
              <span className="text-lg font-light opacity-60 mr-1">GHS</span>
              {sr.quote_total}
            </p>
          </div>
        </div>
      </div>

      {/* Pay CTA */}
      {(sr.payment_status == null || sr.payment_status === 'pending') && !isTerminal && (
        <Link
          to={`/customer/requests/${sr.id}/pay`}
          className="block bg-gradient-to-r from-accent to-amber-300 text-charcoal rounded-2xl p-5 shadow-sm hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/40 grid place-items-center text-xl">💳</div>
              <div>
                <div className="font-bold">Complete payment to dispatch a driver</div>
                <div className="text-sm text-charcoal/70">
                  Your request is on hold until payment is confirmed.
                </div>
              </div>
            </div>
            <span className="font-bold text-sm group-hover:translate-x-1 transition whitespace-nowrap">
              Pay GHS {sr.quote_total} →
            </span>
          </div>
        </Link>
      )}

      {/* Driver + map */}
      {sr.driver && (
        <div className={`grid gap-4 ${showMap ? 'lg:grid-cols-[1fr_1.4fr]' : ''}`}>
          <DriverCard
            driverUserId={sr.driver.user.id}
            name={sr.driver.user.full_name || sr.driver.user.phone}
            phone={sr.driver.user.phone}
            vehicleReg={sr.driver.vehicle_reg}
            vehicleType={sr.driver.vehicle_type}
          />
          {showMap && (
            <div className="bg-white border border-charcoal/8 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-charcoal/6 flex items-center justify-between">
                <h2 className="font-semibold text-sm text-charcoal">Where's my driver?</h2>
                {!driverLoc && (
                  <span className="text-xs text-charcoal/50 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Awaiting first ping
                  </span>
                )}
              </div>
              <LiveMap
                pickup={{ lat: Number(sr.pickup_lat), lng: Number(sr.pickup_lng) }}
                driver={driverLoc}
                height={280}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">

        {/* Left: status + pickup */}
        <div className="space-y-5">

          {/* Status timeline */}
          <div className="bg-white border border-charcoal/8 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 pt-5 pb-0 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-charcoal/5 flex items-center justify-center text-sm">📍</div>
              <span className="text-sm font-semibold text-charcoal">Request status</span>
            </div>

            {sr.status === 'cancelled' || sr.status === 'unfulfilled' || (sr.status === 'pending' && Date.now() < justPaidUntil) ? (
              <div className="px-6 pb-6 pt-4">
                {(sr.status === 'unfulfilled' || sr.status === 'pending') && Date.now() < justPaidUntil ? (
                  <div className="p-4 rounded-xl border bg-amber-50 border-amber-200 text-amber-800 flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin flex-shrink-0" />
                    <div>
                      <div className="font-bold text-sm">Searching for a driver…</div>
                      <div className="text-sm mt-0.5 opacity-80">We're looking for the nearest available driver. This may take a moment.</div>
                    </div>
                  </div>
                ) : (
                  <div className={`p-4 rounded-xl border ${
                    sr.status === 'cancelled'
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}>
                    <div className="font-bold text-sm">
                      {sr.status === 'cancelled' ? 'Request cancelled' : 'Could not match a driver'}
                    </div>
                    <div className="text-sm mt-1 opacity-80">
                      {sr.status === 'cancelled'
                        ? sr.cancel_reason || 'No reason provided.'
                        : 'No drivers were available in your area.'}
                    </div>
                    {sr.status === 'unfulfilled' && (
                      <div className="mt-3">
                        <button
                          onClick={() => retryMut.mutate()}
                          disabled={retryMut.isPending}
                          className="inline-flex items-center gap-2 bg-primary text-white font-bold px-4 py-2 rounded-lg hover:bg-primary/90 transition disabled:opacity-60 text-sm"
                        >
                          {retryMut.isPending ? 'Searching…' : '🔄 Find me a driver'}
                        </button>
                        {retryError && <p className="mt-2 text-xs text-red-700">{retryError}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="px-6 py-5 space-y-0">
                {STATUS_STEPS.map((step, idx) => {
                  const done = currentStepIdx > idx
                  const active = currentStepIdx === idx
                  const isLast = idx === STATUS_STEPS.length - 1
                  return (
                    <div key={step.value} className="flex gap-4 relative">
                      {/* Connector line */}
                      {!isLast && (
                        <div className={`absolute left-[13px] top-7 w-px ${
                          done ? 'bg-primary' : 'bg-charcoal/10'
                        }`} style={{ bottom: '-4px' }} />
                      )}
                      {/* Dot */}
                      <div className="flex-shrink-0 relative z-10">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition ${
                          done
                            ? 'bg-primary border-primary text-white'
                            : active
                              ? 'bg-amber-50 border-amber-400 text-amber-700'
                              : 'bg-white border-charcoal/15 text-charcoal/35'
                        }`}>
                          {done ? '✓' : idx + 1}
                        </div>
                      </div>
                      {/* Text */}
                      <div className={`pb-5 flex-1 ${isLast ? 'pb-1' : ''}`}>
                        <p className={`text-sm font-medium leading-none mb-1 ${
                          done ? 'text-charcoal' : active ? 'text-charcoal font-semibold' : 'text-charcoal/40'
                        }`}>
                          {step.label}
                        </p>
                        <p className="text-xs text-charcoal/50">
                          {active && step.value === 'pending'
                            ? 'Searching for the nearest driver…'
                            : step.desc}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pickup details */}
          <div className="bg-white border border-charcoal/8 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 pt-5 pb-4 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-charcoal/5 flex items-center justify-center text-sm">📦</div>
              <span className="text-sm font-semibold text-charcoal">Pickup details</span>
            </div>
            <div className="grid grid-cols-2 border-t border-charcoal/6">
              <div className="px-6 py-5 border-r border-charcoal/6">
                <p className="text-[10px] uppercase tracking-[1.8px] text-charcoal/45 font-medium mb-2.5">Location</p>
                <div className="flex items-center gap-2 text-sm font-medium text-charcoal">
                  <span className="w-7 h-7 rounded-lg bg-charcoal/5 flex items-center justify-center text-sm flex-shrink-0">📍</span>
                  <span className="capitalize">{sr.pickup_address || `${sr.pickup_lat}, ${sr.pickup_lng}`}</span>
                </div>
              </div>
              <div className="px-6 py-5">
                <p className="text-[10px] uppercase tracking-[1.8px] text-charcoal/45 font-medium mb-2.5">Volume</p>
                <div className="flex items-center gap-2 text-sm font-medium text-charcoal">
                  <span className="w-7 h-7 rounded-lg bg-charcoal/5 flex items-center justify-center text-sm flex-shrink-0">🪣</span>
                  <span className="capitalize">{sr.volume_tier} Tank</span>
                </div>
              </div>
              <div className="col-span-2 px-6 py-5 border-t border-charcoal/6">
                <p className="text-[10px] uppercase tracking-[1.8px] text-charcoal/45 font-medium mb-2">Notes for driver</p>
                <p className="text-sm text-charcoal/50 italic">
                  {sr.notes || 'No notes provided'}
                </p>
              </div>
            </div>
          </div>

          {/* Dispute thread */}
          {(sr.status === 'cancelled' || sr.status === 'unfulfilled') && (
            <DisputeThreadCard requestId={sr.id} cancelReason={sr.cancel_reason} />
          )}

          {/* Rating */}
          {sr.status === 'completed' && sr.driver && (
            <div className="bg-white border border-charcoal/8 rounded-2xl shadow-sm p-6">
              <RatingForm requestId={sr.id} label="Rate your driver" />
            </div>
          )}

          {/* Receipt */}
          {sr.status === 'completed' && (
            <div className="bg-white border border-charcoal/8 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 pt-5 pb-4 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-charcoal/5 flex items-center justify-center text-sm">🧾</div>
                <span className="text-sm font-semibold text-charcoal">Receipt</span>
              </div>
              <div className="px-6 pb-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="text-sm text-charcoal/60">Your PDF receipt is ready.</p>
                  <button
                    onClick={handleDownloadReceipt}
                    disabled={receiptDownloading}
                    className="bg-primary text-white font-bold px-5 py-2.5 rounded-lg hover:bg-primary/90 transition inline-flex items-center gap-2 text-sm disabled:opacity-60"
                  >
                    {receiptDownloading ? 'Downloading…' : '⬇ Download receipt'}
                  </button>
                </div>
                {receiptError && (
                  <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {receiptError}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: quote + cancel */}
        <div className="space-y-5">

          {/* Quote breakdown */}
          <div className="bg-white border border-charcoal/8 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 pt-5 pb-4 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-charcoal/5 flex items-center justify-center text-sm">🧾</div>
              <span className="text-sm font-semibold text-charcoal">Quote breakdown</span>
            </div>
            <div className="px-6 pb-2 space-y-0 divide-y divide-charcoal/5">
              <div className="flex justify-between items-center py-3">
                <span className="text-sm text-charcoal">Base fee</span>
                <span className="text-sm font-medium text-charcoal">GHS {sr.quote_base_fee}</span>
              </div>
              <div className="flex justify-between items-center py-3">
                <div>
                  <span className="text-sm text-charcoal">Distance</span>
                  <p className="text-xs text-charcoal/45">{Number(sr.quote_billable_distance_km).toFixed(1)} km billed</p>
                </div>
                <span className="text-sm font-medium text-charcoal">GHS {sr.quote_distance_fee}</span>
              </div>
              {Number(sr.quote_volume_multiplier) !== 1 && (
                <div className="flex justify-between items-center py-3">
                  <span className="text-sm text-charcoal">
                    Volume <span className="capitalize">({sr.volume_tier})</span>
                  </span>
                  <span className="text-sm font-medium text-charcoal">×{sr.quote_volume_multiplier}</span>
                </div>
              )}
              {sr.num_trips > 1 && (
                <div className="flex justify-between items-center py-3">
                  <span className="text-sm text-charcoal">{sr.num_trips} trips</span>
                  <span className="text-sm font-medium text-charcoal">×{sr.quote_trips_multiplier}</span>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center px-6 py-4 bg-primary rounded-b-2xl">
              <span className="text-sm text-white/70 font-medium">Total</span>
              <span className="font-heading text-2xl text-white">GHS {sr.quote_total}</span>
            </div>
          </div>

          {/* Cancel */}
          {!isTerminal && (
            <div className="bg-red-50/60 border border-red-200 rounded-2xl p-5">
              {!showCancel ? (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-red-900">Need to cancel?</p>
                    <p className="text-xs text-red-700/70 mt-0.5">Fees may apply if a driver is already on the way.</p>
                  </div>
                  <button
                    onClick={() => setShowCancel(true)}
                    className="bg-white border border-red-300 text-red-700 font-semibold px-4 py-2 rounded-lg hover:bg-red-50 transition text-sm whitespace-nowrap"
                  >
                    Cancel request
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-red-900 flex items-center gap-1.5">
                    ⚠ Cancel request #{sr.id}?
                  </p>
                  <p className="text-xs text-red-700/70 mt-0.5 mb-3">This will notify the driver and free the slot.</p>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Tell us why (optional)…"
                    rows={3}
                    className="w-full bg-white border border-red-200 rounded-lg px-3 py-2.5 text-sm font-sans text-charcoal placeholder-red-300/70 resize-none outline-none focus:border-red-400 transition mb-3"
                  />
                  {cancelError && (
                    <p className="mb-3 text-xs text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
                      {cancelError}
                    </p>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setShowCancel(false)}
                      className="px-4 py-2 rounded-lg border border-charcoal/15 bg-white text-sm font-medium text-charcoal hover:bg-charcoal/5 transition"
                    >
                      Keep request
                    </button>
                    <button
                      disabled={cancelMut.isPending}
                      onClick={() => cancelMut.mutate(cancelReason)}
                      className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60 transition flex items-center gap-1.5"
                    >
                      {cancelMut.isPending ? 'Cancelling…' : '✕ Cancel'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

// ── Dispute thread card ───────────────────────────────────────────────────────

function DisputeThreadCard({ requestId, cancelReason }: { requestId: number; cancelReason?: string }) {
  const qc = useQueryClient()
  const [reply, setReply] = useState('')
  const [reason, setReason] = useState('')
  const [showReasonInput, setShowReasonInput] = useState(false)

  const threadQuery = useQuery({
    queryKey: ['dispute-thread', requestId],
    queryFn: () => fetchDisputeThread(requestId),
    refetchInterval: 15_000,
  })

  const replyMut = useMutation({
    mutationFn: () => replyToDispute(requestId, reply),
    onSuccess: () => {
      setReply('')
      qc.invalidateQueries({ queryKey: ['dispute-thread', requestId] })
    },
  })

  const reasonMut = useMutation({
    mutationFn: () => submitCancelReason(requestId, reason),
    onSuccess: () => {
      setReason('')
      setShowReasonInput(false)
      qc.invalidateQueries({ queryKey: ['request', requestId] })
      qc.invalidateQueries({ queryKey: ['dispute-thread', requestId] })
    },
  })

  const messages = threadQuery.data ?? []
  const hasThread = messages.length > 0
  const adminAskedForReason = messages.some(
    (m) => m.sender_type === 'admin' && m.content.toLowerCase().includes('why you cancelled'),
  )
  const needsReason = !cancelReason && adminAskedForReason

  if (!hasThread && !needsReason) return null

  return (
    <div className="bg-white border border-charcoal/8 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 pt-5 pb-4 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center text-sm">↩️</div>
        <span className="text-sm font-semibold text-charcoal">Refund update</span>
        {hasThread && (
          <span className="ml-auto text-xs text-charcoal/40">{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Thread messages */}
      <div className="px-6 space-y-3 max-h-64 overflow-y-auto">
        {messages.map((m) => (
          <CustomerMessageBubble key={m.id} msg={m} />
        ))}
      </div>

      {/* Cancel reason prompt */}
      {needsReason && (
        <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <p className="text-sm text-amber-800 font-medium">
            Support is asking why you cancelled. Please tell us so we can process your refund faster.
          </p>
          {!showReasonInput ? (
            <button
              onClick={() => setShowReasonInput(true)}
              className="text-sm font-semibold text-amber-700 border border-amber-300 bg-white px-4 py-2 rounded-lg hover:bg-amber-50 transition"
            >
              Provide reason
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Tell us why you cancelled…"
                rows={3}
                className="w-full border border-amber-200 rounded-lg px-3 py-2.5 text-sm resize-none outline-none focus:border-amber-400 transition"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowReasonInput(false)}
                  className="px-3 py-2 rounded-lg border border-charcoal/15 text-sm text-charcoal hover:bg-charcoal/5 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => reasonMut.mutate()}
                  disabled={reasonMut.isPending || !reason.trim()}
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-60 transition"
                >
                  {reasonMut.isPending ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reply input */}
      {hasThread && (
        <div className="px-6 pb-6 mt-4 space-y-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply to support…"
            rows={2}
            className="w-full border border-charcoal/15 rounded-xl px-3 py-2.5 text-sm resize-none outline-none focus:border-primary/50 transition"
          />
          <button
            onClick={() => replyMut.mutate()}
            disabled={replyMut.isPending || !reply.trim()}
            className="bg-primary text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {replyMut.isPending ? 'Sending…' : 'Send reply'}
          </button>
        </div>
      )}
    </div>
  )
}

function CustomerMessageBubble({ msg }: { msg: DisputeThreadMessage }) {
  const isAdmin = msg.sender_type === 'admin'
  return (
    <div className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm space-y-1.5 ${
        isAdmin
          ? 'bg-charcoal/8 text-charcoal rounded-bl-sm'
          : 'bg-primary text-white rounded-br-sm'
      }`}>
        <p className={`text-[10px] font-semibold opacity-60 ${isAdmin ? '' : 'text-right'}`}>
          {isAdmin ? 'Support' : 'You'}
        </p>
        <p className="leading-relaxed">{msg.content}</p>
        {msg.attachment_url && (
          <a
            href={msg.attachment_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-[11px] underline block ${isAdmin ? 'text-primary' : 'text-white/80'}`}
          >
            View receipt
          </a>
        )}
        <p className={`text-[10px] opacity-50 ${isAdmin ? '' : 'text-right'}`}>
          {new Date(msg.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      </div>
    </div>
  )
}

// ── Driver card ───────────────────────────────────────────────────────────────

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
    <div className="bg-white border border-charcoal/8 rounded-2xl shadow-sm p-6">
      <p className="text-[10px] uppercase tracking-widest text-charcoal/45 font-semibold mb-4">Your driver</p>
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-primary text-white grid place-items-center font-bold text-lg flex-shrink-0">
          {init}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-heading font-extrabold text-lg text-charcoal truncate">{name}</div>
          {summary.data?.avg != null && (
            <div className="mt-1 flex items-center gap-2">
              <Stars score={Math.round(summary.data.avg)} />
              <span className="text-charcoal/60 text-xs">
                {summary.data.avg.toFixed(1)} ({summary.data.count})
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-charcoal/70">
          <span>🚛</span>
          <span className="font-medium capitalize">{vehicleType.replace('_', ' ')} · {vehicleReg}</span>
        </div>
        <a href={`tel:${phone}`} className="flex items-center gap-2 text-primary font-semibold hover:underline">
          <span>📞</span>
          <span>{phone}</span>
        </a>
      </div>
    </div>
  )
}
