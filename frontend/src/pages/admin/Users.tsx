import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Download, MapPin, MoreVertical, Plus, Search,
  ShieldCheck, SlidersHorizontal, Truck, UserCircle, Users,
} from 'lucide-react'
import {
  bulkDeleteAdminUsers,
  createAdminUser,
  fetchAdminUsers,
  type BulkDeleteResult,
  type UserCreatePayload,
  type UserListRow,
} from '@/api/analytics'
import { fetchRegions } from '@/api/auth'
import { useAuth } from '@/store/auth'
import type { Role } from '@/types'

type RoleFilter = 'all' | Role

interface RoleMeta {
  label: string
  Icon: React.ElementType
  badge: string
  avatar: string
}

const ROLE_META: Record<Role, RoleMeta> = {
  customer:   { label: 'Customer', Icon: UserCircle,  badge: 'bg-amber-50 text-amber-700 border-amber-200',      avatar: 'bg-amber-50 text-amber-700' },
  driver:     { label: 'Driver',   Icon: Truck,       badge: 'bg-green-50 text-green-700 border-green-200',      avatar: 'bg-primary/10 text-primary' },
  fleet_admin:{ label: 'Fleet',    Icon: Building2,   badge: 'bg-purple-50 text-purple-700 border-purple-200',   avatar: 'bg-purple-50 text-purple-700' },
  admin:      { label: 'Admin',    Icon: ShieldCheck, badge: 'bg-charcoal/8 text-charcoal/60 border-charcoal/15', avatar: 'bg-charcoal/8 text-charcoal/50' },
}

const ROLE_TABS: { value: RoleFilter; label: string }[] = [
  { value: 'all',        label: 'All' },
  { value: 'customer',   label: 'Customers' },
  { value: 'driver',     label: 'Drivers' },
  { value: 'fleet_admin',label: 'Fleet' },
  { value: 'admin',      label: 'Admins' },
]

