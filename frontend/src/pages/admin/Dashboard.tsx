import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchDaily, fetchOverview, fetchTopDrivers } from '@/api/analytics'
import { PageHeader } from '@/components/admin/PageHeader'

export function AdminDashboard() {
  const [days, setDays] = useState(30)
  const overview = useQuery({
    queryKey: ['analytics', 'overview', days],
    queryFn: () => fetchOverview(days),
  })
  const daily = useQuery({
    queryKey: ['analytics', 'daily', days],
    queryFn: () => fetchDaily(days),
  })
  const top = useQuery({
    queryKey: ['analytics', 'top', days],
    queryFn: () => fetchTopDrivers(days),
  })

  if (overview.isLoading) return <p className="text-charcoal/60">Loading…</p>
  const o = overview.data!

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        subtitle="Real-time view of platform activity, revenue, and operations."
        icon="📊"
        actions={
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="input max-w-[160px]"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        }
      />

      {/* Money KPIs */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-charcoal/50 mb-3">
          Revenue
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi
            label="GMV"
            value={`GHS ${formatMoney(o.money.gmv)}`}
            icon="💰"
            tone="primary"
            to="/admin/transactions"
          />
          <Kpi
            label="Commission"
            value={`GHS ${formatMoney(o.money.commission)}`}
            icon="📈"
            tone="accent"
            to="/admin/transactions"
          />
          <Kpi
            label="Refunded"
            value={`GHS ${formatMoney(o.money.refunded)}`}
            icon="↩️"
            tone="muted"
            to="/admin/transactions?status=refunded"
          />
          <Kpi
            label="Customers"
            value={String(o.customers_total)}
            icon="👥"
            tone="muted"
            to="/admin/users"
          />
        </div>
      </section>

      {/* Requests */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-charcoal/50 mb-3">
          Requests
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi
            label="Total"
            value={String(o.requests.total)}
            icon="📋"
            tone="muted"
            to="/admin/transactions"
          />
          <Kpi
            label="Completed"
            value={String(o.requests.completed)}
            icon="✓"
            tone="success"
            to="/admin/transactions?status=completed"
          />
          <Kpi
            label="Unfulfilled"
            value={String(o.requests.unfulfilled)}
            icon="⚠️"
            tone="warning"
            to="/admin/transactions?status=unfulfilled"
          />
          <Kpi
            label="Unfulfilled rate"
            value={`${(o.requests.unfulfilled_rate * 100).toFixed(1)}%`}
            icon="📉"
            tone={o.requests.unfulfilled_rate > 0.1 ? 'warning' : 'muted'}
            to="/admin/transactions?status=unfulfilled"
          />
        </div>
      </section>

      {/* Drivers */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-charcoal/50 mb-3">
          Drivers
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Kpi
            label="Total"
            value={String(o.drivers.total)}
            icon="🚛"
            tone="muted"
            to="/admin/drivers"
          />
          <Kpi
            label="Approved"
            value={String(o.drivers.approved)}
            icon="✅"
            tone="success"
            to="/admin/approvals"
          />
          <Kpi
            label="Online now"
            value={String(o.drivers.online)}
            icon="🟢"
            tone="primary"
            pulse
            to="/admin/drivers"
          />
        </div>
      </section>

      {/* Daily chart */}
      <section className="bg-white border border-charcoal/5 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading font-bold text-lg">Daily jobs</h2>
            <p className="text-xs text-charcoal/60 mt-0.5">
              Total vs completed requests per day
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <Legend color="bg-charcoal/15" label="Total" />
            <Legend color="bg-primary" label="Completed" />
          </div>
        </div>
        {daily.data?.rows.length ? (
          <DailyChart rows={daily.data.rows} />
        ) : (
          <div className="mt-8 text-center py-10">
            <div className="text-4xl">📭</div>
            <p className="mt-2 text-charcoal/60 text-sm">No data in window.</p>
          </div>
        )}
      </section>

      {/* Top drivers */}
      <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-charcoal/5">
          <h2 className="font-heading font-bold text-lg">Top drivers</h2>
          <p className="text-xs text-charcoal/60 mt-0.5">
            Ranked by completed jobs in the period
          </p>
        </div>
        {top.data?.length ? (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-charcoal/50 bg-charcoal/[0.02]">
              <tr>
                <th className="py-3 pl-6 w-16">Rank</th>
                <th>Driver</th>
                <th>Jobs</th>
                <th>Gross</th>
                <th>Commission</th>
                <th className="pr-6">Payout</th>
              </tr>
            </thead>
            <tbody>
              {top.data.map((d, i) => (
                <tr key={d.driver_id} className="border-t border-charcoal/5 hover:bg-charcoal/[0.02]">
                  <td className="py-3 pl-6">
                    <span
                      className={`inline-grid place-items-center w-7 h-7 rounded-full text-xs font-bold ${
                        i === 0
                          ? 'bg-accent text-charcoal'
                          : i === 1
                            ? 'bg-charcoal/15 text-charcoal'
                            : i === 2
                              ? 'bg-amber-200 text-amber-900'
                              : 'bg-charcoal/5 text-charcoal/60'
                      }`}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="font-semibold">{d.name || d.phone}</td>
                  <td>{d.jobs}</td>
                  <td>GHS {d.gross}</td>
                  <td className="text-charcoal/70">GHS {d.commission}</td>
                  <td className="pr-6 font-bold text-primary">GHS {d.payout}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-4xl">🏆</div>
            <p className="mt-2 text-charcoal/60 text-sm">No completed jobs yet.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function formatMoney(v: string) {
  const n = Number(v)
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return n.toFixed(2)
}

type Tone = 'primary' | 'accent' | 'success' | 'warning' | 'muted'

const TONE_CLASSES: Record<Tone, { bg: string; fg: string; ring: string }> = {
  primary: { bg: 'bg-primary/10', fg: 'text-primary', ring: 'ring-primary/20' },
  accent: { bg: 'bg-accent/15', fg: 'text-amber-700', ring: 'ring-accent/30' },
  success: { bg: 'bg-green-100', fg: 'text-green-700', ring: 'ring-green-200' },
  warning: { bg: 'bg-amber-100', fg: 'text-amber-700', ring: 'ring-amber-200' },
  muted: { bg: 'bg-charcoal/5', fg: 'text-charcoal/70', ring: 'ring-charcoal/10' },
}

function Kpi({
  label,
  value,
  icon,
  tone,
  pulse,
  to,
}: {
  label: string
  value: string
  icon: string
  tone: Tone
  pulse?: boolean
  to?: string
}) {
  const c = TONE_CLASSES[tone]
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.fg} grid place-items-center text-lg`}>
          {icon}
        </div>
        {pulse && Number(value) > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-700">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        )}
      </div>
      <div className="mt-4 text-xs text-charcoal/60 uppercase tracking-wider font-semibold">
        {label}
      </div>
      <div className="mt-1 font-heading text-2xl md:text-3xl font-extrabold text-charcoal">
        {value}
      </div>
    </>
  )

  const baseClasses =
    'block bg-white border border-charcoal/5 rounded-2xl p-5 shadow-sm transition'

  if (to) {
    return (
      <Link
        to={to}
        className={`${baseClasses} hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5 cursor-pointer`}
      >
        {inner}
      </Link>
    )
  }

  return <div className={`${baseClasses} hover:shadow-md`}>{inner}</div>
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded-sm ${color}`} />
      <span className="text-charcoal/70">{label}</span>
    </div>
  )
}

function DailyChart({ rows }: { rows: { day: string; total: number; completed: number }[] }) {
  const max = Math.max(...rows.map((r) => r.total), 1)
  return (
    <div className="mt-6 flex items-end gap-1.5 h-40">
      {rows.map((r) => {
        const totalPct = (r.total / max) * 100
        const completedPct = (r.completed / max) * 100
        return (
          <div key={r.day} className="flex-1 flex flex-col items-center group">
            <div className="w-full relative h-32 flex items-end">
              <div
                className="w-full bg-charcoal/15 rounded-t transition group-hover:bg-charcoal/25"
                style={{ height: `${totalPct}%` }}
                title={`Total: ${r.total}`}
              />
              <div
                className="w-full bg-primary rounded-t absolute bottom-0 transition group-hover:bg-primary/90"
                style={{ height: `${completedPct}%` }}
                title={`Completed: ${r.completed}`}
              />
            </div>
            <div className="mt-2 text-[10px] text-charcoal/60">{r.day.slice(5)}</div>
          </div>
        )
      })}
    </div>
  )
}
