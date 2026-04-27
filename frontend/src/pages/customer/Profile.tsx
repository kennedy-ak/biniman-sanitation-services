import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchRegions, updateProfile } from '@/api/auth'
import { fetchMyRequests } from '@/api/requests'
import { useAuth } from '@/store/auth'

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

export function CustomerProfile() {
  const qc = useQueryClient()
  const user = useAuth((s) => s.user)
  const setUser = useAuth((s) => s.setUser)
  const regions = useQuery({ queryKey: ['regions'], queryFn: fetchRegions })
  const requests = useQuery({ queryKey: ['requests', 'mine'], queryFn: fetchMyRequests })

  const [form, setForm] = useState({
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
    region_id: user?.region?.id,
  })

  const mut = useMutation({
    mutationFn: () => updateProfile(form),
    onSuccess: (data) => {
      setUser(data)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })

  const reqs = requests.data ?? []
  const completed = reqs.filter((r) => r.status === 'completed').length
  const totalSpent = reqs
    .filter((r) => r.status === 'completed')
    .reduce((s, r) => s + Number(r.quote_total), 0)

  return (
    <div className="space-y-6">
      {/* Profile hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary to-[#084d29] text-white rounded-2xl p-6 md:p-8 shadow-lg">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start gap-5">
          <div className="w-20 h-20 rounded-2xl bg-white/15 backdrop-blur grid place-items-center font-heading font-extrabold text-2xl border border-white/20 flex-shrink-0">
            {initials(user?.full_name ?? '', user?.phone ?? 'U')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest text-accent font-bold">
              Customer
            </div>
            <h1 className="mt-1 font-heading text-3xl md:text-4xl font-extrabold">
              {user?.full_name || 'Welcome'}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/85">
              <span>📞 {user?.phone}</span>
              {user?.email && <span>✉️ {user.email}</span>}
              {user?.region && <span>📍 {user.region.name}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Stat label="Total trips" value={String(reqs.length)} icon="📋" />
        <Stat label="Completed" value={String(completed)} icon="✓" />
        <Stat
          label="Total spent"
          value={`GHS ${totalSpent.toFixed(2)}`}
          icon="💰"
          highlight
        />
      </div>

      {/* Edit form */}
      <form
        className="bg-white border border-charcoal/5 rounded-2xl shadow-sm overflow-hidden"
        onSubmit={(e) => {
          e.preventDefault()
          mut.mutate()
        }}
      >
        <div className="p-6 border-b border-charcoal/5">
          <h2 className="font-heading font-bold text-lg">Edit profile</h2>
          <p className="text-xs text-charcoal/60 mt-0.5">
            Update your name, email, and region. Your phone is your account ID and
            cannot be changed.
          </p>
        </div>

        <div className="p-6 grid sm:grid-cols-2 gap-4">
          <Field label="Phone" hint="Cannot be changed" full>
            <input className="input bg-charcoal/5" value={user?.phone ?? ''} disabled />
          </Field>
          <Field label="Full name">
            <input
              required
              className="input"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </Field>
          <Field label="Email" hint="Optional">
            <input
              type="email"
              className="input"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Region" full>
            <select
              className="input"
              value={form.region_id ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  region_id: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            >
              <option value="">Select region</option>
              {regions.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="px-6 py-4 bg-charcoal/[0.02] border-t border-charcoal/5 flex items-center justify-between">
          <div className="text-xs">
            {mut.isSuccess && (
              <span className="text-green-700 font-semibold">✓ Saved.</span>
            )}
            {mut.isError && <span className="text-red-700">Save failed.</span>}
          </div>
          <button
            type="submit"
            disabled={mut.isPending}
            className="bg-primary text-white px-6 py-2.5 rounded-lg font-bold hover:bg-primary/90 disabled:opacity-60 transition shadow-sm"
          >
            {mut.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
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
        className={`w-10 h-10 rounded-xl ${highlight ? 'bg-accent/15 text-amber-700' : 'bg-charcoal/5 text-charcoal/70'} grid place-items-center text-lg`}
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

function Field({
  label,
  hint,
  children,
  full,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-charcoal/80">{label}</span>
        {hint && <span className="text-[10px] uppercase text-charcoal/50">{hint}</span>}
      </div>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}
