import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchMyRequests } from '@/api/requests'
import { useAuth } from '@/store/auth'
import type { RequestStatus, ServiceRequest } from '@/types'

const ACTIVE_STATUSES: RequestStatus[] = [
  'pending',
  'assigned',
  'accepted',
  'en_route',
  'arrived',
]

const STATUS_META: Record<RequestStatus, { label: string; tone: string }> = {
  pending: { label: 'Finding driver', tone: 'bg-amber-100 text-amber-800' },
  assigned: { label: 'Offering to driver', tone: 'bg-amber-100 text-amber-800' },
  accepted: { label: 'Driver assigned', tone: 'bg-blue-100 text-blue-800' },
  en_route: { label: 'En route', tone: 'bg-blue-100 text-blue-800' },
  arrived: { label: 'Driver arrived', tone: 'bg-purple-100 text-purple-800' },
  completed: { label: 'Completed', tone: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelled', tone: 'bg-red-100 text-red-800' },
  unfulfilled: { label: 'Unfulfilled', tone: 'bg-red-100 text-red-800' },
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function CustomerDashboard() {
  const user = useAuth((s) => s.user)
  const list = useQuery({ queryKey: ['requests', 'mine'], queryFn: fetchMyRequests })
  const requests = list.data ?? []
  const active = requests.find((r) => ACTIVE_STATUSES.includes(r.status))
  const completed = requests.filter((r) => r.status === 'completed')
  const totalSpent = completed.reduce((s, r) => s + Number(r.quote_total), 0)
  const recent = [...requests]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 5)

  const firstName = user?.full_name?.split(' ')[0]
  const greeting = getGreeting()

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <div className="text-sm text-charcoal/60">{greeting},</div>
          <h1 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">
            {firstName || 'there'} 👋
          </h1>
          <p className="mt-1 text-charcoal/60">Here's what's happening with your pickups.</p>
        </div>
        <Link
          to="/customer/new"
          className="bg-primary text-white font-bold px-5 py-3 rounded-lg hover:bg-primary/90 transition shadow-sm"
        >
          + New request
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total jobs"
          value={requests.length.toString()}
          icon="📋"
          accent="bg-primary/10 text-primary"
        />
        <StatCard
          label="Active"
          value={active ? '1' : '0'}
          icon="⚡"
          accent="bg-amber-100 text-amber-700"
        />
        <StatCard
          label="Completed"
          value={completed.length.toString()}
          icon="✓"
          accent="bg-green-100 text-green-700"
        />
        <StatCard
          label="Total spent"
          value={`GHS ${totalSpent.toFixed(0)}`}
          icon="💰"
          accent="bg-accent/15 text-amber-800"
        />
      </div>

      {/* Active job hero or empty CTA */}
      {active ? (
        <ActiveJobCard req={active} />
      ) : (
        <EmptyCTA />
      )}

      {/* Recent + Tips */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-charcoal/5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-charcoal/5">
            <h2 className="font-heading font-bold text-lg">Recent requests</h2>
            <Link to="/customer/requests" className="text-sm text-primary hover:underline">
              View all →
            </Link>
          </div>
          {list.isLoading ? (
            <div className="p-6 text-charcoal/60 text-sm">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-4xl">📭</div>
              <p className="mt-2 text-charcoal/60 text-sm">No requests yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-charcoal/5">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/customer/requests/${r.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-charcoal/[0.02] transition"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center text-lg">
                      {r.waste_type === 'septic'
                        ? '🚽'
                        : r.waste_type === 'soak_pit'
                          ? '🕳️'
                          : '🏭'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-charcoal truncate">
                        #{r.id} · {r.waste_type.replace('_', ' ')} · {r.volume_tier}
                      </div>
                      <div className="text-xs text-charcoal/60 truncate">
                        {r.pickup_address || `${r.pickup_lat}, ${r.pickup_lng}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${STATUS_META[r.status].tone}`}
                      >
                        {STATUS_META[r.status].label}
                      </span>
                      <div className="text-xs text-charcoal/50 mt-1">
                        {formatDate(r.created_at)} · GHS {r.quote_total}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <TipCard
            icon="📍"
            title="Pin your location"
            body="Drop a precise pin on the map for faster, accurate matches."
          />
          <TipCard
            icon="⭐"
            title="Rate your driver"
            body="After every job, share feedback to keep our network top-quality."
          />
          <TipCard
            icon="💳"
            title="Pay with MoMo"
            body="MTN, Vodafone, AirtelTigo all supported via Paystack."
          />
        </div>
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: string
  icon: string
  accent: string
}) {
  return (
    <div className="bg-white border border-charcoal/5 rounded-2xl p-5 shadow-sm hover:shadow-md transition">
      <div className={`w-10 h-10 rounded-xl grid place-items-center text-lg ${accent}`}>
        {icon}
      </div>
      <div className="mt-3 text-xs text-charcoal/60 uppercase tracking-wider font-semibold">
        {label}
      </div>
      <div className="mt-1 font-heading text-2xl font-extrabold text-charcoal">
        {value}
      </div>
    </div>
  )
}

function ActiveJobCard({ req }: { req: ServiceRequest }) {
  const meta = STATUS_META[req.status]
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-[#084d29] text-white shadow-lg">
      <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-accent font-bold">
              Active job
            </div>
            <h2 className="mt-2 font-heading text-2xl md:text-3xl font-extrabold">
              Request #{req.id}
            </h2>
            <p className="mt-1 text-white/80 text-sm">
              {req.waste_type.replace('_', ' ')} · {req.volume_tier} ·{' '}
              {req.pickup_address || 'Location pinned'}
            </p>
          </div>
          <span
            className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase ${meta.tone}`}
          >
            {meta.label}
          </span>
        </div>

        <div className="mt-6 grid sm:grid-cols-3 gap-4">
          <Mini label="Quote" value={`GHS ${req.quote_total}`} />
          <Mini
            label="Driver"
            value={req.driver?.user.full_name || req.driver?.user.phone || 'Searching…'}
          />
          <Mini
            label="Vehicle"
            value={req.driver?.vehicle_reg || '—'}
          />
        </div>

        <Link
          to={`/customer/requests/${req.id}`}
          className="mt-6 inline-flex items-center gap-2 bg-accent text-charcoal font-bold px-5 py-2.5 rounded-lg hover:brightness-110 transition"
        >
          Track this job →
        </Link>
      </div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-white/60 font-semibold">
        {label}
      </div>
      <div className="mt-0.5 font-bold truncate">{value}</div>
    </div>
  )
}

function EmptyCTA() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-white to-accent/10 border border-charcoal/5 p-6 md:p-8">
      <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center">
        <div>
          <div className="text-xs uppercase tracking-widest text-primary font-bold">
            Ready when you are
          </div>
          <h2 className="mt-2 font-heading text-2xl md:text-3xl font-extrabold text-charcoal">
            Need a pickup?
          </h2>
          <p className="mt-2 text-charcoal/70 max-w-md">
            Tell us your location, waste type, and tank size. We'll match the
            closest verified driver in minutes.
          </p>
        </div>
        <Link
          to="/customer/new"
          className="bg-primary text-white font-bold px-6 py-3.5 rounded-lg hover:bg-primary/90 transition shadow-sm whitespace-nowrap"
        >
          Start request →
        </Link>
      </div>
    </div>
  )
}

function TipCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="bg-white border border-charcoal/5 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent/15 grid place-items-center text-lg flex-shrink-0">
          {icon}
        </div>
        <div>
          <h3 className="font-bold text-charcoal text-sm">{title}</h3>
          <p className="mt-1 text-xs text-charcoal/65 leading-relaxed">{body}</p>
        </div>
      </div>
    </div>
  )
}
