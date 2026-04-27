import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMyDriver,
  onboardDriver,
  uploadDriverDocument,
  type OnboardPayload,
} from '@/api/drivers'
import type { DocumentType, VehicleType } from '@/types'

const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: 'small_tanker', label: 'Small tanker (≤ 2,000L)' },
  { value: 'medium_tanker', label: 'Medium tanker (2,000–5,000L)' },
  { value: 'large_tanker', label: 'Large tanker (5,000L+)' },
]

const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'national_id', label: 'National ID' },
  { value: 'driving_license', label: 'Driving licence' },
  { value: 'vehicle_registration', label: 'Vehicle registration' },
  { value: 'epa_permit', label: 'EPA waste handling permit' },
]

export function DriverOnboard() {
  const qc = useQueryClient()
  const driver = useQuery({ queryKey: ['driver', 'me'], queryFn: fetchMyDriver, retry: false })

  const [form, setForm] = useState<OnboardPayload>({
    vehicle_reg: '',
    vehicle_type: 'medium_tanker',
    vehicle_capacity_litres: 3000,
    license_number: '',
    base_fee: '50.00',
    momo_number: '',
    momo_provider: 'mtn',
  })

  const onboardMut = useMutation({
    mutationFn: () => onboardDriver(form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver', 'me'] }),
  })

  const uploadMut = useMutation({
    mutationFn: ({ docType, file }: { docType: DocumentType; file: File }) =>
      uploadDriverDocument(docType, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver', 'me'] }),
  })

  const existing = driver.data
  const uploadedTypes = new Set(existing?.documents.map((d) => d.doc_type))

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-extrabold text-charcoal">Driver onboarding</h1>
      <p className="mt-2 text-charcoal/70">
        Complete your profile and upload required documents. An admin will review and
        approve your account.
      </p>

      {existing && (
        <div className="mt-6 card">
          <div className="text-xs uppercase tracking-wider text-charcoal/50">
            Application status
          </div>
          <div className="mt-1 flex items-center gap-3">
            <StatusPill status={existing.status} />
            {existing.rejection_reason && (
              <span className="text-sm text-red-600">{existing.rejection_reason}</span>
            )}
          </div>
        </div>
      )}

      <section className="mt-8 card">
        <h2 className="text-xl font-bold">Vehicle & pricing</h2>
        <form
          className="mt-4 grid sm:grid-cols-2 gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            onboardMut.mutate()
          }}
        >
          <Field label="Vehicle registration">
            <input
              required
              className="input"
              value={form.vehicle_reg}
              onChange={(e) => setForm({ ...form, vehicle_reg: e.target.value })}
              placeholder="GR-1234-25"
            />
          </Field>
          <Field label="Vehicle type">
            <select
              className="input"
              value={form.vehicle_type}
              onChange={(e) =>
                setForm({ ...form, vehicle_type: e.target.value as VehicleType })
              }
            >
              {VEHICLE_TYPES.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Capacity (litres)">
            <input
              type="number"
              required
              min={500}
              className="input"
              value={form.vehicle_capacity_litres}
              onChange={(e) =>
                setForm({ ...form, vehicle_capacity_litres: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Driving license number">
            <input
              required
              className="input"
              value={form.license_number}
              onChange={(e) => setForm({ ...form, license_number: e.target.value })}
            />
          </Field>
          <Field label="Show-up base fee (GHS)">
            <input
              required
              className="input"
              value={form.base_fee}
              onChange={(e) => setForm({ ...form, base_fee: e.target.value })}
            />
          </Field>
          <Field label="MoMo number">
            <input
              className="input"
              value={form.momo_number}
              onChange={(e) => setForm({ ...form, momo_number: e.target.value })}
              placeholder="0241234567"
            />
          </Field>
          <Field label="MoMo provider">
            <select
              className="input"
              value={form.momo_provider}
              onChange={(e) => setForm({ ...form, momo_provider: e.target.value })}
            >
              <option value="mtn">MTN</option>
              <option value="vodafone">Vodafone</option>
              <option value="airteltigo">AirtelTigo</option>
            </select>
          </Field>
          <div className="sm:col-span-2 flex items-center gap-4">
            <button
              type="submit"
              disabled={onboardMut.isPending}
              className="bg-primary text-white px-6 py-2.5 rounded-md font-semibold hover:bg-primary/90 disabled:opacity-60 transition"
            >
              {onboardMut.isPending ? 'Saving…' : existing ? 'Update profile' : 'Save profile'}
            </button>
            {onboardMut.isSuccess && (
              <span className="text-sm text-green-700">Saved.</span>
            )}
          </div>
        </form>
      </section>

      <section className="mt-8 card">
        <h2 className="text-xl font-bold">Documents</h2>
        <p className="text-sm text-charcoal/60 mt-1">
          Upload each required document. Accepted: PDF, JPG, PNG.
        </p>
        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          {DOC_TYPES.map((d) => (
            <DocSlot
              key={d.value}
              label={d.label}
              uploaded={uploadedTypes.has(d.value)}
              fileUrl={existing?.documents.find((doc) => doc.doc_type === d.value)?.file_url}
              onUpload={(file) =>
                uploadMut.mutate({ docType: d.value, file })
              }
              disabled={!existing || uploadMut.isPending}
            />
          ))}
        </div>
        {!existing && (
          <p className="mt-3 text-sm text-amber-700">
            Save your profile first to enable document uploads.
          </p>
        )}
      </section>
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

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    suspended: 'bg-gray-200 text-gray-800',
  }
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${map[status] ?? 'bg-gray-100'}`}>
      {status}
    </span>
  )
}

function DocSlot({
  label,
  uploaded,
  fileUrl,
  onUpload,
  disabled,
}: {
  label: string
  uploaded: boolean
  fileUrl?: string
  onUpload: (file: File) => void
  disabled: boolean
}) {
  return (
    <div className="border border-dashed border-charcoal/20 rounded-lg p-4 bg-white">
      <div className="flex justify-between items-center">
        <span className="font-medium text-sm">{label}</span>
        {uploaded ? (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline"
          >
            View
          </a>
        ) : (
          <span className="text-xs text-charcoal/40">Not uploaded</span>
        )}
      </div>
      <input
        type="file"
        accept="image/*,application/pdf"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onUpload(f)
        }}
        className="mt-3 block w-full text-sm"
      />
    </div>
  )
}
