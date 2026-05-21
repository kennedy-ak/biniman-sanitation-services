import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchDriverHistory, fetchRequest } from '@/api/requests'

const STATUS_STEPS = [
  { value: 'pending',   label: 'Submitted',     desc: 'Request received' },
  { value: 'assigned',  label: 'Finding driver', desc: 'Searching nearby' },
  { value: 'accepted',  label: 'Accepted',       desc: 'You accepted the job' },
  { value: 'en_route',  label: 'En route',       desc: 'You were on the way' },
  { value: 'arrived',   label: 'Arrived',        desc: 'You arrived on site' },
  { value: 'completed', label: 'Completed',      desc: 'Job done' },
]

const WASTE_LABEL: Record<string, string> = {
  septic: 'Septic', soak_pit: 'Soak Pit', industrial: 'Industrial',
}

export function DriverJobDetail() {
  const { id } = useParams<{ id: string }>()
  const requestId = Number(id)
  const location = useLocation()
  const stateSeq: number | undefined = (location.state as { seq?: number } | null)?.seq

  const historyQuery = useQuery({
    queryKey: ['driver', 'history'],
    queryFn: fetchDriverHistory,
    enabled: stateSeq == null,
    staleTime: 60_000,
  })
  const seq = stateSeq ?? (() => {
    if (!historyQuery.data) return null
    const jobs = historyQuery.data
    const sorted = [...jobs].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
    const idx = sorted.findIndex((j) => j.id === requestId)
    return idx >= 0 ? idx + 1 : null
  })()

  const query = useQuery({
    queryKey: ['request', requestId],
    queryFn: () => fetchRequest(requestId),
    enabled: Number.isFinite(requestId),
  })

  if (query.isLoading) return <p className="text-charcoal/60">Loading…</p>
  if (!query.data) return <p className="text-charcoal/60">Job not found.</p>

  const job = query.data
  const earnings = (Number(job.quote_total) - Number(job.commission_amount)).toFixed(2)
  const isCompleted = job.status === 'completed'
  const isCancelled = job.status === 'cancelled' || job.status === 'unfulfilled'
  const currentStepIdx = isCompleted
    ? STATUS_STEPS.length
    : STATUS_STEPS.findIndex((s) => s.value === job.status)

  const wasteLabel = WASTE_LABEL[job.waste_type] ?? job.waste_type.replace('_', ' ')
  const dateStr = new Date(job.created_at).toLocaleString(undefined, {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="max-w-2xl space-y-5 pb-12">

      {/* ── Back link ── */}
      <Link
        to="/driver/history"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal/50 hover:text-charcoal transition"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to history
      </Link>

      {/* ── Hero ── */}
      <div className="bg-primary rounded-2xl overflow-hidden relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 65% 160% at 115% 50%, rgba(93,212,160,0.13) 0%, transparent 55%)' }}
        />
        <div className="relative px-7 py-6">
          {/* Top row: ride label + status badge */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <span className="text-[10px] uppercase tracking-[2.5px] text-[#7aad8e] font-semibold">
              {seq != null ? `Ride ${seq}` : `Job #${job.id}`}
            </span>
            <span
              className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
                isCompleted
                  ? 'bg-green-500/20 text-green-300 border border-green-500/25'
                  : isCancelled
                    ? 'bg-red-500/20 text-red-300 border border-red-500/25'
                    : 'bg-white/15 text-white/70 border border-white/20'
              }`}
            >
              {job.status}
            </span>
          </div>

          {/* Title */}
          <h1 className="font-heading text-[28px] text-white tracking-[-0.3px] leading-tight capitalize mb-1">
            {wasteLabel} · {job.volume_tier} Tank
          </h1>
          <p className="text-sm text-white/50 mb-5">{dateStr}</p>

          {/* Earnings + quick stats */}
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1 bg-white/10 border border-white/15 rounded-xl px-5 py-4">
              <p className="text-[9px] uppercase tracking-[2px] text-white/50 font-semibold mb-1">Your earnings</p>
              <p className="font-sans font-bold text-[26px] text-white leading-none">
                <span className="text-[11px] font-normal text-white/45 mr-0.5">GHS</span>
                {earnings}
              </p>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-xl px-5 py-4">
              <p className="text-[9px] uppercase tracking-[2px] text-white/50 font-semibold mb-1">Total fare</p>
              <p className="font-sans font-bold text-[20px] text-white leading-none">
                <span className="text-[11px] font-normal text-white/45 mr-0.5">GHS</span>
                {Number(job.quote_total).toFixed(2)}
              </p>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-xl px-5 py-4">
              <p className="text-[9px] uppercase tracking-[2px] text-white/50 font-semibold mb-1">Commission</p>
              <p className="font-sans font-bold text-[20px] text-white leading-none">
                <span className="text-[11px] font-normal text-white/45 mr-0.5">GHS</span>
                {Number(job.commission_amount).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Job timeline ── */}
      <div className="bg-white border border-charcoal/8 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-charcoal/6">
          <h2 className="text-sm font-semibold text-charcoal">Job timeline</h2>
          <p className="text-xs text-charcoal/45 mt-0.5">Status progression for this job</p>
        </div>
        <div className="px-5 py-5">
          <ol className="relative">
            {/* Background track */}
            <div className="absolute left-[15px] top-3 bottom-3 w-0.5 bg-charcoal/8" />
            {/* Filled progress */}
            <div
              className="absolute left-[15px] top-3 w-0.5 bg-primary transition-all duration-500"
              style={{
                height: currentStepIdx <= 0
                  ? '0px'
                  : `calc(${Math.min(currentStepIdx, STATUS_STEPS.length - 1)} * 64px)`,
              }}
            />
            {STATUS_STEPS.map((step, idx) => {
              const done   = currentStepIdx > idx
              const active = currentStepIdx === idx
              return (
                <li key={step.value} className="relative flex items-start gap-4 pb-8 last:pb-0">
                  <span
                    className={`relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold transition-all ${
                      done
                        ? 'bg-primary text-white shadow-sm'
                        : active
                          ? 'bg-accent text-charcoal ring-4 ring-accent/25'
                          : 'bg-charcoal/8 text-charcoal/30 border border-charcoal/10'
                    }`}
                  >
                    {done ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <div className="pt-0.5 flex-1">
                    <p className={`text-[14px] font-semibold leading-none mb-1 ${
                      done ? 'text-charcoal' : active ? 'text-primary' : 'text-charcoal/30'
                    }`}>
                      {step.label}
                    </p>
                    <p className={`text-[12px] ${done || active ? 'text-charcoal/50' : 'text-charcoal/25'}`}>
                      {step.desc}
                    </p>
                  </div>
                  {active && (
                    <span className="mt-0.5 text-[9px] uppercase tracking-[1.5px] font-bold text-accent bg-accent/15 border border-accent/25 rounded-full px-2 py-0.5 flex-shrink-0">
                      Current
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      {/* ── Pickup details ── */}
      <div className="bg-white border border-charcoal/8 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-charcoal/6">
          <h2 className="text-sm font-semibold text-charcoal">Pickup details</h2>
        </div>
        <div className="px-5 py-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <DetailRow
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
              }
              label="Location"
              value={job.pickup_address || `${job.pickup_lat}, ${job.pickup_lng}`}
            />
            <DetailRow
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
              }
              label="Waste type"
              value={wasteLabel}
            />
            <DetailRow
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              }
              label="Volume"
              value={`${job.volume_tier} tank`}
              capitalize
            />
            {job.notes && (
              <div className="sm:col-span-2">
                <DetailRow
                  icon={
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                    </svg>
                  }
                  label="Notes"
                  value={job.notes}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Fare breakdown ── */}
      <div className="bg-white border border-charcoal/8 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-charcoal/6">
          <h2 className="text-sm font-semibold text-charcoal">Fare breakdown</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <FareRow label="Total fare" value={`GHS ${Number(job.quote_total).toFixed(2)}`} />
          <FareRow label="Platform commission" value={`− GHS ${Number(job.commission_amount).toFixed(2)}`} muted />
          <div className="pt-3 border-t border-charcoal/8 flex items-center justify-between">
            <span className="text-sm font-semibold text-charcoal">Your earnings</span>
            <span className="font-sans font-bold text-[22px] text-primary leading-none">
              <span className="text-[11px] font-normal text-charcoal/40 mr-0.5">GHS</span>
              {earnings}
            </span>
          </div>
        </div>
      </div>

      {/* ── Customer ── */}
      {job.customer && (
        <div className="bg-white border border-charcoal/8 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-charcoal/6">
            <h2 className="text-sm font-semibold text-charcoal">Customer</h2>
          </div>
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base flex-shrink-0">
              {(job.customer.full_name || job.customer.phone)[0].toUpperCase()}
            </div>
            <div>
              <p className="text-[14px] font-semibold text-charcoal">{job.customer.full_name || 'Customer'}</p>
              <p className="text-[12px] text-charcoal/50 mt-0.5 font-mono">{job.customer.phone}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DetailRow({
  icon, label, value, capitalize = false,
}: {
  icon: React.ReactNode; label: string; value: string; capitalize?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-charcoal/5 flex items-center justify-center text-charcoal/40 flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <p className="text-[9.5px] uppercase tracking-[1.5px] text-charcoal/40 font-semibold mb-0.5">{label}</p>
        <p className={`text-[13.5px] text-charcoal font-medium ${capitalize ? 'capitalize' : ''}`}>{value}</p>
      </div>
    </div>
  )
}

function FareRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${muted ? 'text-charcoal/50' : 'text-charcoal/70'}`}>{label}</span>
      <span className={`text-sm font-semibold ${muted ? 'text-charcoal/50' : 'text-charcoal'}`}>{value}</span>
    </div>
  )
}
