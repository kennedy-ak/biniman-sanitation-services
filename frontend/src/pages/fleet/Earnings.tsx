import { useQuery } from '@tanstack/react-query'
import { fleetEarnings, listFleetPayouts } from '@/api/fleets'

export function FleetEarnings() {
  const earn = useQuery({ queryKey: ['fleet', 'earnings'], queryFn: fleetEarnings })
  const payouts = useQuery({ queryKey: ['fleet', 'payouts'], queryFn: listFleetPayouts })

  if (earn.isLoading) return <p>Loading…</p>
  const data = earn.data!

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Earnings</h1>
      <p className="mt-2 text-charcoal/70">
        Last 12 weeks. Payout = gross − commission.
      </p>

      <div className="mt-6 grid sm:grid-cols-4 gap-4">
        <Stat label="Total jobs" value={data.totals.jobs} />
        <Stat label="Gross (GHS)" value={data.totals.gross} />
        <Stat label="Commission (GHS)" value={data.totals.commission} />
        <Stat label="Payout (GHS)" value={data.totals.payout} highlight />
      </div>

      <div className="mt-8 card overflow-x-auto">
        <h2 className="font-bold mb-4">Weekly</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-charcoal/60">
            <tr>
              <th className="py-2">Week starting</th>
              <th>Jobs</th>
              <th>Gross</th>
              <th>Commission</th>
              <th>Payout</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w) => (
              <tr key={w.week_start} className="border-t border-charcoal/5">
                <td className="py-2">{w.week_start}</td>
                <td>{w.jobs}</td>
                <td>GHS {w.gross}</td>
                <td>GHS {w.commission}</td>
                <td className="font-semibold">GHS {w.payout}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.weeks.length === 0 && (
          <p className="text-charcoal/60 text-sm">No completed jobs in the last 12 weeks.</p>
        )}
      </div>

      <div className="mt-8 card overflow-x-auto">
        <h2 className="font-bold mb-4">Recent payouts</h2>
        {!payouts.data?.length ? (
          <p className="text-charcoal/60 text-sm">No payouts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-charcoal/60">
              <tr>
                <th className="py-2">Request</th>
                <th>Amount</th>
                <th>Commission</th>
                <th>Status</th>
                <th>Transferred</th>
              </tr>
            </thead>
            <tbody>
              {payouts.data.map((p) => (
                <tr key={p.id} className="border-t border-charcoal/5">
                  <td className="py-2">#{p.request}</td>
                  <td>GHS {p.amount}</td>
                  <td>GHS {p.commission}</td>
                  <td className="uppercase font-semibold text-xs">{p.status}</td>
                  <td>
                    {p.transferred_at ? new Date(p.transferred_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-charcoal/50">{label}</div>
      <div
        className={`mt-1 text-3xl font-extrabold ${
          highlight ? 'text-primary' : 'text-charcoal'
        }`}
      >
        {value}
      </div>
    </div>
  )
}
