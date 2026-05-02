import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAdminUser,
  fetchAdminUsers,
  type UserCreatePayload,
  type UserListRow,
} from '@/api/analytics'
import { fetchRegions } from '@/api/auth'
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
  const [showCreate, setShowCreate] = useState(false)

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
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-bold">
              {users.length} users
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="bg-primary text-white px-4 py-1.5 rounded-md text-sm font-semibold hover:bg-primary/90 transition"
            >
              + Create user
            </button>
          </div>
        }
      />

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}

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

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const regions = useQuery({ queryKey: ['regions'], queryFn: fetchRegions })
  const [phone, setPhone] = useState('+233')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('customer')
  const [regionId, setRegionId] = useState<number | undefined>(undefined)
  const [includeDriver, setIncludeDriver] = useState(false)
  const [vehicleReg, setVehicleReg] = useState('')
  const [vehicleType, setVehicleType] = useState<NonNullable<UserCreatePayload['vehicle_type']>>('medium_tanker')
  const [capacity, setCapacity] = useState(3000)
  const [licenseNumber, setLicenseNumber] = useState('')
  const [baseFee, setBaseFee] = useState('50.00')
  const [momoNumber, setMomoNumber] = useState('')
  const [momoProvider, setMomoProvider] = useState<NonNullable<UserCreatePayload['momo_provider']>>('mtn')
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (payload: UserCreatePayload) => createAdminUser(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      onClose()
    },
    onError: (e: unknown) => {
      const detail = (e as { response?: { data?: unknown } })?.response?.data
      const msg =
        typeof detail === 'string'
          ? detail
          : detail
            ? Object.entries(detail as Record<string, unknown>)
                .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
                .join(' • ')
            : 'Failed to create user.'
      setError(msg)
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^\+233\d{9}$/.test(phone)) {
      setError('Phone must be +233 followed by 9 digits.')
      return
    }
    const payload: UserCreatePayload = {
      phone,
      full_name: fullName || undefined,
      email: email || undefined,
      role,
      region_id: regionId ?? null,
    }
    if (role === 'driver' && includeDriver) {
      payload.vehicle_reg = vehicleReg
      payload.vehicle_type = vehicleType
      payload.vehicle_capacity_litres = capacity
      payload.license_number = licenseNumber
      payload.base_fee = baseFee
      if (momoNumber) {
        payload.momo_number = momoNumber
        payload.momo_provider = momoProvider
      }
    }
    create.mutate(payload)
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
                User signs in via OTP — no password needed.
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
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="customer">Customer</option>
                <option value="driver">Driver</option>
                <option value="fleet_admin">Fleet admin</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-charcoal/80">Region</span>
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
          </div>

          {role === 'driver' && (
            <div className="border-t border-charcoal/10 pt-4">
              <label className="flex items-center gap-2 text-sm font-medium text-charcoal/80">
                <input
                  type="checkbox"
                  checked={includeDriver}
                  onChange={(e) => setIncludeDriver(e.target.checked)}
                />
                Also create driver profile (status: pending)
              </label>
              {!includeDriver && (
                <p className="mt-1 text-xs text-charcoal/50">
                  Leave unchecked if the driver will complete onboarding themselves.
                </p>
              )}
              {includeDriver && (
                <div className="mt-4 grid sm:grid-cols-2 gap-4">
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
                  <div />
                  <label className="block">
                    <span className="text-sm font-medium text-charcoal/80">MoMo number (optional)</span>
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
              )}
            </div>
          )}

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
