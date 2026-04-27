import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  fetchMyFleet,
  fleetEarnings,
  listFleetDrivers,
  listFleetJobs,
} from '@/api/fleets'

export function FleetDashboard() {
  const fleet = useQuery({ queryKey: ['fleet', 'me'], queryFn: fetchMyFleet, retry: false })
  const isApproved = fleet.data?.status === 'approved'

  const drivers = useQuery({
    queryKey: ['fleet', 'drivers'],
    queryFn: listFleetDrivers,
    enabled: isApproved,
  })
  const jobs = useQuery({
    queryKey: ['fleet', 'jobs'],
    queryFn: () => listFleetJobs(),
    enabled: isApproved,
  })
  const earn = useQuery({
    queryKey: ['fleet', 'earnings'],
    queryFn: fleetEarnings,
    enabled: isApproved,
  })

  if (fleet.isLoading) return <p>Loading…</p>
  if (!fleet.data) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold">Fleet</h1>
        <p className="mt-2 text-charcoal/70">Register your company to get started.</p>
        <Link
          to="/fleet/signup"
          className="mt-4 inline-block bg-primary text-white px-5 py-2.5 rounded-md font-semibold"
        >
          Register fleet →
        </Link>
      </div>
    )
  }

  const activeJobs =
    jobs.data?.filter(
      (j) =>
        j.status !== 'completed' &&
        j.status !== 'cancelled' &&
        j.status !== 'unfulfilled',
    ).length ?? 0

  return (
    <div>
      <h1 className="text-3xl font-extrabold">{fleet.data.name}</h1>
      <p className="mt-2 text-charcoal/70">
        Status: <span className="font-semibold uppercase">{fleet.data.status}</span>
      </p>
      {!isApproved && (
        <div className="mt-4 card bg-amber-50 border-amber-200 text-sm">
          Awaiting platform approval. Once approved, you can invite drivers.
        </div>
      )}

      <div className="mt-6 grid sm:grid-cols-3 gap-4">
        <Stat label="Drivers" value={String(drivers.data?.length ?? 0)} />
        <Stat label="Active jobs" value={String(activeJobs)} />
        <Stat
          label={`Last 12 weeks (GHS)`}
          value={earn.data?.totals.payout ?? '0'}
          highlight
        />
      </div>

      <div className="mt-8 grid sm:grid-cols-2 gap-4">
        <QuickLink to="/fleet/drivers" title="Drivers" body="Invite + manage your roster." />
        <QuickLink to="/fleet/jobs" title="Jobs" body="See all jobs across your drivers." />
        <QuickLink to="/fleet/earnings" title="Earnings" body="Weekly rollup + payout history." />
        <QuickLink to="/fleet/signup" title="Company" body="Edit company details." />
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

function QuickLink({
  to,
  title,
  body,
}: {
  to: string
  title: string
  body: string
}) {
  return (
    <Link to={to} className="card hover:border-primary block">
      <h3 className="font-heading font-bold text-lg">{title}</h3>
      <p className="mt-1 text-sm text-charcoal/70">{body}</p>
    </Link>
  )
}
