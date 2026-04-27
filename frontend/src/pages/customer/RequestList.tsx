import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchMyRequests } from '@/api/requests'
import type { RequestStatus, ServiceRequest } from '@/types'

type Filter = 'all' | 'active' | 'completed' | 'cancelled'

const STATUS_META: Record<RequestStatus, { label: string; tone: string }> = {
  pending: { label: 'Finding driver', tone: 'bg-amber-100 text-amber-800' },
  assigned: { label: 'Offering driver', tone: 'bg-amber-100 text-amber-800' },
  accepted: { label: 'Driver assigned', tone: 'bg-blue-100 text-blue-800' },
  en_route: { label: 'En route', tone: 'bg-blue-100 text-blue-800' },
  arrived: { label: 'Arrived', tone: 'bg-purple-100 text-purple-800' },
  completed: { label: 'Completed', tone: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelled', tone: 'bg-red-100 text-red-800' },
  unfulfilled: { label: 'Unfulfilled', tone: 'bg-red-100 text-red-800' },
}

const ACTIVE: RequestStatus[] = ['pending', 'assigned', 'accepted', 'en_route', 'arrived']

const WASTE_ICON: Record<string, string> = {
  septic: '🚽',
  soak_pit: '🕳️',
  industrial: '🏭',
}

export function CustomerRequestList() {
  const [filter, setFilter] = useState<Filter>('all')
  const list = useQuery({ queryKey: ['requests', 'mine'], queryFn: fetchMyRequests })
  const data = list.data ?? []

  const counts = useMemo(() => {
    return {
      all: data.length,
      active: data.filter((r) => ACTIVE.includes(r.status)).length,
      completed: data.filter((r) => r.status === 'completed').length,
      cancelled: data.filter((r) => r.status === 'cancelled' || r.status === 'unfulfilled')
        .length,
    }
  }, [data])

  const visible = data
    .filter((r) => {
      if (filter === 'all') return true
      if (filter === 'active') return ACTIVE.includes(r.status)
      if (filter === 'completed') return r.status === 'completed'
      return r.status === 'cancelled' || r.status === 'unfulfilled'
    })
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">
            My requests
          </h1>
          <p className="mt-1 text-charcoal/60">
            Track every pickup you've booked, past and present.
          </p>
        </div>
        <Link
          to="/customer/new"
          className="bg-primary text-white font-bold px-5 py-3 rounded-lg hover:bg-primary/90 transition shadow-sm"
        >
          + New request
        </Link>
      </div>

      {/* Tabs */}
      <div className="inline-flex p-1 rounded-xl bg-charcoal/5 border border-charcoal/5">
        {(
          [
            { v: 'all', label: 'All' },
            { v: 'active', label: 'Active' },
            { v: 'completed', label: 'Completed' },
            { v: 'cancelled', label: 'Cancelled' },
          ] as const
        ).map((t) => {
          const active = filter === t.v
          return (
            <button
              key={t.v}
              onClick={() => setFilter(t.v)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
                active ? 'bg-white text-charcoal shadow-sm' : 'text-charcoal/60 hover:text-charcoal'
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  active ? 'bg-primary text-white' : 'bg-charcoal/10 text-charcoal/70'
                }`}
              >
                {counts[t.v]}
              </span>
            </button>
          )
        })}
      </div>

      {list.isLoading ? (
        <p className="text-charcoal/60">Loading…</p>
      ) : visible.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((sr) => (
            <RequestCard key={sr.id} sr={sr} />
          ))}
        </div>
      )}
    </div>
  )
}

function RequestCard({ sr }: { sr: ServiceRequest }) {
  const meta = STATUS_META[sr.status]
  const isActive = ACTIVE.includes(sr.status)
  return (
    <Link
      to={`/customer/requests/${sr.id}`}
      className={`group bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition ${
        isActive ? 'border-primary/30' : 'border-charcoal/5'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 grid place-items-center text-2xl">
          {WASTE_ICON[sr.waste_type] || '🛢️'}
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${meta.tone}`}
        >
          {meta.label}
        </span>
      </div>
      <div className="mt-3">
        <div className="font-bold text-charcoal">
          #{sr.id} · {sr.waste_type.replace('_', ' ')}
        </div>
        <div className="mt-0.5 text-xs text-charcoal/60 capitalize">
          {sr.volume_tier} tank
        </div>
      </div>
      <div className="mt-3 text-sm text-charcoal/70 line-clamp-2 min-h-[2.5em]">
        📍 {sr.pickup_address || `${sr.pickup_lat}, ${sr.pickup_lng}`}
      </div>
      <div className="mt-4 pt-4 border-t border-charcoal/5 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-charcoal/50 font-semibold">
            Quote
          </div>
          <div className="font-heading text-xl font-extrabold text-primary">
            GHS {sr.quote_total}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-charcoal/50 font-semibold">
            Booked
          </div>
          <div className="text-xs text-charcoal/70">
            {new Date(sr.created_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
        </div>
      </div>
    </Link>
  )
}

function EmptyState({ filter }: { filter: Filter }) {
  const copy = {
    all: {
      icon: '📭',
      title: 'No requests yet',
      body: 'Book your first pickup — match with a driver in minutes.',
      cta: true,
    },
    active: {
      icon: '⏳',
      title: 'No active jobs',
      body: 'You have no in-progress requests right now.',
      cta: true,
    },
    completed: {
      icon: '✓',
      title: 'No completed jobs yet',
      body: 'Once a job wraps up it will show up here.',
      cta: false,
    },
    cancelled: {
      icon: '🗒️',
      title: 'No cancelled requests',
      body: 'Cancellations and unfulfilled jobs will appear here.',
      cta: false,
    },
  }[filter]

  return (
    <div className="text-center py-16 px-6 bg-white border border-charcoal/5 rounded-2xl">
      <div className="text-5xl">{copy.icon}</div>
      <h3 className="mt-4 font-bold text-charcoal text-lg">{copy.title}</h3>
      <p className="mt-1 text-sm text-charcoal/60 max-w-md mx-auto">{copy.body}</p>
      {copy.cta && (
        <Link
          to="/customer/new"
          className="mt-5 inline-block bg-primary text-white font-bold px-5 py-2.5 rounded-lg hover:bg-primary/90 transition"
        >
          Book a pickup →
        </Link>
      )}
    </div>
  )
}
