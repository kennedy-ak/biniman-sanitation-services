import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchRegions } from '@/api/auth'
import { fetchMyFleet, signupFleet } from '@/api/fleets'

export function FleetSignup() {
  const qc = useQueryClient()
  const fleet = useQuery({ queryKey: ['fleet', 'me'], queryFn: fetchMyFleet, retry: false })
  const regions = useQuery({ queryKey: ['regions'], queryFn: fetchRegions })

  const [form, setForm] = useState({
    name: '',
    registration_number: '',
    contact_email: '',
    contact_phone: '',
    region_id: 0,
  })

  const mut = useMutation({
    mutationFn: () => signupFleet(form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet', 'me'] }),
  })

  if (fleet.data) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-3xl font-extrabold">Fleet company</h1>
        <div className="mt-6 card">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold">{fleet.data.name}</h2>
              <p className="text-sm text-charcoal/60">
                Reg. {fleet.data.registration_number}
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold uppercase bg-amber-100 text-amber-800">
              {fleet.data.status}
            </span>
          </div>
          {fleet.data.rejection_reason && (
            <p className="mt-3 text-sm text-red-600">{fleet.data.rejection_reason}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-extrabold">Register your fleet</h1>
      <p className="mt-2 text-charcoal/70">
        We'll review your business and approve your account so you can add drivers.
      </p>

      <form
        className="mt-6 card grid sm:grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          mut.mutate()
        }}
      >
        <Field label="Company name">
          <input
            required
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Registration number">
          <input
            required
            className="input"
            value={form.registration_number}
            onChange={(e) => setForm({ ...form, registration_number: e.target.value })}
          />
        </Field>
        <Field label="Contact email">
          <input
            type="email"
            className="input"
            value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
          />
        </Field>
        <Field label="Contact phone">
          <input
            className="input"
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
          />
        </Field>
        <Field label="Operating region">
          <select
            required
            className="input"
            value={form.region_id || ''}
            onChange={(e) => setForm({ ...form, region_id: Number(e.target.value) })}
          >
            <option value="">Select region</option>
            {regions.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={mut.isPending || !form.region_id}
            className="bg-primary text-white px-6 py-2.5 rounded-md font-semibold hover:bg-primary/90 disabled:opacity-60 transition"
          >
            {mut.isPending ? 'Submitting…' : 'Submit for review'}
          </button>
          {mut.isError && (
            <p className="mt-2 text-sm text-red-600">Could not submit. Try again.</p>
          )}
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-charcoal/80">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
