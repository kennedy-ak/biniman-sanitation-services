import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchDriverHistory, fetchRequest } from '@/api/requests'

const STATUS_STEPS = [
  { value: 'pending',   label: 'Submitted',       desc: 'Request received' },
  { value: 'assigned',  label: 'Finding driver',   desc: 'Searching nearby' },
  { value: 'accepted',  label: 'Accepted',         desc: 'You accepted the job' },
  { value: 'en_route',  label: 'En route',         desc: 'You were on the way' },
  { value: 'arrived',   label: 'Arrived',          desc: 'You arrived on site' },
  { value: 'completed', label: 'Completed',        desc: 'Job done' },
]

export function DriverJobDetail() {
  const { id } = useParams<{ id: string }>()
  const requestId = Number(id)
  const location = useLocation()
  const stateSeq: number | undefined = (location.state as { seq?: number } | null)?.seq

  // Fallback: derive seq from cached history list if navigated directly
  const historyQuery = useQuery({
    queryKey: ['driver', 'history'],
    queryFn: fetchDriverHistory,
    enabled: stateSeq == null,
    staleTime: 60_000,
  })
  const seq = stateSeq ?? (() => {
    if (!historyQuery.data) return null
    const jobs = historyQuery.data
    const idx = jobs.findIndex((j) => j.id === requestId)
    return idx >= 0 ? jobs.length - idx : null
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
  const currentStepIdx = job.status === 'completed'
    ? STATUS_STEPS.length
    : STATUS_STEPS.findIndex((s) => s.value === job.status)

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        to="/driver/history"
        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
      >
        ← Back to history
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary to-[#084d29] text-white rounded-2xl p-6 shadow-lg">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative">
          <div className="text-xs uppercase tracking-widest text-accent font-bold">
            {seq != null ? `Ride ${seq}` : `Job #${job.id}`}
          </div>
          <h1 className="mt-1 font-heading text-3xl font-extrabold capitalize">
            {job.waste_type.replace('_', ' ')} · {job.volume_tier} tank
          </h1>
          <p className="mt-2 text-sm text-white/70">
            {new Date(job.created_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        </div>
        <div className="relative mt-4 inline-block bg-white/10 rounded-xl px-5 py-3 border border-white/15">
          <div className="text-[10px] uppercase tracking-wider text-white/60 font-semibold">
            Your earnings
          </div>
          <div className="font-heading text-2xl font-extrabold">GHS {earnings}</div>
        </div>
      </div>

      {/* Status timeline */}
      <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm p-6">
        <h2 className="font-heading font-bold text-lg">Job timeline</h2>
        <ol className="mt-5 relative">
          <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-charcoal/10" />
          <div
            className="absolute left-[15px] top-2 w-0.5 bg-primary transition-all"
            style={{ height: `calc(${Math.max(0, currentStepIdx) * 64}px + 12px)` }}
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
                  <div className={`font-bold ${active ? 'text-primary' : done ? 'text-charcoal' : 'text-charcoal/40'}`}>
                    {step.label}
                  </div>
                  <div className="text-xs text-charcoal/60">{step.desc}</div>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      {/* Pickup details */}
      <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm p-6">
        <h2 className="font-heading font-bold text-lg">Pickup details</h2>
        <div className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-charcoal/50 font-semibold">Location</div>
            <div className="mt-1 text-charcoal">
              📍 {job.pickup_address || `${job.pickup_lat}, ${job.pickup_lng}`}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-charcoal/50 font-semibold">Volume</div>
            <div className="mt-1 text-charcoal capitalize">📦 {job.volume_tier} tank</div>
          </div>
          {job.notes && (
            <div className="sm:col-span-2">
              <div className="text-[10px] uppercase tracking-wider text-charcoal/50 font-semibold">Notes</div>
              <div className="mt-1 text-charcoal">📝 {job.notes}</div>
            </div>
          )}
        </div>
      </section>

      {/* Quote breakdown */}
      <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm p-6">
        <h2 className="font-heading font-bold text-lg">Fare breakdown</h2>
        <div className="mt-4 space-y-2 text-sm">
          <Row label="Total fare" value={`GHS ${job.quote_total}`} />
          <Row label="Platform commission" value={`GHS ${job.commission_amount}`} />
          <div className="pt-3 mt-2 border-t border-charcoal/10 flex justify-between items-center">
            <span className="font-bold">Your earnings</span>
            <span className="font-heading text-2xl font-extrabold text-primary">GHS {earnings}</span>
          </div>
        </div>
      </section>

      {/* Customer */}
      {job.customer && (
        <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm p-6">
          <h2 className="font-heading font-bold text-lg">Customer</h2>
          <div className="mt-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary grid place-items-center font-bold text-sm">
              {(job.customer.full_name || job.customer.phone)[0].toUpperCase()}
            </div>
            <div>
              <div className="font-semibold">{job.customer.full_name || 'Customer'}</div>
              <div className="text-sm text-charcoal/60">{job.customer.phone}</div>
            </div>
          </div>
        </section>
      )}
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
