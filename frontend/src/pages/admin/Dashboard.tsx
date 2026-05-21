import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Banknote, TrendingUp, RotateCcw, Users, ClipboardList,
  CheckCircle2, AlertTriangle, TrendingDown, Truck, ShieldCheck,
  Radio, AlertCircle, Trophy, ChevronRight,
} from 'lucide-react'
import { fetchDaily, fetchDisputes, fetchOverview, fetchTopDrivers } from '@/api/analytics'

export function AdminDashboard() {
  const [days, setDays] = useState(30)
  const overview  = useQuery({ queryKey: ['analytics', 'overview', days], queryFn: () => fetchOverview(days) })
  const daily     = useQuery({ queryKey: ['analytics', 'daily', days],    queryFn: () => fetchDaily(days) })
  const top       = useQuery({ queryKey: ['analytics', 'top', days],      queryFn: () => fetchTopDrivers(days) })
  const disputes  = useQuery({ queryKey: ['analytics', 'disputes'],        queryFn: fetchDisputes, staleTime: 30_000 })

  if (overview.isLoading) return <p className="text-charcoal/60">Loading…</p>
  const o = overview.data!

  const completionRate = o.requests.total > 0
    ? ((o.requests.completed / o.requests.total) * 100).toFixed(1)
    : '—'
  const disputeCount = disputes.data?.length ?? 0

  return (
    <div className="space-y-6 pb-12">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-[30px] font-extrabold text-charcoal tracking-[-0.4px] leading-none">
            Overview
          </h1>
          <p className="text-sm text-charcoal/50 mt-1">Real-time platform activity and revenue</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="bg-white border border-charcoal/15 rounded-xl px-4 py-2 text-sm text-charcoal/80 outline-none focus:border-primary/50 transition cursor-pointer"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* ── Disputes alert ── */}
      {disputeCount > 0 && (
        <Link
          to="/admin/disputes"
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 text-sm text-amber-800 hover:bg-amber-100 transition"
        >
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
          <span className="font-semibold">{disputeCount} item{disputeCount > 1 ? 's' : ''} need your attention</span>
          <span className="text-amber-600/70">— failed payouts, stuck transactions or pending refunds</span>
          <ChevronRight size={14} className="ml-auto text-amber-500 flex-shrink-0" />
        </Link>
      )}

      {/* ── Hero banner ── */}
      <div className="bg-primary rounded-2xl overflow-hidden relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 55% 140% at 110% 50%, rgba(93,212,160,0.15) 0%, transparent 60%)' }}
        />
        <div className="relative px-7 py-6 grid grid-cols-3 gap-4">
          <HeroStat
            label="Gross revenue"
            value={`GHS ${formatMoney(o.money.gmv)}`}
            note="Total billed to customers"
            highlight
          />
          <HeroStat
            label="Platform commission"
            value={`GHS ${formatMoney(o.money.commission)}`}
            note="Revenue earned by platform"
          />
          <HeroStat
            label="Completion rate"
            value={`${completionRate}%`}
            note={`${o.requests.completed} of ${o.requests.total} jobs completed`}
          />
        </div>
      </div>

      {/* ── KPI grid ── */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          Icon={RotateCcw}
          label="Refunded"
          value={`GHS ${formatMoney(o.money.refunded)}`}
          tone="muted"
          to="/admin/transactions?status=refunded"
        />
        <KpiCard
          Icon={Users}
          label="Customers"
          value={String(o.customers_total)}
          tone="blue"
          to="/admin/users"
        />
        <KpiCard
          Icon={AlertTriangle}
          label="Unfulfilled"
          value={String(o.requests.unfulfilled)}
          sub={`${(o.requests.unfulfilled_rate * 100).toFixed(1)}% rate`}
          tone={o.requests.unfulfilled_rate > 0.1 ? 'warning' : 'muted'}
          to="/admin/transactions?status=unfulfilled"
        />
        <KpiCard
          Icon={ClipboardList}
          label="Total requests"
          value={String(o.requests.total)}
          sub={`${o.requests.cancelled} cancelled`}
          tone="muted"
          to="/admin/transactions"
        />
      </div>

      {/* ── Drivers strip ── */}
      <div className="grid grid-cols-3 gap-3">
        <DriverStat Icon={Truck} label="Total drivers" value={String(o.drivers.total)} to="/admin/approvals" />
        <DriverStat Icon={ShieldCheck} label="Approved" value={String(o.drivers.approved)} to="/admin/approvals" />
        <DriverStat Icon={Radio} label="Online now" value={String(o.drivers.online)} live to="/admin/approvals" />
      </div>

      {/* ── Chart + Top drivers ── */}
      <div className="grid lg:grid-cols-5 gap-4">

        {/* Daily chart — 3/5 */}
        <div className="lg:col-span-3 bg-white border border-charcoal/8 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 pt-5 pb-4 flex items-start justify-between border-b border-charcoal/5">
            <div>
              <h2 className="font-heading font-bold text-base text-charcoal">Daily jobs</h2>
              <p className="text-xs text-charcoal/50 mt-0.5">Total vs completed per day</p>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-charcoal/55">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm bg-charcoal/15 inline-block" />
                Total
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm bg-primary inline-block" />
                Completed
              </span>
            </div>
          </div>
          <div className="px-6 py-5">
            {daily.data?.rows.length ? (
              <DailyChart rows={daily.data.rows} />
            ) : (
              <div className="py-16 text-center">
                <p className="text-3xl mb-2">📭</p>
                <p className="text-sm text-charcoal/50">No data in this window</p>
              </div>
            )}
          </div>
        </div>

        {/* Top drivers — 2/5 */}
        <div className="lg:col-span-2 bg-white border border-charcoal/8 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 pt-5 pb-4 border-b border-charcoal/5 flex items-center justify-between">
            <div>
              <h2 className="font-heading font-bold text-base text-charcoal">Top drivers</h2>
              <p className="text-xs text-charcoal/50 mt-0.5">Ranked by completed jobs</p>
            </div>
            <Trophy size={16} className="text-accent" />
          </div>
          {top.data?.length ? (
            <div className="flex-1 divide-y divide-charcoal/5">
              {top.data.slice(0, 6).map((d, i) => (
                <div key={d.driver_id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-charcoal/[0.02] transition">
                  {/* Rank */}
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                    i === 0 ? 'bg-accent text-charcoal'
                    : i === 1 ? 'bg-charcoal/15 text-charcoal'
                    : i === 2 ? 'bg-amber-200 text-amber-800'
                    : 'bg-charcoal/6 text-charcoal/45'
                  }`}>
                    {i + 1}
                  </span>
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[12px] font-bold flex-shrink-0">
                    {(d.name || d.phone)[0].toUpperCase()}
                  </div>
                  {/* Name + jobs */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-charcoal truncate">{d.name || d.phone}</p>
                    <p className="text-[11px] text-charcoal/45">{d.jobs} job{d.jobs !== 1 ? 's' : ''}</p>
                  </div>
                  {/* Payout */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-[13px] font-bold text-primary">GHS {d.payout}</p>
                    <p className="text-[10px] text-charcoal/40 font-mono">gross {d.gross}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <Trophy size={28} className="text-charcoal/20 mb-2" />
              <p className="text-sm text-charcoal/50">No completed jobs yet</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMoney(v: string) {
  const n = Number(v)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return n.toFixed(2)
}

// ── Hero stat ─────────────────────────────────────────────────────────────────

function HeroStat({ label, value, note, highlight = false }: {
  label: string; value: string; note?: string; highlight?: boolean
}) {
  return (
    <div className="bg-white/10 border border-white/15 rounded-xl px-5 py-4">
      <p className="text-[9px] uppercase tracking-[2px] text-white/50 font-semibold mb-2">{label}</p>
      <p className={`font-sans font-bold text-[24px] leading-none ${highlight ? 'text-[#6ee7a7]' : 'text-white'}`}>
        {value}
      </p>
      {note && <p className="text-[10px] text-white/35 mt-1.5">{note}</p>}
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────

type Tone = 'primary' | 'success' | 'warning' | 'blue' | 'muted'
const TONE: Record<Tone, { bg: string; icon: string; accent: string }> = {
  primary: { bg: 'bg-primary/8',   icon: 'text-primary',      accent: 'bg-primary' },
  success: { bg: 'bg-green-50',    icon: 'text-green-600',    accent: 'bg-green-500' },
  warning: { bg: 'bg-amber-50',    icon: 'text-amber-600',    accent: 'bg-amber-400' },
  blue:    { bg: 'bg-sky-50',      icon: 'text-sky-600',      accent: 'bg-sky-500' },
  muted:   { bg: 'bg-charcoal/5', icon: 'text-charcoal/50',  accent: 'bg-charcoal/25' },
}

function KpiCard({ Icon, label, value, sub, tone, to }: {
  Icon: React.ElementType; label: string; value: string
  sub?: string; tone: Tone; to?: string
}) {
  const t = TONE[tone]
  const inner = (
    <div className="bg-white border border-charcoal/8 rounded-xl p-5 shadow-sm relative overflow-hidden h-full hover:shadow-md hover:-translate-y-0.5 transition group">
      <div className={`absolute top-0 left-0 right-0 h-0.5 rounded-t-xl ${t.accent}`} />
      <div className={`w-9 h-9 rounded-lg ${t.bg} flex items-center justify-center mb-4`}>
        <Icon size={17} className={t.icon} />
      </div>
      <p className="text-[10px] uppercase tracking-[1.5px] text-charcoal/45 font-semibold mb-1">{label}</p>
      <p className="font-heading font-extrabold text-[26px] text-charcoal leading-none">{value}</p>
      {sub && <p className="text-[11px] text-charcoal/40 mt-1.5 font-mono">{sub}</p>}
    </div>
  )
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner
}

// ── Driver stat ───────────────────────────────────────────────────────────────

function DriverStat({ Icon, label, value, live, to }: {
  Icon: React.ElementType; label: string; value: string; live?: boolean; to?: string
}) {
  const inner = (
    <div className="bg-white border border-charcoal/8 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition">
      <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center flex-shrink-0">
        <Icon size={18} className="text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-[10px] uppercase tracking-[1.5px] text-charcoal/45 font-semibold">{label}</p>
        <p className="font-heading font-extrabold text-[22px] text-charcoal leading-tight">{value}</p>
      </div>
      {live && Number(value) > 0 && (
        <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Live
        </span>
      )}
    </div>
  )
  return to ? <Link to={to} className="block">{inner}</Link> : inner
}

// ── Daily chart ───────────────────────────────────────────────────────────────

function DailyChart({ rows }: { rows: { day: string; total: number; completed: number }[] }) {
  const max = Math.max(...rows.map((r) => r.total), 1)
  const gridLines = [0.25, 0.5, 0.75, 1]

  return (
    <div className="relative">
      {/* Grid lines */}
      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ bottom: 28 }}>
        {gridLines.map((pct) => (
          <div key={pct} className="border-t border-charcoal/5 w-full" />
        ))}
      </div>

      {/* Bars */}
      <div className="relative flex items-end gap-1 h-40">
        {rows.map((r) => {
          const totalPct   = (r.total / max) * 100
          const completedPct = (r.completed / max) * 100
          return (
            <div key={r.day} className="flex-1 flex flex-col items-center group/bar relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-charcoal text-white text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap opacity-0 group-hover/bar:opacity-100 transition pointer-events-none z-10 shadow-lg">
                <div className="font-semibold">{r.day.slice(5)}</div>
                <div className="text-white/70">Total: {r.total}</div>
                <div className="text-[#6ee7a7]">Done: {r.completed}</div>
              </div>

              {/* Bar stack */}
              <div className="w-full relative h-32 flex items-end">
                <div
                  className="absolute bottom-0 w-full bg-charcoal/10 rounded-t transition group-hover/bar:bg-charcoal/20"
                  style={{ height: `${totalPct}%` }}
                />
                <div
                  className="absolute bottom-0 w-full bg-primary rounded-t transition group-hover/bar:bg-primary/80"
                  style={{ height: `${completedPct}%` }}
                />
              </div>

              {/* Day label */}
              <div className="mt-2 text-[10px] text-charcoal/45 font-mono">{r.day.slice(5)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
