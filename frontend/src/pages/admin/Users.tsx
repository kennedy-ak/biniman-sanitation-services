import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  const qc = useQueryClient()
  const me = useAuth((s) => s.user)
  const [role, setRole] = useState<RoleFilter>(initialRole)
  const [q, setQ] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateDriver, setShowCreateDriver] = useState(false)
  const [createdMsg, setCreatedMsg] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkDeleteResult | null>(null)
  const driverContext = initialRole === 'driver'

  const list = useQuery({
    queryKey: ['admin', 'users', role, q],
    queryFn: () =>
      fetchAdminUsers({
        role: role === 'all' ? undefined : role,
        q: q || undefined,
      }),
  })

  const users = list.data ?? []
  const selectableIds = useMemo(
    () => users.filter((u) => u.id !== me?.id).map((u) => u.id),
    [users, me?.id],
  )

  // Drop selections that no longer appear in the current list (filter/role change).
  useEffect(() => {
    const visible = new Set(users.map((u) => u.id))
    setSelected((prev) => {
      const next = new Set<number>()
      prev.forEach((id) => {
        if (visible.has(id)) next.add(id)
      })
      return next.size === prev.size ? prev : next
    })
  }, [users])

  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))
  const someSelected = selected.size > 0 && !allSelected

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableIds))
    }
  }

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
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
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Every account on the platform with their trips and activity. Click a row for details."
        icon="👥"
        actions={
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-bold">
              {users.length} users
            </div>
            {driverContext ? (
              <button
                type="button"
                onClick={() => setShowCreateDriver(true)}
                className="bg-primary text-white px-4 py-1.5 rounded-md text-sm font-semibold hover:bg-primary/90 transition"
              >
                + Create driver
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowCreateDriver(true)}
                  className="border border-primary/30 text-primary px-4 py-1.5 rounded-md text-sm font-semibold hover:bg-primary/5 transition"
                >
                  + Create driver
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="bg-primary text-white px-4 py-1.5 rounded-md text-sm font-semibold hover:bg-primary/90 transition"
                >
                  + Create user
                </button>
              </>
            )}
          </div>
        }
      />

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(u) => {
            setCreatedMsg(
              `Created ${u.full_name || u.phone} (${u.role}).`,
            )
            setShowCreate(false)
            setTimeout(() => setCreatedMsg(null), 6000)
          }}
        />
      )}

      {showCreateDriver && (
        <CreateDriverModal
          onClose={() => setShowCreateDriver(false)}
          onCreated={(u) => {
            setCreatedMsg(
              `Created driver ${u.full_name || u.phone}. Profile is pending approval.`,
            )
            setShowCreateDriver(false)
            setTimeout(() => setCreatedMsg(null), 6000)
          }}
        />
      )}

      {createdMsg && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {createdMsg}
        </div>
      )}

      {bulkResult && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Deleted {bulkResult.deleted} {bulkResult.deleted === 1 ? 'user' : 'users'}.
          {bulkResult.skipped_self > 0 && ' Skipped your own account.'}
          {bulkResult.not_found.length > 0 &&
            ` ${bulkResult.not_found.length} not found.`}
        </div>
      )}


      {confirmBulk && (
        <ConfirmBulkDeleteModal
          count={selected.size}
          isPending={bulkDelete.isPending}
          error={
            bulkDelete.isError
              ? extractError(bulkDelete.error, 'Bulk delete failed.')
              : null
          }
          onCancel={() => {
            setConfirmBulk(false)
            bulkDelete.reset()
          }}
          onConfirm={() => bulkDelete.mutate()}
        />
      )}

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
        {selected.size > 0 ? (
          <div className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 pl-3 pr-1.5 py-1 text-sm">
            <span className="text-red-800 font-semibold">{selected.size} selected</span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-charcoal/60 hover:text-charcoal text-xs px-1.5"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setConfirmBulk(true)}
              className="bg-red-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-red-700 transition"
            >
              Delete
            </button>
          </div>
        ) : (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search phone, name, or email…"
            className="input max-w-xs"
          />
        )}
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
          <table className="w-full min-w-[800px] text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-charcoal/50 bg-charcoal/[0.02]">
              <tr>
                <th className="py-3 pl-6 w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected
                    }}
                    onChange={toggleAll}
                    disabled={selectableIds.length === 0}
                    className="h-4 w-4 cursor-pointer accent-red-600"
                  />
                </th>
                <th>User</th>
                <th>Role</th>
                <th>Town / City</th>
                <th>Trips</th>
                <th>Activity</th>
                <th className="pr-6">Joined</th>
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
      )}
    </div>
  )
}

