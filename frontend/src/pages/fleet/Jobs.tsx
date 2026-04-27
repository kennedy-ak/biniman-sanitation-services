import { useQuery } from '@tanstack/react-query'
import { listFleetJobs } from '@/api/fleets'

export function FleetJobs() {
  const list = useQuery({ queryKey: ['fleet', 'jobs'], queryFn: () => listFleetJobs() })

  if (list.isLoading) return <p>Loading…</p>

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Jobs</h1>
      {!list.data?.length && (
        <p className="mt-4 text-charcoal/60">No jobs yet.</p>
      )}
      <div className="mt-6 card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-charcoal/60">
            <tr>
              <th className="py-2">#</th>
              <th>Driver</th>
              <th>Type</th>
              <th>Tier</th>
              <th>Total</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.map((sr) => (
              <tr key={sr.id} className="border-t border-charcoal/5">
                <td className="py-2">#{sr.id}</td>
                <td>{sr.driver?.user.full_name || sr.driver?.user.phone || '—'}</td>
                <td>{sr.waste_type.replace('_', ' ')}</td>
                <td>{sr.volume_tier}</td>
                <td>GHS {sr.quote_total}</td>
                <td className="uppercase font-semibold text-xs">
                  {sr.status.replace('_', ' ')}
                </td>
                <td>{new Date(sr.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
