import { useQuery } from '@tanstack/react-query'
import { adminFlaggedUsers } from '@/api/ratings'
import { Stars } from '@/components/RatingForm'
import { EmptyState, PageHeader } from '@/components/admin/PageHeader'

const ROLE_META: Record<string, { label: string; icon: string; tone: string }> = {
  customer: { label: 'Customer', icon: '🏠', tone: 'bg-sky-100 text-sky-800' },
  driver: { label: 'Driver', icon: '🚛', tone: 'bg-amber-100 text-amber-800' },
  fleet_admin: { label: 'Fleet', icon: '🏢', tone: 'bg-purple-100 text-purple-800' },
  admin: { label: 'Admin', icon: '🛡️', tone: 'bg-charcoal/10 text-charcoal' },
}

function initials(name: string, fallback: string) {
  const src = name || fallback
  return src
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function AdminFlagged() {
  const list = useQuery({ queryKey: ['admin', 'flagged'], queryFn: adminFlaggedUsers })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flagged users"
        subtitle="Users whose recent average rating fell below 3.5 stars (last 10 ratings, min 3)."
        icon="🚩"
        actions={
          list.data?.length ? (
            <div className="px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-sm font-bold">
              {list.data.length} flagged
            </div>
          ) : null
        }
      />

      {list.isLoading && <p className="text-charcoal/60">Loading…</p>}
      {!list.isLoading && !list.data?.length && (
        <EmptyState
          icon="✨"
          title="No flagged users"
          body="When ratings dip below the threshold, users will surface here for review."
        />
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {list.data?.map((u) => {
          const meta = ROLE_META[u.role] ?? ROLE_META.customer
          const severity =
            u.avg < 2 ? 'critical' : u.avg < 3 ? 'high' : 'medium'
          const sevTone = {
            critical: 'border-red-300 bg-red-50/50',
            high: 'border-amber-300 bg-amber-50/50',
            medium: 'border-charcoal/10 bg-white',
          }[severity]
          return (
            <div
              key={u.user_id}
              className={`rounded-2xl border p-5 shadow-sm hover:shadow-md transition ${sevTone}`}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-charcoal text-white grid place-items-center font-bold text-lg flex-shrink-0">
                  {initials(u.full_name, u.phone)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-charcoal truncate">
                        {u.full_name || u.phone}
                      </h3>
                      <p className="text-xs text-charcoal/60">{u.phone}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${meta.tone}`}
                    >
                      {meta.icon} {meta.label}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <Stars score={Math.round(u.avg)} />
                      <div className="mt-1 text-xs text-charcoal/60">
                        {u.avg.toFixed(2)} avg · {u.count} ratings
                      </div>
                    </div>
                    <div
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                        severity === 'critical'
                          ? 'bg-red-600 text-white'
                          : severity === 'high'
                            ? 'bg-amber-500 text-white'
                            : 'bg-charcoal/10 text-charcoal/70'
                      }`}
                    >
                      {severity}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