function initials(name: string, fallback: string) {
  const src = name || fallback
  return src.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function exportCsv(users: UserListRow[]) {
  const headers = ['Name', 'Phone', 'Email', 'Role', 'Town/City', 'Trips Total', 'Trips Completed', 'Activity (GHS)', 'Activity Type', 'Joined']
  const rows = users.map((u) => {
    const isDriver = u.role === 'driver'
    const amt = isDriver ? (u.stats.earnings ?? '0') : (u.stats.spent ?? '0')
    return [
      u.full_name || '',
      u.phone,
      u.email || '',
      u.role,
      u.region || '',
      u.stats.trips_total,
      u.stats.trips_completed,
      Number(amt).toFixed(2),
      isDriver ? 'Earned' : 'Spent',
      new Date(u.created_at).toLocaleDateString(),
    ]
  })
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `biniman-users-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function AdminUsers({ initialRole = 'all' }: { initialRole?: RoleFilter } = {}) {
  const qc = useQueryClient()
  const me = useAuth((s) => s.user)
  const [role, setRole]               = useState<RoleFilter>(initialRole)
  const [q, setQ]                     = useState('')
  const [showCreate, setShowCreate]   = useState(false)
  const [showCreateDriver, setShowCreateDriver] = useState(false)
  const [createdMsg, setCreatedMsg]   = useState<string | null>(null)
  const [selected, setSelected]       = useState<Set<number>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [bulkResult, setBulkResult]   = useState<BulkDeleteResult | null>(null)
  const driverContext = initialRole === 'driver'

  // Fetch all users (search only, no role filter) — filter role client-side for counts
  const list = useQuery({
    queryKey: ['admin', 'users', q],
    queryFn: () => fetchAdminUsers({ q: q || undefined }),
  })

  const allUsers = useMemo(() => list.data ?? [], [list.data])
  const users = role === 'all' ? allUsers : allUsers.filter((u) => u.role === role)

  const roleCounts = useMemo(() => ({
    all:        allUsers.length,
    customer:   allUsers.filter((u) => u.role === 'customer').length,
    driver:     allUsers.filter((u) => u.role === 'driver').length,
    fleet_admin:allUsers.filter((u) => u.role === 'fleet_admin').length,
    admin:      allUsers.filter((u) => u.role === 'admin').length,
  }), [allUsers])

  const selectableIds = useMemo(
    () => users.filter((u) => u.id !== me?.id).map((u) => u.id),
    [users, me?.id],
  )

  // Prune selected ids that are no longer visible when the list changes
  // (reset state during render instead of in an effect)
  const visibleIdsKey = users.map((u) => u.id).join(',')
  const [prevVisibleKey, setPrevVisibleKey] = useState(visibleIdsKey)
  if (visibleIdsKey !== prevVisibleKey) {
    setPrevVisibleKey(visibleIdsKey)
    const visible = new Set(users.map((u) => u.id))
    setSelected((prev) => {
      const next = new Set<number>()
      prev.forEach((id) => { if (visible.has(id)) next.add(id) })
      return next.size === prev.size ? prev : next
    })
  }

  const allSelected  = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))
  const someSelected = selected.size > 0 && !allSelected

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(selectableIds))
  }
  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const bulkDelete = useMutation({
    mutationFn: () => bulkDeleteAdminUsers(Array.from(selected)),
    onSuccess: (data) => {
      setBulkResult(data)
      setSelected(new Set())
      setConfirmBulk(false)
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      setTimeout(() => setBulkResult(null), 8000)
    },
  })

  return (
    <div className="space-y-5 pb-12">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center flex-shrink-0">
            <Users size={18} className="text-sky-600" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-heading font-extrabold text-[28px] text-charcoal tracking-[-0.4px] leading-none">
                {driverContext ? 'Drivers' : 'Users'}
              </h1>
              <span className="font-mono text-[11px] px-2.5 py-1 rounded-full bg-primary/8 text-primary border border-primary/15">
                {allUsers.length} {driverContext ? 'drivers' : 'users'}
              </span>
            </div>
            <p className="text-sm text-charcoal/50 mt-1">
              Every account on the platform — trips, activity and spend at a glance
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportCsv(users)}
            disabled={users.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-charcoal/12 text-[12.5px] font-medium text-charcoal/70 hover:bg-charcoal/4 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Download size={13} /> Export
          </button>
          {!driverContext && (
            <button
              type="button"
              onClick={() => setShowCreateDriver(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-charcoal/12 text-[12.5px] font-medium text-charcoal/70 hover:bg-charcoal/4 transition"
            >
              <Truck size={13} /> + Driver
            </button>
          )}
          <button
            type="button"
            onClick={() => driverContext ? setShowCreateDriver(true) : setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-[12.5px] font-semibold hover:bg-primary/90 transition shadow-sm"
          >
            <Plus size={13} /> {driverContext ? 'Create driver' : 'Create user'}
          </button>
        </div>
      </div>

      {/* ── Modals ── */}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(u) => {
            setCreatedMsg(`Created ${u.full_name || u.phone} (${u.role}).`)
            setShowCreate(false)
            setTimeout(() => setCreatedMsg(null), 6000)
          }}
        />
      )}
      {showCreateDriver && (
        <CreateDriverModal
          onClose={() => setShowCreateDriver(false)}
          onCreated={(u) => {
            setCreatedMsg(`Created driver ${u.full_name || u.phone}. Profile is pending approval.`)
            setShowCreateDriver(false)
            setTimeout(() => setCreatedMsg(null), 6000)
          }}
        />
      )}
      {confirmBulk && (
        <ConfirmBulkDeleteModal
          count={selected.size}
          isPending={bulkDelete.isPending}
          error={bulkDelete.isError ? extractError(bulkDelete.error, 'Bulk delete failed.') : null}
          onCancel={() => { setConfirmBulk(false); bulkDelete.reset() }}
          onConfirm={() => bulkDelete.mutate()}
        />
      )}

      {/* ── Toast messages ── */}
      {createdMsg && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {createdMsg}
        </div>
      )}
      {bulkResult && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Deleted {bulkResult.deleted} {bulkResult.deleted === 1 ? 'user' : 'users'}.
          {bulkResult.skipped_self > 0 && ' Skipped your own account.'}
          {bulkResult.not_found.length > 0 && ` ${bulkResult.not_found.length} not found.`}
        </div>
      )}

      {/* ── Toolbar: tabs + search ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Role tabs */}
        <div className="inline-flex p-1 rounded-xl bg-charcoal/5 border border-charcoal/8 gap-0.5">
          {ROLE_TABS.map((t) => {
            const count = roleCounts[t.value]
            const active = role === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setRole(t.value)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
                  active
                    ? 'bg-white text-charcoal shadow-sm border border-charcoal/8'
                    : 'text-charcoal/55 hover:text-charcoal'
                }`}
              >
                {t.label}
                {typeof count === 'number' && count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    active ? 'bg-primary/10 text-primary' : 'bg-charcoal/10 text-charcoal/50'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Search or bulk actions */}
        {selected.size > 0 ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 pl-4 pr-2 py-1.5 text-sm">
            <span className="text-red-800 font-semibold">{selected.size} selected</span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-red-600/70 hover:text-red-700 text-xs px-1.5 font-medium"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setConfirmBulk(true)}
              className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-red-700 transition"
            >
              Delete
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/35 pointer-events-none" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search phone, name, or email…"
                className="w-[260px] bg-white border border-charcoal/12 rounded-lg pl-8 pr-4 py-2 text-[12.5px] text-charcoal placeholder-charcoal/35 outline-none focus:border-primary/40 transition"
              />
            </div>
            <button
              type="button"
              className="w-9 h-9 rounded-lg bg-white border border-charcoal/12 flex items-center justify-center text-charcoal/45 hover:text-charcoal hover:border-charcoal/25 transition"
              aria-label="Filter"
            >
              <SlidersHorizontal size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      {list.isLoading ? (
        <p className="text-charcoal/60 text-sm">Loading…</p>
      ) : users.length === 0 ? (
        <div className="py-20 text-center bg-white border border-charcoal/8 rounded-2xl">
          <div className="text-4xl mb-3">🔍</div>
          <p className="font-semibold text-charcoal">No users match</p>
          <p className="text-sm text-charcoal/50 mt-1">Try a different filter or search term.</p>
        </div>
      ) : (
        <div className="bg-white border border-charcoal/8 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-charcoal/8">
                  <th className="py-3 pl-5 w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleAll}
                      disabled={selectableIds.length === 0}
                      className="h-4 w-4 rounded cursor-pointer accent-red-600"
                    />
                  </th>
                  {['User', 'Role', 'Town / City', 'Trips', 'Activity', 'Joined', ''].map((h) => (
                    <th
                      key={h}
                      className="py-3 px-3 text-left text-[10px] uppercase tracking-[0.12em] text-charcoal/40 font-semibold whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    u={u}
                    selected={selected.has(u.id)}
                    onToggle={() => toggleOne(u.id)}
                    isSelf={u.id === me?.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── User row ──────────────────────────────────────────────────────────────────

function UserRow({
  u, selected, onToggle, isSelf,
}: {
  u: UserListRow; selected: boolean; onToggle: () => void; isSelf: boolean
}) {
  const meta  = ROLE_META[u.role] ?? ROLE_META.customer
  const { Icon: RoleIcon } = meta
  const isDriver    = u.role === 'driver'
  const activityAmt = isDriver ? (u.stats.earnings ?? '0') : (u.stats.spent ?? '0')
  const activityLabel = isDriver ? 'Earned' : 'Spent'
  const nonZero = Number(activityAmt) > 0

  return (
    <tr className={`border-t border-charcoal/6 transition group ${selected ? 'bg-red-50/40' : 'hover:bg-charcoal/[0.015]'}`}>

      {/* Checkbox */}
      <td className="pl-5 py-3.5 w-10">
        <input
          type="checkbox"
          aria-label={isSelf ? 'Cannot select your own account' : `Select ${u.full_name || u.phone}`}
          checked={selected}
          onChange={onToggle}
          disabled={isSelf}
          title={isSelf ? "You can't delete your own account" : ''}
          className="h-4 w-4 rounded cursor-pointer accent-red-600 disabled:cursor-not-allowed disabled:opacity-40"
        />
      </td>

      {/* User cell */}
      <td className="px-3 py-3.5">
        <Link to={`/admin/users/${u.id}`} className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${meta.avatar}`}>
            {initials(u.full_name, u.phone)}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-charcoal truncate">
              {u.full_name || u.phone}
            </div>
            <div className="text-[11px] text-charcoal/40 font-mono mt-0.5 truncate">{u.phone}</div>
          </div>
        </Link>
      </td>

      {/* Role badge */}
      <td className="px-3 py-3.5">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${meta.badge}`}>
          <RoleIcon size={10} />
          {meta.label}
        </span>
      </td>

      {/* Town */}
      <td className="px-3 py-3.5">
        {u.region ? (
          <div className="flex items-center gap-1.5 text-[12px] text-charcoal/55">
            <MapPin size={12} className="text-charcoal/30 flex-shrink-0" />
            {u.region}
          </div>
        ) : (
          <span className="text-charcoal/30 text-xs">—</span>
        )}
      </td>

      {/* Trips */}
      <td className="px-3 py-3.5">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-[13px] text-charcoal">{u.stats.trips_total}</span>
          {u.stats.trips_completed > 0 && (
            <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
              {u.stats.trips_completed} done
            </span>
          )}
        </div>
      </td>

      {/* Activity */}
      <td className="px-3 py-3.5">
        <div className={`font-mono font-semibold text-[12.5px] ${nonZero ? 'text-primary' : 'text-charcoal/35'}`}>
          GHS {Number(activityAmt).toFixed(2)}
        </div>
        <div className="text-[10px] text-charcoal/40 mt-0.5">{activityLabel}</div>
      </td>

      {/* Joined */}
      <td className="px-3 py-3.5 text-[12px] text-charcoal/50 whitespace-nowrap">
        {new Date(u.created_at).toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric',
        })}
      </td>

      {/* Row action */}
      <td className="pr-4 py-3.5 w-10">
        <button
          aria-label="Row actions"
          className="w-7 h-7 rounded-lg border border-charcoal/10 flex items-center justify-center text-charcoal/35 hover:text-charcoal hover:border-charcoal/25 opacity-0 group-hover:opacity-100 transition"
        >
          <MoreVertical size={13} />
        </button>
      </td>
    </tr>
  )
}

// ── Confirm bulk delete modal ─────────────────────────────────────────────────

function ConfirmBulkDeleteModal({
  count, isPending, error, onCancel, onConfirm,
}: {
  count: number; isPending: boolean; error: string | null
  onCancel: () => void; onConfirm: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const enabled = confirmText.trim().toUpperCase() === 'DELETE' && !isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-charcoal">
              Delete {count} {count === 1 ? 'user' : 'users'}?
            </h2>
            <p className="text-sm text-charcoal/70 mt-1">
              This is permanent. Their requests, driver profile, payments and ratings will be
              removed too. There is no undo.
            </p>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-charcoal/60">
              Type <span className="font-mono text-red-700">DELETE</span> to confirm
            </span>
            <input
              autoFocus
              className="input mt-1"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </label>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-3 border-t border-charcoal/10 pt-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium text-charcoal/70 hover:text-charcoal disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!enabled}
              className="bg-red-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isPending ? 'Deleting…' : `Delete ${count}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type NonDriverRole = Exclude<Role, 'driver'>

function extractError(e: unknown, fallback: string) {
  const resp = (e as { response?: { status?: number; data?: unknown } })?.response
  const detail = resp?.data
  if (typeof detail === 'string') {
    if (/<html|<!doctype/i.test(detail)) {
      return resp?.status === 500
        ? 'Server error (500). Check backend logs for the traceback.'
        : `HTTP ${resp?.status ?? '?'} — ${fallback}`
    }
    return detail
  }
  if (detail && typeof detail === 'object') {
    return Object.entries(detail as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join(' • ')
  }
  return fallback
}

// ── Create user modal ─────────────────────────────────────────────────────────

function CreateUserModal({
  onClose, onCreated,
}: {
  onClose: () => void; onCreated: (u: UserListRow) => void
}) {
  const qc = useQueryClient()
  const regions  = useQuery({ queryKey: ['regions'], queryFn: fetchRegions })
  const [phone, setPhone]       = useState('+233')
  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [role, setRole]         = useState<NonDriverRole>('customer')
  const [regionId, setRegionId] = useState<number | undefined>(undefined)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (payload: UserCreatePayload) => createAdminUser(payload),
    onSuccess: (u) => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); onCreated(u) },
    onError: (e: unknown) => setError(extractError(e, 'Failed to create user.')),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^\+233\d{9}$/.test(phone)) { setError('Phone must be +233 followed by 9 digits.'); return }
    if (password && password.length < 8) { setError('Password must be at least 8 characters (or leave blank for OTP-only).'); return }
    create.mutate({ phone, full_name: fullName || undefined, email: email || undefined, role, region_id: regionId ?? null, password: password || undefined })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit} className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-charcoal">Create user</h2>
              <p className="text-sm text-charcoal/60 mt-0.5">
                User signs in via OTP — no password needed. To onboard a driver, use{' '}
                <span className="font-semibold">Create driver</span>.
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-charcoal/50 hover:text-charcoal text-xl leading-none" aria-label="Close">×</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-charcoal/80">Phone (E.164)</span>
              <input required className="input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+233241234567" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-charcoal/80">Full name</span>
              <input className="input mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-charcoal/80">Email (optional)</span>
              <input type="email" className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-charcoal/80">Role</span>
              <select className="input mt-1" value={role} onChange={(e) => setRole(e.target.value as NonDriverRole)}>
                <option value="customer">Customer</option>
                <option value="fleet_admin">Fleet admin</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-charcoal/80">Town / City</span>
              <select className="input mt-1" value={regionId ?? ''} onChange={(e) => setRegionId(e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">— None —</option>
                {regions.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-charcoal/80">Initial password <span className="text-charcoal/50 font-normal">(optional)</span></span>
              <div className="relative mt-1">
                <input type={showPw ? 'text' : 'password'} className="input pr-16" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters — leave blank for OTP-only" autoComplete="new-password" minLength={8} />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-charcoal/60 hover:text-charcoal px-2 py-1">
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="mt-1 text-xs text-charcoal/50">Share this with the user securely. They can change it from their security settings.</p>
            </label>
          </div>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="flex items-center justify-end gap-3 border-t border-charcoal/10 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-charcoal/70 hover:text-charcoal">Cancel</button>
            <button type="submit" disabled={create.isPending} className="bg-primary text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition">
              {create.isPending ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Create driver modal ───────────────────────────────────────────────────────

function CreateDriverModal({
  onClose, onCreated,
}: {
  onClose: () => void; onCreated: (u: UserListRow) => void
}) {
  const qc = useQueryClient()
  const regions = useQuery({ queryKey: ['regions'], queryFn: fetchRegions })
  const [phone, setPhone]             = useState('+233')
  const [fullName, setFullName]       = useState('')
  const [email, setEmail]             = useState('')
  const [regionId, setRegionId]       = useState<number | undefined>(undefined)
  const [vehicleReg, setVehicleReg]   = useState('')
  const [vehicleType, setVehicleType] = useState<NonNullable<UserCreatePayload['vehicle_type']>>('medium_tanker')
  const [capacity, setCapacity]       = useState(3000)
  const [licenseNumber, setLicenseNumber] = useState('')
  const [baseFee, setBaseFee]         = useState('50.00')
  const [momoNumber, setMomoNumber]   = useState('')
  const [momoProvider, setMomoProvider] = useState<NonNullable<UserCreatePayload['momo_provider']>>('mtn')
  const [password, setPassword]       = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (payload: UserCreatePayload) => createAdminUser(payload),
    onSuccess: (u) => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); onCreated(u) },
    onError: (e: unknown) => setError(extractError(e, 'Failed to create driver.')),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^\+233\d{9}$/.test(phone)) { setError('Phone must be +233 followed by 9 digits.'); return }
    if (!regionId) { setError('Town / City is required for drivers.'); return }
    if (momoNumber && !/^0\d{9}$/.test(momoNumber)) { setError('MoMo number must be 10 digits starting with 0.'); return }
    if (password && password.length < 8) { setError('Password must be at least 8 characters (or leave blank for OTP-only).'); return }
    const payload: UserCreatePayload = {
      phone, full_name: fullName || undefined, email: email || undefined, role: 'driver',
      region_id: regionId, vehicle_reg: vehicleReg, vehicle_type: vehicleType,
      vehicle_capacity_litres: capacity, license_number: licenseNumber, base_fee: baseFee,
      password: password || undefined,
    }
    if (momoNumber) { payload.momo_number = momoNumber; payload.momo_provider = momoProvider }
    create.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit} className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-charcoal">Create driver</h2>
              <p className="text-sm text-charcoal/60 mt-0.5">
                Creates the driver account and a pending driver profile. Vehicle, licence and payout details can be edited later in Approvals.
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-charcoal/50 hover:text-charcoal text-xl leading-none" aria-label="Close">×</button>
          </div>

          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">Account</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block"><span className="text-sm font-medium text-charcoal/80">Phone (E.164)</span><input required className="input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+233241234567" /></label>
              <label className="block"><span className="text-sm font-medium text-charcoal/80">Full name</span><input required className="input mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
              <label className="block"><span className="text-sm font-medium text-charcoal/80">Email (optional)</span><input type="email" className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="block">
                <span className="text-sm font-medium text-charcoal/80">Town / City</span>
                <select required className="input mt-1" value={regionId ?? ''} onChange={(e) => setRegionId(e.target.value ? Number(e.target.value) : undefined)}>
                  <option value="">Select town / city</option>
                  {regions.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="space-y-3 border-t border-charcoal/10 pt-4">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">Vehicle &amp; licence</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block"><span className="text-sm font-medium text-charcoal/80">Vehicle reg</span><input required className="input mt-1" value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value.toUpperCase())} placeholder="GR-1234-25" /></label>
              <label className="block">
                <span className="text-sm font-medium text-charcoal/80">Vehicle type</span>
                <select className="input mt-1" value={vehicleType} onChange={(e) => setVehicleType(e.target.value as typeof vehicleType)}>
                  <option value="small_tanker">Small tanker</option>
                  <option value="medium_tanker">Medium tanker</option>
                  <option value="large_tanker">Large tanker</option>
                </select>
              </label>
              <label className="block"><span className="text-sm font-medium text-charcoal/80">Capacity (litres)</span><input required type="number" min={500} className="input mt-1" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} /></label>
              <label className="block"><span className="text-sm font-medium text-charcoal/80">Licence number</span><input required className="input mt-1" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} /></label>
              <label className="block"><span className="text-sm font-medium text-charcoal/80">Base fee (GHS)</span><input required inputMode="decimal" className="input mt-1" value={baseFee} onChange={(e) => setBaseFee(e.target.value)} /></label>
            </div>
          </section>

          <section className="space-y-3 border-t border-charcoal/10 pt-4">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">Payout (optional)</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block"><span className="text-sm font-medium text-charcoal/80">MoMo number</span><input inputMode="numeric" className="input mt-1" value={momoNumber} onChange={(e) => setMomoNumber(e.target.value)} placeholder="0241234567" /></label>
              <label className="block">
                <span className="text-sm font-medium text-charcoal/80">MoMo provider</span>
                <select className="input mt-1" value={momoProvider} onChange={(e) => setMomoProvider(e.target.value as typeof momoProvider)}>
                  <option value="mtn">MTN</option>
                  <option value="vodafone">Vodafone</option>
                  <option value="airteltigo">AirtelTigo</option>
                </select>
              </label>
            </div>
            <p className="text-xs text-charcoal/50">Drivers must still upload licence, insurance and vehicle photos before approval.</p>
          </section>

          <section className="space-y-3 border-t border-charcoal/10 pt-4">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">Password (optional)</h3>
            <label className="block">
              <span className="text-sm font-medium text-charcoal/80">Initial password</span>
              <div className="relative mt-1">
                <input type={showPw ? 'text' : 'password'} className="input pr-16" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters — leave blank for OTP-only" autoComplete="new-password" minLength={8} />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-charcoal/60 hover:text-charcoal px-2 py-1">
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="mt-1 text-xs text-charcoal/50">Share with the driver securely. They can change it from their security settings.</p>
            </label>
          </section>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="flex items-center justify-end gap-3 border-t border-charcoal/10 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-charcoal/70 hover:text-charcoal">Cancel</button>
            <button type="submit" disabled={create.isPending} className="bg-primary text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition">
              {create.isPending ? 'Creating…' : 'Create driver'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
