import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteAdminUser,
  fetchAdminUser,
  setUserActive,
  updateAdminUser,
} from '@/api/analytics'
import { fetchRegions } from '@/api/auth'
import { Stars } from '@/components/RatingForm'
import { DriverDocuments } from '@/components/admin/DriverDocuments'
import type { RequestStatus, Role } from '@/types'

const ROLE_META: Record<Role, { label: string; icon: string; tone: string }> = {
  customer: { label: 'Customer', icon: '🏠', tone: 'bg-sky-100 text-sky-800' },
  driver: { label: 'Driver', icon: '🚛', tone: 'bg-amber-100 text-amber-800' },
  fleet_admin: { label: 'Fleet', icon: '🏢', tone: 'bg-purple-100 text-purple-800' },
  admin: { label: 'Admin', icon: '🛡️', tone: 'bg-charcoal/15 text-charcoal' },
}

const STATUS_TONE: Record<RequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  assigned: 'bg-amber-100 text-amber-800',
  accepted: 'bg-blue-100 text-blue-800',
  en_route: 'bg-blue-100 text-blue-800',
  arrived: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  unfulfilled: 'bg-red-100 text-red-800',
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

export function AdminUserDetail() {
  const { id } = useParams<{ id: string }>()
  const userId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const detail = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => fetchAdminUser(userId),
    enabled: Number.isFinite(userId),
  })
  const regions = useQuery({ queryKey: ['regions'], queryFn: fetchRegions })

  const banMut = useMutation({
    mutationFn: (active: boolean) => setUserActive(userId, active),
    onSuccess: (_, active) => {
      qc.invalidateQueries({ queryKey: ['admin', 'user', userId] })
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      setActionMsg(active ? 'User reinstated.' : 'User banned. They cannot log in.')
      setTimeout(() => setActionMsg(null), 4000)
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteAdminUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      navigate('/admin/users', { replace: true })
    },
  })

  if (detail.isLoading) return <p className="text-charcoal/60">Loading…</p>
  if (!detail.data) return <p className="text-charcoal/60">Not found.</p>

  const { user, stats, rating, driver, trips } = detail.data
  const meta = ROLE_META[user.role] ?? ROLE_META.customer
  const isDriver = user.role === 'driver'

  return (
    <div className="space-y-6">
      <Link
        to="/admin/users"
        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
      >
        ← Back to users
      </Link>

      {/* Profile header */}
      <div className="bg-gradient-to-br from-primary to-[#084d29] text-white rounded-2xl p-6 md:p-8 shadow-lg">
        <div className="flex flex-wrap items-start gap-5">
          <div className="w-20 h-20 rounded-2xl bg-white/15 backdrop-blur grid place-items-center font-heading font-extrabold text-2xl text-white border border-white/20 flex-shrink-0">
            {initials(user.full_name, user.phone)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${meta.tone}`}
              >
                {meta.icon} {meta.label}
              </span>
              {!user.is_active && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-500 text-white">
                  Inactive
                </span>
              )}
              {user.is_phone_verified && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/20 text-white">
                  ✓ Verified
                </span>
              )}
            </div>
            <h1 className="mt-2 font-heading text-3xl md:text-4xl font-extrabold">
              {user.full_name || user.phone}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/85">
              <span>📞 {user.phone}</span>
              {user.email && <span>✉️ {user.email}</span>}
              {user.region && <span>📍 {user.region}</span>}
              <span>📅 Joined {new Date(user.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          {rating.avg !== null && (
            <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-3 border border-white/15 text-center">
              <div className="text-3xl font-extrabold">{rating.avg.toFixed(1)}</div>
              <Stars score={Math.round(rating.avg)} />
              <div className="mt-1 text-[10px] uppercase tracking-wider text-white/70">
                {rating.count} ratings
              </div>
            </div>
          )}
        </div>

        {/* Admin actions */}
        <div className="relative mt-6 pt-5 border-t border-white/15 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setEditing((v) => !v)}
            className="bg-white/15 hover:bg-white/25 border border-white/20 px-4 py-2 rounded-lg text-sm font-bold transition"
          >
            {editing ? '✕ Cancel edit' : '✏️ Edit profile'}
          </button>
          <button
            onClick={() => banMut.mutate(!user.is_active)}
            disabled={banMut.isPending}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-60 ${
              user.is_active
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {banMut.isPending
              ? 'Working…'
              : user.is_active
                ? '🚫 Ban user'
                : '✓ Reinstate user'}
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="ml-auto bg-transparent hover:bg-red-500/20 border border-red-300/50 text-red-100 px-4 py-2 rounded-lg text-sm font-bold transition"
          >
            🗑 Delete
          </button>
        </div>
        {actionMsg && (
          <div className="relative mt-3 text-sm bg-white/15 px-3 py-2 rounded-lg border border-white/15">
            {actionMsg}
          </div>
        )}
      </div>

      {/* Edit panel */}
      {editing && (
        <EditPanel
          userId={userId}
          initial={{
            full_name: user.full_name,
            email: user.email,
            role: user.role,
            region: user.region,
          }}
          regions={regions.data ?? []}
          onDone={() => {
            setEditing(false)
            qc.invalidateQueries({ queryKey: ['admin', 'user', userId] })
            qc.invalidateQueries({ queryKey: ['admin', 'users'] })
          }}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-red-900">
            Permanently delete {user.full_name || user.phone}?
          </h3>
          <p className="mt-1 text-sm text-red-800/85">
            This removes the account and cascades to all their trips, payments, and
            documents. This cannot be undone — consider banning instead.
          </p>
          <div className="mt-3 flex gap-2 justify-end">
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 rounded-lg text-charcoal/70 hover:bg-white font-semibold text-sm"
            >
              Keep account
            </button>
            <button
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
              className="bg-red-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-60 transition text-sm"
            >
              {deleteMut.isPending ? 'Deleting…' : 'Yes, delete forever'}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total trips" value={String(stats.trips_total)} icon="📋" />
        <Stat label="Completed" value={String(stats.trips_completed)} icon="✓" />
        {isDriver ? (
          <>
            <Stat label="Gross" value={`GHS ${stats.gross ?? '0'}`} icon="💰" />
            <Stat
              label="Earnings"
              value={`GHS ${stats.earnings ?? '0'}`}
              icon="📈"
              highlight
            />
          </>
        ) : (
          <>
            <Stat label="Spent" value={`GHS ${stats.spent ?? '0'}`} icon="💳" highlight />
            <Stat
              label="Avg per trip"
              value={
                stats.trips_completed > 0 && stats.spent
                  ? `GHS ${(Number(stats.spent) / stats.trips_completed).toFixed(2)}`
                  : '—'
              }
              icon="∼"
            />
          </>
        )}
      </div>

      {/* Driver-specific */}
      {isDriver && driver && (
        <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm p-6">
          <h2 className="font-heading font-bold text-lg">Driver profile</h2>
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <Field label="Vehicle">
              {driver.vehicle_reg} · {driver.vehicle_type.replace('_', ' ')}
            </Field>
            <Field label="Capacity">{driver.vehicle_capacity_litres}L</Field>
            <Field label="License">{driver.license_number}</Field>
            <Field label="MoMo">
              {driver.momo_provider} · {driver.momo_number}
            </Field>
            <Field label="Status">
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  driver.status === 'approved'
                    ? 'bg-green-100 text-green-800'
                    : driver.status === 'pending'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800'
                }`}
              >
                {driver.status}
              </span>
            </Field>
            <Field label="Online">
              {driver.is_online ? (
                <span className="text-green-700 font-semibold">● Online</span>
              ) : (
                <span className="text-charcoal/60">○ Offline</span>
              )}
            </Field>
            <Field label="Documents">{driver.documents.length}/4</Field>
            <Field label="Approved">
              {driver.approved_at
                ? new Date(driver.approved_at).toLocaleDateString()
                : '—'}
            </Field>
          </div>
        </section>
      )}

      {isDriver && driver && <DriverDocuments driver={driver} />}

      {/* Trips */}
      <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-charcoal/5 flex items-center justify-between">
          <div>
            <h2 className="font-heading font-bold text-lg">Trip history</h2>
            <p className="text-xs text-charcoal/60 mt-0.5">
              Up to the most recent 100 trips
            </p>
          </div>
          <span className="text-sm text-charcoal/60">{trips.length} shown</span>
        </div>
        {trips.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl">🗺️</div>
            <p className="mt-2 text-charcoal/60 text-sm">No trips yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-charcoal/50 bg-charcoal/[0.02]">
              <tr>
                <th className="py-3 pl-6">Request</th>
                <th>{isDriver ? 'Customer' : 'Driver'}</th>
                <th>Type</th>
                <th>Status</th>
                <th>Amount</th>
                <th className="pr-6">Date</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => {
                const counterparty = isDriver
                  ? t.customer.full_name || t.customer.phone
                  : t.driver
                    ? t.driver.user.full_name || t.driver.user.phone
                    : '—'
                return (
                  <tr
                    key={t.id}
                    className="border-t border-charcoal/5 hover:bg-charcoal/[0.02] transition"
                  >
                    <td className="py-3 pl-6 font-semibold">#{t.id}</td>
                    <td className="text-charcoal/80">{counterparty}</td>
                    <td className="text-charcoal/70 text-xs">
                      {t.waste_type.replace('_', ' ')} · {t.volume_tier}
                    </td>
                    <td>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_TONE[t.status]}`}
                      >
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="font-bold">GHS {t.quote_total}</td>
                    <td className="pr-6 text-charcoal/60 text-xs">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  )
}

function EditPanel({
  userId,
  initial,
  regions,
  onDone,
}: {
  userId: number
  initial: {
    full_name: string
    email: string | null
    role: Role
    region: string | null
  }
  regions: { id: number; name: string }[]
  onDone: () => void
}) {
  const [form, setForm] = useState({
    full_name: initial.full_name || '',
    email: initial.email || '',
    role: initial.role,
    region_id:
      regions.find((r) => r.name === initial.region)?.id ?? undefined,
  })
  const [err, setErr] = useState<string | null>(null)

  // Hydrate region_id once regions load
  useEffect(() => {
    if (form.region_id === undefined && initial.region) {
      const m = regions.find((r) => r.name === initial.region)
      if (m) setForm((f) => ({ ...f, region_id: m.id }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions])

  const mut = useMutation({
    mutationFn: () =>
      updateAdminUser(userId, {
        full_name: form.full_name,
        email: form.email || null,
        role: form.role,
        region_id: form.region_id ?? null,
      }),
    onSuccess: () => onDone(),
    onError: (e: Error & { response?: { data?: { detail?: string } } }) =>
      setErr(e.response?.data?.detail || 'Save failed.'),
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setErr(null)
        mut.mutate()
      }}
      className="bg-white border border-charcoal/5 rounded-2xl shadow-sm overflow-hidden"
    >
      <div className="p-6 border-b border-charcoal/5">
        <h2 className="font-heading font-bold text-lg">Edit user</h2>
        <p className="text-xs text-charcoal/60 mt-0.5">
          Phone is the account ID and cannot be changed.
        </p>
      </div>
      <div className="p-6 grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-semibold text-charcoal/80">Full name</span>
          <input
            className="input mt-1.5"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-charcoal/80">Email</span>
          <input
            type="email"
            className="input mt-1.5"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-charcoal/80">Role</span>
          <select
            className="input mt-1.5"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            <option value="customer">Customer</option>
            <option value="driver">Driver</option>
            <option value="fleet_admin">Fleet admin</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-charcoal/80">Region</span>
          <select
            className="input mt-1.5"
            value={form.region_id ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                region_id: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          >
            <option value="">— None —</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="px-6 py-4 bg-charcoal/[0.02] border-t border-charcoal/5 flex items-center justify-between">
        <div className="text-xs text-red-700">{err}</div>
        <button
          type="submit"
          disabled={mut.isPending}
          className="bg-primary text-white px-6 py-2.5 rounded-lg font-bold hover:bg-primary/90 disabled:opacity-60 transition shadow-sm"
        >
          {mut.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

function Stat({
  label,
  value,
  icon,
  highlight,
}: {
  label: string
  value: string
  icon: string
  highlight?: boolean
}) {
  return (
    <div className="bg-white border border-charcoal/5 rounded-2xl p-5 shadow-sm">
      <div
        className={`w-10 h-10 rounded-xl ${highlight ? 'bg-primary/10 text-primary' : 'bg-charcoal/5 text-charcoal/70'} grid place-items-center text-lg`}
      >
        {icon}
      </div>
      <div className="mt-3 text-xs uppercase tracking-wider text-charcoal/60 font-semibold">
        {label}
      </div>
      <div
        className={`mt-1 font-heading text-2xl font-extrabold ${highlight ? 'text-primary' : 'text-charcoal'}`}
      >
        {value}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-charcoal/50 font-semibold">
        {label}
      </div>
      <div className="mt-0.5 text-charcoal">{children}</div>
    </div>
  )
}
