import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchDriverHistory } from '@/api/requests'
import type { ServiceRequest } from '@/types'

type Filter = 'all' | 'completed' | 'cancelled'
type Sort   = 'newest' | 'oldest' | 'amount'

function formatDate(s: string) {
  return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatDateTime(s: string) {
  return new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function DriverJobHistory() {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort]     = useState<Sort>('newest')

  const historyQuery = useQuery({
    queryKey: ['driver', 'history'],
    queryFn: fetchDriverHistory,
  })

  const jobs = historyQuery.data ?? []

  // Summary stats (over all jobs, not filtered)
  const completed  = jobs.filter((j) => j.status === 'completed')
  const totalEarned = completed.reduce(
    (s, j) => s + Number(j.quote_total) - Number(j.commission_amount),
    0,
  )
  const avgPerJob = completed.length > 0 ? totalEarned / completed.length : 0

  // Sequence numbers: oldest = 1
  const seqMap = useMemo(() => {
    const sorted = [...jobs].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
    return new Map(sorted.map((j, i) => [j.id, i + 1]))
  }, [jobs])

  // Filtered + searched + sorted
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return jobs
      .filter((j) => {
        if (filter === 'completed') return j.status === 'completed'
        if (filter === 'cancelled') return j.status === 'cancelled' || j.status === 'unfulfilled'
        return true
      })
      .filter((j) =>
        !q ||
        j.waste_type.includes(q) ||
        j.volume_tier.includes(q) ||
        (j.pickup_address ?? '').toLowerCase().includes(q) ||
        j.status.includes(q),
      )
      .sort((a, b) => {
        if (sort === 'oldest') return +new Date(a.created_at) - +new Date(b.created_at)
        if (sort === 'amount')
          return (
            (Number(b.quote_total) - Number(b.commission_amount)) -
            (Number(a.quote_total) - Number(a.commission_amount))
          )
        return +new Date(b.created_at) - +new Date(a.created_at)
      })
  }, [jobs, filter, search, sort])

  // Group by calendar day
  const grouped = useMemo(() => {
    const map = new Map<string, ServiceRequest[]>()
    for (const j of visible) {
      const key = formatDate(j.created_at)
      const arr = map.get(key) ?? []
      arr.push(j)
      map.set(key, arr)
    }
    return Array.from(map.entries())
  }, [visible])

  if (historyQuery.isLoading) return <p className="text-charcoal/60">Loading…</p>

  return (
    <div className="space-y-5 pb-12">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-[28px] text-charcoal tracking-[-0.4px] leading-none">
            Job History
          </h1>
          <span className="font-mono text-[11px] px-2.5 py-1 rounded-full bg-primary/8 text-primary border border-primary/15">
            {jobs.length} jobs
          </span>
        </div>

        {/* Filter pills */}
        <div className="inline-flex p-1 rounded-xl bg-charcoal/5 border border-charcoal/5">
          {(['all', 'completed', 'cancelled'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition capitalize ${
                filter === f
                  ? 'bg-white text-charcoal shadow-sm'
                  : 'text-charcoal/55 hover:text-charcoal'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary strip ── */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          accent="#5dd4a0"
          iconBg="rgba(93,212,160,0.12)"
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#5dd4a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          }
          label="Completed"
          value={String(completed.length)}
        />
        <SummaryCard
          accent="#60a5fa"
          iconBg="rgba(96,165,250,0.12)"
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          }
          label="Total earned"
          value={`GHS ${totalEarned.toFixed(2)}`}
        />
        <SummaryCard
          accent="#f59e0b"
          iconBg="rgba(245,158,11,0.12)"
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
          }
          label="Avg per job"
          value={completed.length > 0 ? `GHS ${avgPerJob.toFixed(2)}` : '—'}
        />
      </div>

      {/* ── Search + sort ── */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/30 pointer-events-none"
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search jobs, locations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-charcoal/15 rounded-lg pl-9 pr-4 py-2.5 text-[13.5px] text-charcoal placeholder-charcoal/35 outline-none focus:border-primary/50 transition"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="bg-white border border-charcoal/15 rounded-lg px-3 py-2.5 text-[13px] text-charcoal/70 outline-none focus:border-primary/50 transition cursor-pointer"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="amount">Highest amount</option>
        </select>
      </div>

      {/* ── Job list ── */}
      {visible.length === 0 ? (
        <div className="py-16 text-center bg-white border border-charcoal/8 rounded-2xl">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-semibold text-charcoal">No jobs found</p>
          <p className="text-sm text-charcoal/50 mt-1">
            {search ? 'Try a different search.' : 'Completed jobs will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([dateLabel, dayJobs]) => (
            <div key={dateLabel}>
              {/* Date group label */}
              <p className="text-[11px] uppercase tracking-[1.5px] text-charcoal/40 font-semibold border-b border-charcoal/8 pb-2 mb-3 font-mono">
                {dateLabel}
              </p>
              <div className="space-y-2.5">
                {dayJobs.map((job) => (
                  <JobCard key={job.id} job={job} seq={seqMap.get(job.id) ?? job.id} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({
  accent, iconBg, icon, label, value,
}: {
  accent: string; iconBg: string; icon: React.ReactNode
  label: string; value: string
}) {
  return (
    <div className="bg-white border border-charcoal/8 rounded-xl px-5 py-4 flex items-center gap-3.5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: accent }} />
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[1.5px] text-charcoal/45 font-semibold mb-0.5">{label}</p>
        <p className="font-sans font-bold text-[20px] leading-none text-charcoal">{value}</p>
      </div>
    </div>
  )
}

// ── Job card ──────────────────────────────────────────────────────────────────

function JobCard({ job, seq }: { job: ServiceRequest; seq: number }) {
  const isCompleted = job.status === 'completed'
  const earnings = (Number(job.quote_total) - Number(job.commission_amount)).toFixed(2)
  const dateStr = formatDateTime(job.created_at)
  const location = job.pickup_address || `${job.pickup_lat}, ${job.pickup_lng}`

  return (
    <Link
      to={`/driver/history/${job.id}`}
      state={{ seq }}
      className="group flex items-center gap-4 bg-white border border-charcoal/8 rounded-xl px-5 py-4 hover:shadow-md hover:-translate-y-0.5 hover:border-charcoal/20 transition relative overflow-hidden"
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
        style={{ background: isCompleted ? '#5dd4a0' : '#f87171' }}
      />

      {/* Sequence number */}
      <div className="w-10 h-10 rounded-full border border-charcoal/12 bg-charcoal/4 flex items-center justify-center font-mono text-[11px] font-medium text-charcoal/45 flex-shrink-0 ml-1">
        #{seq}
      </div>

      {/* Main */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-semibold text-charcoal text-[14px] capitalize">
            {job.waste_type.replace('_', ' ')} · {job.volume_tier} tank
          </span>
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-primary/8 text-primary border border-primary/12 flex-shrink-0">
            Ride
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-charcoal/45 font-mono">
          <span className="flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {dateStr}
          </span>
          {location && (
            <span className="flex items-center gap-1 truncate max-w-[180px]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              {location}
            </span>
          )}
        </div>
      </div>

      {/* Right: amount + badge */}
      <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
        <div className="font-bold text-[18px] text-charcoal leading-none">
          <span className="text-[11px] font-mono font-normal text-charcoal/40 mr-0.5">GHS </span>
          {earnings}
        </div>
        <span
          className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full ${
            isCompleted
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-600 border border-red-200'
          }`}
        >
          {job.status}
        </span>
      </div>

      {/* Chevron */}
      <svg
        className="text-charcoal/25 group-hover:text-charcoal/50 group-hover:translate-x-0.5 transition flex-shrink-0"
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </Link>
  )
}
