import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminUsers, type UserListRow } from '@/api/analytics'
import { EmptyState, PageHeader, SegmentedTabs } from '@/components/admin/PageHeader'
import type { Role } from '@/types'

type RoleFilter = 'all' | Role

const ROLE_META: Record<Role, { label: string; icon: string; tone: string }> = {
  customer: { label: 'Customer', icon: '🏠', tone: 'bg-sky-100 text-sky-800' },
  driver: { label: 'Driver', icon: '🚛', tone: 'bg-amber-100 text-amber-800' },
  fleet_admin: { label: 'Fleet', icon: '🏢', tone: 'bg-purple-100 text-purple-800' },
  admin: { label: 'Admin', icon: '🛡️', tone: 'bg-charcoal/15 text-charcoal' },
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

export function AdminUsers({ initialRole = 'all' }: { initialRole?: RoleFilter } = {}) {
  const [role, setRole] = useState<RoleFilter>(initialRole)
  const [q, setQ] = useState('')

  const list = useQuery({
    queryKey: ['admin', 'users', role, q],
    queryFn: () =>
      fetchAdminUsers({
        role: role === 'all' ? undefined : role,
        q: q || undefined,
      }),
  })

  const users = list.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Every account on the platform with their trips and activity. Click a row for details."
        icon="👥"
        actions={
          <div className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-bold">
            {users.length} users
          </div>
        }
      />

      <div className="flex flex-wrap gap-3 items-center justify-between">
        <SegmentedTabs<RoleFilter>
          value={role}
          onChange={setRole}
          options={[
            { value: 'all', label: 'All' },
            { value: 'customer', label: 'Customers' },
            { value: 'driver', label: 'Drivers' },
            { value: 'fleet_admin', label: 'Fleet' },
            { value: 'admin', label: 'Admins' },
          ]}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search phone, name, or email…"
          className="input max-w-xs"
        />
      </div>

      {list.isLoading ? (
        <p className="text-charcoal/60">Loading…</p>
      ) : users.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No users match"
          body="Try a different role filter or search term."
        />
      ) : (
        <div className="bg-white border border-charcoal/5 rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-charcoal/50 bg-charcoal/[0.02]">
              <tr>
                <th className="py-3 pl-6">User</th>
                <th>Role</th>
                <th>Region</th>
                <th>Trips</th>
                <th>Activity</th>
                <th className="pr-6">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} u={u} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function UserRow({ u }: { u: UserListRow }) {
  const meta = ROLE_META[u.role] ?? ROLE_META.customer
  const activity =
    u.role === 'driver'
      ? `Earned GHS ${u.stats.earnings ?? '0'}`
      : `Spent GHS ${u.stats.spent ?? '0'}`

  return (
    <tr className="border-t border-charcoal/5 hover:bg-charcoal/[0.02] transition">
      <td className="py-3 pl-6">
        <Link to={`/admin/users/${u.id}`} className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-primary text-white grid place-items-center font-bold text-xs flex-shrink-0">
            {initials(u.full_name, u.phone)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-charcoal truncate">
              {u.full_name || u.phone}
            </div>
            <div className="text-xs text-charcoal/60 truncate">{u.phone}</div>
          </div>
        </Link>
      </td>
      <td>
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${meta.tone}`}
        >
          {meta.icon} {meta.label}
        </span>
      </td>
      <td className="text-charcoal/70">{u.region || '—'}</td>
      <td>
        <span className="font-semibold text-charcoal">{u.stats.trips_total}</span>
        {u.stats.trips_completed > 0 && (
          <span className="text-xs text-charcoal/60">
            {' '}
            ({u.stats.trips_completed} done)
          </span>
        )}
      </td>
      <td className="text-charcoal/70 text-xs">{activity}</td>
      <td className="pr-6 text-charcoal/60 text-xs">
        {new Date(u.created_at).toLocaleDateString()}
      </td>
    </tr>
  )
}
