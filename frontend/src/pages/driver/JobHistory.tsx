import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchDriverHistory } from '@/api/requests'

export function DriverJobHistory() {
  const historyQuery = useQuery({
    queryKey: ['driver', 'history'],
    queryFn: fetchDriverHistory,
  })

  if (historyQuery.isLoading) return <p className="text-charcoal/60">Loading…</p>

  // API returns newest-first; reverse to assign seq numbers oldest=1
  const jobs = historyQuery.data ?? []
  const total = jobs.length

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-3xl font-extrabold text-charcoal">Job history</h1>
      <p className="mt-1 text-sm text-charcoal/60">Your completed and cancelled jobs.</p>

      {jobs.length === 0 ? (
        <div className="mt-10 text-center text-charcoal/50">
          <div className="text-4xl">📋</div>
          <p className="mt-3 font-semibold">No jobs yet</p>
          <p className="text-sm mt-1">Completed jobs will appear here.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {jobs.map((job, idx) => {
            const seq = total - idx  // newest = total, oldest = 1
            const earnings = (Number(job.quote_total) - Number(job.commission_amount)).toFixed(2)
            const date = new Date(job.created_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
            return (
              <Link
                key={job.id}
                to={`/driver/history/${job.id}`}
                state={{ seq }}
                className="block bg-white border border-charcoal/5 rounded-xl shadow-sm p-4 hover:shadow-md hover:border-primary/20 transition"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-charcoal capitalize">
                      Ride {seq} · {job.waste_type.replace('_', ' ')} · {job.volume_tier} tank
                    </div>
                    <div className="text-xs text-charcoal/50 mt-0.5">{date}</div>
                    {job.pickup_address && (
                      <div className="text-xs text-charcoal/60 mt-0.5">
                        📍 {job.pickup_address}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-heading font-extrabold text-primary">GHS {earnings}</div>
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        job.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