function ConfirmBulkDeleteModal({
  count,
  isPending,
  error,
  onCancel,
  onConfirm,
}: {
  count: number
  isPending: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const enabled = confirmText.trim().toUpperCase() === 'DELETE' && !isPending

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-charcoal">
              Delete {count} {count === 1 ? 'user' : 'users'}?
            </h2>
            <p className="text-sm text-charcoal/70 mt-1">
              This is permanent. Their requests, driver profile, payments and
              ratings will be removed too. There is no undo.
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
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-3 border-t border-charcoal/10 pt-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="px-4 py-2 rounded-md text-sm font-medium text-charcoal/70 hover:text-charcoal disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!enabled}
              className="bg-red-600 text-white px-5 py-2 rounded-md text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isPending ? 'Deleting…' : `Delete ${count}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function UserRow({
  u,
  selected,
  onToggle,
  isSelf,
}: {
  u: UserListRow
  selected: boolean
  onToggle: () => void
  isSelf: boolean
}) {
  const meta = ROLE_META[u.role] ?? ROLE_META.customer
  const activity =
    u.role === 'driver'
      ? `Earned GHS ${u.stats.earnings ?? '0'}`
      : `Spent GHS ${u.stats.spent ?? '0'}`

  return (
    <tr
      className={`border-t border-charcoal/5 hover:bg-charcoal/[0.02] transition ${
        selected ? 'bg-red-50/40' : ''
      }`}
    >
      <td className="py-3 pl-6 w-10">
        <input
          type="checkbox"
          aria-label={isSelf ? 'Cannot select your own account' : `Select ${u.full_name || u.phone}`}
          checked={selected}
          onChange={onToggle}
          disabled={isSelf}
          title={isSelf ? "You can't delete your own account" : ''}
          className="h-4 w-4 cursor-pointer accent-red-600 disabled:cursor-not-allowed disabled:opacity-40"
        />
      </td>
      <td>
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

type NonDriverRole = Exclude<Role, 'driver'>

function extractError(e: unknown, fallback: string) {
  const resp = (e as { response?: { status?: number; data?: unknown } })?.response
  const detail = resp?.data
  if (typeof detail === 'string') {
    // Server returned HTML (Django 500 page) — surface a clean status line.
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

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (u: UserListRow) => void
}) {
  const qc = useQueryClient()
  const regions = useQuery({ queryKey: ['regions'], queryFn: fetchRegions })
  const [phone, setPhone] = useState('+233')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<NonDriverRole>('customer')
  const [regionId, setRegionId] = useState<number | undefined>(undefined)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (payload: UserCreatePayload) => createAdminUser(payload),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      onCreated(u)
    },
    onError: (e: unknown) => setError(extractError(e, 'Failed to create user.')),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^\+233\d{9}$/.test(phone)) {
      setError('Phone must be +233 followed by 9 digits.')
      return
    }
    if (password && password.length < 8) {
      setError('Password must be at least 8 characters (or leave blank for OTP-only).')
      return
    }
    create.mutate({
      phone,
      full_name: fullName || undefined,
      email: email || undefined,
      role,
      region_id: regionId ?? null,
      password: password || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit} className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-charcoal">Create user</h2>
              <p className="text-sm text-charcoal/60 mt-0.5">
                User signs in via OTP — no password needed. To onboard a driver, use{' '}
                <span className="font-semibold">Create driver</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-charcoal/50 hover:text-charcoal text-xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-charcoal/80">Phone (E.164)</span>
              <input
                required
                className="input mt-1"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+233241234567"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-charcoal/80">Full name</span>
              <input
                className="input mt-1"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-charcoal/80">Email (optional)</span>
              <input
                type="email"
                className="input mt-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-charcoal/80">Role</span>
              <select
                className="input mt-1"
                value={role}
                onChange={(e) => setRole(e.target.value as NonDriverRole)}
              >
                <option value="customer">Customer</option>
                <option value="fleet_admin">Fleet admin</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-charcoal/80">Town / City</span>
              <select
                className="input mt-1"
                value={regionId ?? ''}
                onChange={(e) => setRegionId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">— None —</option>
                {regions.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-charcoal/80">
                Initial password{' '}
                <span className="text-charcoal/50 font-normal">(optional)</span>
              </span>
              <div className="relative mt-1">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pr-16"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters — leave blank for OTP-only"
                  autoComplete="new-password"
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-charcoal/60 hover:text-charcoal px-2 py-1"
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="mt-1 text-xs text-charcoal/50">
                Share this with the user securely. They can change it from
                their security settings.
              </p>
            </label>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-charcoal/10 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium text-charcoal/70 hover:text-charcoal"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="bg-primary text-white px-5 py-2 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition"
            >
              {create.isPending ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateDriverModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (u: UserListRow) => void
}) {
  const qc = useQueryClient()
  const regions = useQuery({ queryKey: ['regions'], queryFn: fetchRegions })
  const [phone, setPhone] = useState('+233')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [regionId, setRegionId] = useState<number | undefined>(undefined)
  const [vehicleReg, setVehicleReg] = useState('')
  const [vehicleType, setVehicleType] =
    useState<NonNullable<UserCreatePayload['vehicle_type']>>('medium_tanker')
  const [capacity, setCapacity] = useState(3000)
  const [licenseNumber, setLicenseNumber] = useState('')
  const [baseFee, setBaseFee] = useState('50.00')
  const [momoNumber, setMomoNumber] = useState('')
  const [momoProvider, setMomoProvider] =
    useState<NonNullable<UserCreatePayload['momo_provider']>>('mtn')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (payload: UserCreatePayload) => createAdminUser(payload),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      onCreated(u)
    },
    onError: (e: unknown) => setError(extractError(e, 'Failed to create driver.')),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^\+233\d{9}$/.test(phone)) {
      setError('Phone must be +233 followed by 9 digits.')
      return
    }
    if (!regionId) {
      setError('Town / City is required for drivers.')
      return
    }
    if (momoNumber && !/^0\d{9}$/.test(momoNumber)) {
      setError('MoMo number must be 10 digits starting with 0.')
      return
    }
    if (password && password.length < 8) {
      setError('Password must be at least 8 characters (or leave blank for OTP-only).')
      return
    }
    const payload: UserCreatePayload = {
      phone,
      full_name: fullName || undefined,
      email: email || undefined,
      role: 'driver',
      region_id: regionId,
      vehicle_reg: vehicleReg,
      vehicle_type: vehicleType,
      vehicle_capacity_litres: capacity,
      license_number: licenseNumber,
      base_fee: baseFee,
      password: password || undefined,
    }
    if (momoNumber) {
      payload.momo_number = momoNumber
      payload.momo_provider = momoProvider
    }
    create.mutate(payload)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit} className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-charcoal">Create driver</h2>
              <p className="text-sm text-charcoal/60 mt-0.5">
                Creates the driver account and a pending driver profile. Vehicle, licence and
                payout details can be edited later in Approvals.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-charcoal/50 hover:text-charcoal text-xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">
              Account
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-charcoal/80">Phone (E.164)</span>
                <input
                  required
                  className="input mt-1"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+233241234567"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-charcoal/80">Full name</span>
                <input
                  required
                  className="input mt-1"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-charcoal/80">Email (optional)</span>
                <input
                  type="email"
                  className="input mt-1"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-charcoal/80">Town / City</span>
                <select
                  required
                  className="input mt-1"
                  value={regionId ?? ''}
                  onChange={(e) =>
                    setRegionId(e.target.value ? Number(e.target.value) : undefined)
                  }
                >
                  <option value="">Select town / city</option>
                  {regions.data?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="space-y-3 border-t border-charcoal/10 pt-4">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">
              Vehicle & licence
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-charcoal/80">Vehicle reg</span>
                <input
                  required
                  className="input mt-1"
                  value={vehicleReg}
                  onChange={(e) => setVehicleReg(e.target.value.toUpperCase())}
                  placeholder="GR-1234-25"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-charcoal/80">Vehicle type</span>
                <select
                  className="input mt-1"
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as typeof vehicleType)}
                >
                  <option value="small_tanker">Small tanker</option>
                  <option value="medium_tanker">Medium tanker</option>
                  <option value="large_tanker">Large tanker</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-charcoal/80">Capacity (litres)</span>
                <input
                  required
                  type="number"
                  min={500}
                  className="input mt-1"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-charcoal/80">Licence number</span>
                <input
                  required
                  className="input mt-1"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-charcoal/80">Base fee (GHS)</span>
                <input
                  required
                  inputMode="decimal"
                  className="input mt-1"
                  value={baseFee}
                  onChange={(e) => setBaseFee(e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="space-y-3 border-t border-charcoal/10 pt-4">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">
              Payout (optional)
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-charcoal/80">MoMo number</span>
                <input
                  inputMode="numeric"
                  className="input mt-1"
                  value={momoNumber}
                  onChange={(e) => setMomoNumber(e.target.value)}
                  placeholder="0241234567"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-charcoal/80">MoMo provider</span>
                <select
                  className="input mt-1"
                  value={momoProvider}
                  onChange={(e) => setMomoProvider(e.target.value as typeof momoProvider)}
                >
                  <option value="mtn">MTN</option>
                  <option value="vodafone">Vodafone</option>
                  <option value="airteltigo">AirtelTigo</option>
                </select>
              </label>
            </div>
            <p className="text-xs text-charcoal/50">
              Drivers must still upload licence, insurance and vehicle photos before approval.
            </p>
          </section>

          <section className="space-y-3 border-t border-charcoal/10 pt-4">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">
              Password (optional)
            </h3>
            <label className="block">
              <span className="text-sm font-medium text-charcoal/80">
                Initial password
              </span>
              <div className="relative mt-1">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pr-16"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters — leave blank for OTP-only"
                  autoComplete="new-password"
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-charcoal/60 hover:text-charcoal px-2 py-1"
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="mt-1 text-xs text-charcoal/50">
                Share with the driver securely. They can change it from their
                security settings.
              </p>
            </label>
          </section>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-charcoal/10 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium text-charcoal/70 hover:text-charcoal"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="bg-primary text-white px-5 py-2 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition"
            >
              {create.isPending ? 'Creating…' : 'Create driver'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
