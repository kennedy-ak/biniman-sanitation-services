import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, Send, Search, ThumbsUp, Truck, MapPin, Check,
  Phone, MessageCircle, Droplet, Package, FileText,
} from 'lucide-react'
import { fetchDriverHistory, fetchRequest } from '@/api/requests'
import { RatingForm } from '@/components/RatingForm'

const STATUS_STEPS = [
  { value: 'pending',   label: 'Submitted',      desc: 'Request received',     Icon: Send },
  { value: 'assigned',  label: 'Finding driver',  desc: 'Searching nearby',     Icon: Search },
  { value: 'accepted',  label: 'Accepted',        desc: 'You accepted the job', Icon: ThumbsUp },
  { value: 'en_route',  label: 'En route',        desc: 'You were on the way',  Icon: Truck },
  { value: 'arrived',   label: 'Arrived',         desc: 'You arrived on site',  Icon: MapPin },
  { value: 'completed', label: 'Completed',       desc: 'Job done',             Icon: Check },
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
    const sorted = [...historyQuery.data].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
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
    <div className="space-y-5 pb-12">

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-1.5 text-xs text-charcoal/50">
        <ArrowLeft size={14} />
        <Link to="/driver/history" className="text-primary hover:underline">History</Link>
        <span>›</span>
        <span>{seq != null ? `Ride ${seq}` : `Job #${job.id}`}</span>
      </div>

      {/* ── Hero card ── */}
      <div className="bg-primary rounded-2xl overflow-hidden relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 65% 160% at 115% 50%, rgba(93,212,160,0.13) 0%, transparent 55%)' }}
        />
        <div className="relative px-7 py-6">
          {/* Top row */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <span className="text-[10px] uppercase tracking-[2.5px] text-white/50 font-semibold">
              {seq != null ? `Ride #${seq}` : `Job #${job.id}`}
            </span>
            <span className={`text-[10px] uppercase font-bold px-3 py-1 rounded-full flex items-center gap-1.5 flex-shrink-0 ${
              isCompleted
                ? 'bg-white/15 text-white border border-white/20'
                : isCancelled
                  ? 'bg-red-500/20 text-red-300 border border-red-500/25'
                  : 'bg-white/15 text-white/70 border border-white/20'
            }`}>
              {isCompleted && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#6ee7a7] flex-shrink-0" />
              )}
              {job.status}
            </span>
          </div>

          {/* Title + date */}
          <h1 className="font-heading text-[28px] text-white tracking-[-0.3px] leading-tight capitalize mb-1">
            {wasteLabel} · {job.volume_tier} Tank
          </h1>
          <p className="text-sm text-white/50 mb-5">{dateStr}</p>

          {/* Stats — stack on mobile so large GHS amounts stay on one line */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-white/10 border border-white/15 rounded-xl px-5 py-4">
              <p className="text-[9px] uppercase tracking-[2px] text-white/50 font-semibold mb-1.5">Your earnings</p>
              <p className="font-sans font-bold text-[22px] text-[#6ee7a7] leading-none">
                <span className="text-[11px] font-normal text-white/45 mr-0.5">GHS</span>
                {earnings}
              </p>
              <p className="text-[10px] text-white/35 mt-1.5">After commission</p>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-xl px-5 py-4">
              <p className="text-[9px] uppercase tracking-[2px] text-white/50 font-semibold mb-1.5">Total fare</p>
              <p className="font-sans font-bold text-[22px] text-white leading-none">
                <span className="text-[11px] font-normal text-white/45 mr-0.5">GHS</span>
                {Number(job.quote_total).toFixed(2)}
              </p>
              <p className="text-[10px] text-white/35 mt-1.5">Billed to customer</p>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-xl px-5 py-4">
              <p className="text-[9px] uppercase tracking-[2px] text-white/50 font-semibold mb-1.5">Commission</p>
              <p className="font-sans font-bold text-[22px] text-white leading-none">
                <span className="text-[11px] font-normal text-white/45 mr-0.5">GHS</span>
                {Number(job.commission_amount).toFixed(2)}
              </p>
              <p className="text-[10px] text-white/35 mt-1.5">15% platform fee</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* Timeline */}
        <div className="bg-white border border-charcoal/8 rounded-2xl shadow-sm p-5">
          <p className="text-[10px] uppercase tracking-[1.5px] text-charcoal/45 font-semibold mb-5">Job timeline</p>
          <div className="flex flex-col">
            {STATUS_STEPS.map((step, idx) => {
              const done   = currentStepIdx > idx
              const active = currentStepIdx === idx
              const Icon   = step.Icon
              return (
                <div key={step.value} className="flex gap-3">
                  {/* Left track */}
                  <div className="flex flex-col items-center w-7 flex-shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center z-10 ${
                      done || active ? 'bg-primary' : 'bg-charcoal/8 border border-charcoal/12'
                    }`}>
                      <Icon size={13} className={done || active ? 'text-white' : 'text-charcoal/30'} />
                    </div>
                    {idx < STATUS_STEPS.length - 1 && (
                      <div className={`w-0.5 flex-1 min-h-[24px] my-0.5 ${done ? 'bg-primary/30' : 'bg-charcoal/8'}`} />
                    )}
                  </div>
                  {/* Body */}
                  <div className="pb-5 pt-0.5 flex-1">
                    <p className={`text-[13px] font-semibold leading-none mb-0.5 ${
                      done ? 'text-charcoal' : active ? 'text-primary' : 'text-charcoal/30'
                    }`}>
                      {step.label}
                    </p>
                    <p className={`text-[11px] ${done || active ? 'text-charcoal/50' : 'text-charcoal/25'}`}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">

          {/* Pickup details */}
          <div className="bg-white border border-charcoal/8 rounded-2xl shadow-sm p-5">
            <p className="text-[10px] uppercase tracking-[1.5px] text-charcoal/45 font-semibold mb-4">Pickup details</p>
            <div className="grid grid-cols-2 gap-3">
              <DetailItem Icon={MapPin} label="Location" value={job.pickup_address || `${job.pickup_lat}, ${job.pickup_lng}`} />
              <DetailItem Icon={Droplet} label="Waste type" value={wasteLabel} />
              <DetailItem Icon={Package} label="Volume" value={`${job.volume_tier} Tank`} capitalize />
              {job.notes && <DetailItem Icon={FileText} label="Notes" value={job.notes} />}
            </div>
          </div>

          {/* Fare breakdown */}
          <div className="bg-white border border-charcoal/8 rounded-2xl shadow-sm p-5">
            <p className="text-[10px] uppercase tracking-[1.5px] text-charcoal/45 font-semibold mb-4">Fare breakdown</p>
            <div className="divide-y divide-charcoal/6">
              <div className="flex justify-between py-2.5 text-sm">
                <span className="text-charcoal/55">Total fare</span>
                <span className="font-semibold text-charcoal font-mono">GHS {Number(job.quote_total).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2.5 text-sm">
                <span className="text-charcoal/55">Platform commission</span>
                <span className="font-semibold text-red-500 font-mono">− GHS {Number(job.commission_amount).toFixed(2)}</span>
              </div>
            </div>
            <div className="flex justify-between items-center pt-4 mt-2 border-t-2 border-primary/10">
              <span className="text-sm font-semibold text-charcoal">Your earnings</span>
              <span className="font-sans font-bold text-[22px] text-primary leading-none">
                <span className="text-[11px] font-normal text-charcoal/40 mr-0.5">GHS</span>
                {earnings}
              </span>
            </div>
          </div>

          {/* Customer */}
          {job.customer && (
            <div className="bg-white border border-charcoal/8 rounded-2xl shadow-sm p-5">
              <p className="text-[10px] uppercase tracking-[1.5px] text-charcoal/45 font-semibold mb-4">Customer</p>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base flex-shrink-0">
                  {(job.customer.full_name || job.customer.phone)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-charcoal truncate">{job.customer.full_name || 'Customer'}</p>
                  <p className="text-[12px] text-charcoal/50 mt-0.5 flex items-center gap-1">
                    <Phone size={11} />
                    {job.customer.phone}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    aria-label="Call customer"
                    className="w-9 h-9 rounded-xl border border-charcoal/12 bg-white flex items-center justify-center text-charcoal/45 hover:bg-primary/8 hover:text-primary hover:border-primary/20 transition"
                  >
                    <Phone size={16} />
                  </button>
                  <button
                    aria-label="Message customer"
                    className="w-9 h-9 rounded-xl border border-charcoal/12 bg-white flex items-center justify-center text-charcoal/45 hover:bg-primary/8 hover:text-primary hover:border-primary/20 transition"
                  >
                    <MessageCircle size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Rate the customer (bidirectional ratings — shown once the job is done) */}
      {isCompleted && job.customer && (
        <RatingForm requestId={job.id} label="Rate your customer" />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DetailItem({
  Icon, label, value, capitalize = false,
}: {
  Icon: React.ElementType; label: string; value: string; capitalize?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[1.2px] text-charcoal/40 font-semibold">{label}</span>
      <span className={`text-[13px] font-medium text-charcoal flex items-center gap-1.5 ${capitalize ? 'capitalize' : ''}`}>
        <Icon size={13} className="text-primary/70 flex-shrink-0" />
        {value}
      </span>
    </div>
  )
}
