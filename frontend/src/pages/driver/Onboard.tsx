import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMyDriver,
  onboardDriver,
  uploadDriverDocument,
  type OnboardPayload,
} from '@/api/drivers'
import type { DocumentType, VehicleType } from '@/types'

const VEHICLE_TYPES: { value: VehicleType; label: string; desc: string }[] = [
  { value: 'small_tanker', label: 'Small tanker', desc: '≤ 2,000 L' },
  { value: 'medium_tanker', label: 'Medium tanker', desc: '2,000 – 5,000 L' },
  { value: 'large_tanker', label: 'Large tanker', desc: '5,000 L and above' },
]

const DOC_TYPES: { value: DocumentType; label: string; hint: string }[] = [
  { value: 'national_id', label: 'National ID', hint: 'Ghana Card — front side, clearly legible' },
  { value: 'driving_license', label: 'Driving licence', hint: 'Must be valid (not expired)' },
  { value: 'vehicle_registration', label: 'Vehicle registration', hint: 'DVLA roadworthy / registration document' },
  { value: 'epa_permit', label: 'EPA waste handling permit', hint: 'Required for liquid waste transport' },
]

const VEHICLE_REG_RE = /^[A-Z]{2}-?\d{3,4}-?\d{2}$/i
const MOMO_RE = /^0\d{9}$/

type Toast = { kind: 'success' | 'error'; msg: string } | null

const STEPS = [
  { key: 'vehicle', title: 'Vehicle', desc: 'Type & registration' },
  { key: 'pricing', title: 'Pricing & MoMo', desc: 'Fees and payouts' },
  { key: 'documents', title: 'Documents', desc: 'Upload required files' },
  { key: 'review', title: 'Review', desc: 'Confirm & submit' },
] as const

export function DriverOnboard() {
  const qc = useQueryClient()
  const driver = useQuery({ queryKey: ['driver', 'me'], queryFn: fetchMyDriver, retry: false })

  const [step, setStep] = useState(0)
  const [form, setForm] = useState<OnboardPayload>({
    vehicle_reg: '',
    vehicle_type: 'medium_tanker',
    vehicle_capacity_litres: 3000,
    license_number: '',
    base_fee: '50.00',
    momo_number: '',
    momo_provider: 'mtn',
  })
  const [toast, setToast] = useState<Toast>(null)
  const [profileSaved, setProfileSaved] = useState(false)

  const showToast = (t: NonNullable<Toast>) => {
    setToast(t)
    window.setTimeout(() => setToast(null), 3500)
  }

  const onboardMut = useMutation({
    mutationFn: () => onboardDriver(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver', 'me'] })
      setProfileSaved(true)
      showToast({ kind: 'success', msg: 'Profile saved.' })
    },
    onError: (err: unknown) =>
      showToast({ kind: 'error', msg: serverError(err, 'Failed to save profile.') }),
  })

  const uploadMut = useMutation({
    mutationFn: ({ docType, file }: { docType: DocumentType; file: File }) =>
      uploadDriverDocument(docType, file),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['driver', 'me'] })
      showToast({ kind: 'success', msg: `${labelFor(vars.docType)} uploaded.` })
    },
    onError: (err: unknown) =>
      showToast({ kind: 'error', msg: serverError(err, 'Upload failed. Try again.') }),
  })

  const existing = driver.data
  const uploadedTypes = new Set(existing?.documents.map((d) => d.doc_type))
  const docsDone = uploadedTypes.size
  const docsTotal = DOC_TYPES.length

  const errors = useMemo(() => {
    const e: Record<string, string> = {}
    if (form.vehicle_reg && !VEHICLE_REG_RE.test(form.vehicle_reg.trim()))
      e.vehicle_reg = 'Format: GR-1234-25'
    if (form.vehicle_capacity_litres < 500) e.vehicle_capacity_litres = 'Minimum 500 L'
    if (form.base_fee && Number(form.base_fee) <= 0) e.base_fee = 'Must be greater than 0'
    if (form.momo_number && !MOMO_RE.test(form.momo_number)) e.momo_number = '10 digits, e.g. 0241234567'
    return e
  }, [form])

  // Step gating
  const stepValid = (i: number): boolean => {
    if (i === 0) {
      return !!form.vehicle_reg && !errors.vehicle_reg && form.vehicle_capacity_litres >= 500 && !!form.license_number
    }
    if (i === 1) {
      return !!form.base_fee && !errors.base_fee && (!form.momo_number || !errors.momo_number)
    }
    if (i === 2) {
      return (!!existing || profileSaved) && docsDone === docsTotal
    }
    return true
  }

  const canNext = stepValid(step)
  const isLast = step === STEPS.length - 1

  const handleNext = async () => {
    // After step 1 (pricing), persist profile so docs can be uploaded
    if (step === 1 && !existing && !profileSaved && Object.keys(errors).length === 0) {
      try {
        await onboardMut.mutateAsync()
      } catch {
        return
      }
    }
    if (step === 1 && existing) {
      // Update existing profile silently before docs step (no error swallow)
      try {
        await onboardMut.mutateAsync()
      } catch {
        return
      }
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const handleSubmit = async () => {
    // On final review, ensure profile is up-to-date
    try {
      await onboardMut.mutateAsync()
      showToast({ kind: 'success', msg: 'Application submitted for review.' })
    } catch {
      /* toast already shown */
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-charcoal">Driver onboarding</h1>
          <p className="mt-2 text-charcoal/70 max-w-2xl">
            A quick four-step setup. An admin will review your application once submitted.
          </p>
        </div>
        {existing && <StatusPill status={existing.status} />}
      </div>

      {existing && (
        <div className="mt-6">
          <StatusBanner status={existing.status} reason={existing.rejection_reason} />
        </div>
      )}

      {/* Stepper */}
      <div className="mt-8">
        <Stepper current={step} onJump={(i) => i < step && setStep(i)} stepValid={stepValid} />
      </div>

      {/* Step body */}
      <section className="mt-6 card">
        {step === 0 && <VehicleStep form={form} setForm={setForm} errors={errors} />}
        {step === 1 && <PricingStep form={form} setForm={setForm} errors={errors} />}
        {step === 2 && (
          <DocumentsStep
            existing={!!existing || profileSaved}
            uploadedTypes={uploadedTypes}
            docsDone={docsDone}
            docsTotal={docsTotal}
            existingDocs={existing?.documents ?? []}
            onUpload={(docType, file) => uploadMut.mutate({ docType, file })}
            uploading={uploadMut.isPending}
            uploadingType={uploadMut.variables?.docType}
          />
        )}
        {step === 3 && (
          <ReviewStep
            form={form}
            uploadedTypes={uploadedTypes}
            existing={!!existing || profileSaved}
          />
        )}

        {/* Nav */}
        <div className="mt-8 flex items-center justify-between border-t border-charcoal/10 pt-5">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || onboardMut.isPending}
            className="px-4 py-2 rounded-md text-sm font-medium text-charcoal/70 hover:text-charcoal disabled:opacity-40"
          >
            ← Back
          </button>
          <div className="text-sm text-charcoal/50">
            Step {step + 1} of {STEPS.length}
          </div>
          {isLast ? (
            <button
              type="button"
              disabled={!canNext || onboardMut.isPending || docsDone < docsTotal}
              onClick={handleSubmit}
              className="bg-primary text-white px-6 py-2.5 rounded-md font-semibold hover:bg-primary/90 disabled:opacity-60 transition inline-flex items-center gap-2"
            >
              {onboardMut.isPending && <Spinner />}
              Submit application
            </button>
          ) : (
            <button
              type="button"
              disabled={!canNext || onboardMut.isPending}
              onClick={handleNext}
              className="bg-primary text-white px-6 py-2.5 rounded-md font-semibold hover:bg-primary/90 disabled:opacity-60 transition inline-flex items-center gap-2"
            >
              {onboardMut.isPending && <Spinner />}
              Continue →
            </button>
          )}
        </div>
      </section>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-md px-4 py-3 shadow-lg text-sm font-medium ${
            toast.kind === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
          role="status"
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

/* ---------- Stepper ---------- */

function Stepper({
  current,
  onJump,
  stepValid,
}: {
  current: number
  onJump: (i: number) => void
  stepValid: (i: number) => boolean
}) {
  return (
    <ol className="flex items-center gap-2 sm:gap-4">
      {STEPS.map((s, i) => {
        const done = i < current && stepValid(i)
        const active = i === current
        return (
          <li key={s.key} className="flex-1">
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={i >= current}
              className={`group w-full text-left rounded-lg border px-3 py-3 transition ${
                active
                  ? 'border-primary bg-primary/5'
                  : done
                    ? 'border-green-300 bg-green-50/40 hover:bg-green-50'
                    : 'border-charcoal/15 bg-white opacity-70'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    active
                      ? 'bg-primary text-white'
                      : done
                        ? 'bg-green-600 text-white'
                        : 'bg-charcoal/10 text-charcoal/60'
                  }`}
                >
                  {done ? <Check /> : i + 1}
                </span>
                <div className="min-w-0">
                  <div className={`text-sm font-semibold ${active ? 'text-primary' : 'text-charcoal'}`}>
                    {s.title}
                  </div>
                  <div className="text-xs text-charcoal/50 truncate hidden sm:block">{s.desc}</div>
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/* ---------- Steps ---------- */

function VehicleStep({
  form,
  setForm,
  errors,
}: {
  form: OnboardPayload
  setForm: (f: OnboardPayload) => void
  errors: Record<string, string>
}) {
  return (
    <div>
      <SectionHeader icon={<TruckIcon />} title="Tell us about your vehicle" subtitle="This helps us match you with the right jobs." />
      <div className="mt-6">
        <div className="text-sm font-medium text-charcoal/80">Vehicle type</div>
        <div className="mt-2 grid sm:grid-cols-3 gap-3">
          {VEHICLE_TYPES.map((v) => {
            const selected = form.vehicle_type === v.value
            return (
              <button
                type="button"
                key={v.value}
                onClick={() => setForm({ ...form, vehicle_type: v.value })}
                className={`text-left rounded-lg border px-4 py-3 transition ${
                  selected
                    ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                    : 'border-charcoal/15 hover:border-charcoal/30'
                }`}
              >
                <div className="font-semibold text-charcoal">{v.label}</div>
                <div className="text-xs text-charcoal/60 mt-0.5">{v.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <Field label="Vehicle registration" error={errors.vehicle_reg} hint="Format: GR-1234-25">
          <input
            required
            className="input"
            value={form.vehicle_reg}
            onChange={(e) => setForm({ ...form, vehicle_reg: e.target.value.toUpperCase() })}
            placeholder="GR-1234-25"
          />
        </Field>
        <Field label="Capacity (litres)" error={errors.vehicle_capacity_litres} hint="Effective tank capacity">
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
        <Field label="Driving licence number">
          <input
            required
            className="input"
            value={form.license_number}
            onChange={(e) => setForm({ ...form, license_number: e.target.value })}
          />
        </Field>
      </div>
    </div>
  )
}

function PricingStep({
  form,
  setForm,
  errors,
}: {
  form: OnboardPayload
  setForm: (f: OnboardPayload) => void
  errors: Record<string, string>
}) {
  return (
    <div>
      <SectionHeader icon={<CashIcon />} title="Pricing & payout details" subtitle="Set your show-up fee and where we send your payouts." />

      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <Field label="Show-up base fee (GHS)" error={errors.base_fee} hint="Minimum fee charged when you arrive — typical: 30–80">
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-sm text-charcoal/50">₵</span>
            <input
              required
              inputMode="decimal"
              className="input pl-7"
              value={form.base_fee}
              onChange={(e) => setForm({ ...form, base_fee: e.target.value })}
            />
          </div>
        </Field>

        <div className="hidden sm:block" />

        <Field label="MoMo number" error={errors.momo_number} hint="Where payouts are sent">
          <input
            inputMode="numeric"
            className="input"
            value={form.momo_number}
            onChange={(e) => setForm({ ...form, momo_number: e.target.value })}
            placeholder="0241234567"
          />
        </Field>
        <Field label="MoMo provider">
          <SelectInput
            value={form.momo_provider ?? 'mtn'}
            onChange={(v) => setForm({ ...form, momo_provider: v })}
          >
            <option value="mtn">MTN</option>
            <option value="vodafone">Vodafone</option>
            <option value="airteltigo">AirtelTigo</option>
          </SelectInput>
        </Field>
      </div>

      <div className="mt-5 rounded-md border border-charcoal/10 bg-charcoal/5 p-3 text-xs text-charcoal/60">
        Your show-up fee is the floor. Distance and volume are added per job using current pricing.
      </div>
    </div>
  )
}

function DocumentsStep({
  existing,
  uploadedTypes,
  docsDone,
  docsTotal,
  existingDocs,
  onUpload,
  uploading,
  uploadingType,
}: {
  existing: boolean
  uploadedTypes: Set<DocumentType>
  docsDone: number
  docsTotal: number
  existingDocs: { doc_type: DocumentType; file_url: string }[]
  onUpload: (docType: DocumentType, file: File) => void
  uploading: boolean
  uploadingType?: DocumentType
}) {
  return (
    <div>
      <SectionHeader
        icon={<DocIcon />}
        title="Upload your documents"
        subtitle="Accepted formats: PDF, JPG, PNG (max 5 MB each)."
        right={
          <span className="text-sm font-medium text-charcoal/70">
            {docsDone}/{docsTotal} uploaded
          </span>
        }
      />
      <ProgressBar pct={Math.round((docsDone / docsTotal) * 100)} />
      {!existing && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Saving your profile first… please wait.
        </div>
      )}
      <div className="mt-5 grid sm:grid-cols-2 gap-4">
        {DOC_TYPES.map((d) => (
          <DocSlot
            key={d.value}
            label={d.label}
            hint={d.hint}
            uploaded={uploadedTypes.has(d.value)}
            fileUrl={existingDocs.find((doc) => doc.doc_type === d.value)?.file_url}
            onUpload={(file) => onUpload(d.value, file)}
            disabled={!existing || uploading}
            uploading={uploading && uploadingType === d.value}
          />
        ))}
      </div>
    </div>
  )
}

function ReviewStep({
  form,
  uploadedTypes,
  existing,
}: {
  form: OnboardPayload
  uploadedTypes: Set<DocumentType>
  existing: boolean
}) {
  const allDocs = uploadedTypes.size === DOC_TYPES.length
  return (
    <div>
      <SectionHeader icon={<CheckCircleIcon />} title="Review your application" subtitle="Confirm everything looks right, then submit for review." />

      <div className="mt-6 grid md:grid-cols-2 gap-4">
        <ReviewCard title="Vehicle">
          <ReviewRow label="Type" value={VEHICLE_TYPES.find((v) => v.value === form.vehicle_type)?.label} />
          <ReviewRow label="Registration" value={form.vehicle_reg || '—'} />
          <ReviewRow label="Capacity" value={`${form.vehicle_capacity_litres} L`} />
          <ReviewRow label="Licence #" value={form.license_number || '—'} />
        </ReviewCard>

        <ReviewCard title="Pricing & MoMo">
          <ReviewRow label="Base fee" value={`₵ ${form.base_fee}`} />
          <ReviewRow label="MoMo number" value={form.momo_number || '—'} />
          <ReviewRow label="Provider" value={(form.momo_provider ?? '').toUpperCase()} />
        </ReviewCard>

        <ReviewCard title="Documents">
          <ul className="space-y-2">
            {DOC_TYPES.map((d) => (
              <li key={d.value} className="flex items-center justify-between text-sm">
                <span className="text-charcoal/80">{d.label}</span>
                {uploadedTypes.has(d.value) ? (
                  <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                    <Check /> Uploaded
                  </span>
                ) : (
                  <span className="text-red-600 text-xs font-medium">Missing</span>
                )}
              </li>
            ))}
          </ul>
        </ReviewCard>

        <ReviewCard title="What happens next">
          <ol className="space-y-2 text-sm text-charcoal/70 list-decimal pl-4">
            <li>Admin verifies your documents (usually under 24h).</li>
            <li>Approval notification by SMS/email.</li>
            <li>Go online from your dashboard to start receiving requests.</li>
          </ol>
        </ReviewCard>
      </div>

      {(!existing || !allDocs) && (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Complete previous steps before submitting.
        </div>
      )}
    </div>
  )
}

/* ---------- Shared UI ---------- */

function labelFor(t: DocumentType) {
  return DOC_TYPES.find((d) => d.value === t)?.label ?? t
}

function serverError(err: unknown, fallback: string): string {
  const resp = (err as { response?: { status?: number; data?: unknown } })?.response
  const data = resp?.data
  if (typeof data === 'string') {
    if (/<html|<!doctype/i.test(data)) {
      return resp?.status === 500
        ? 'Server error (500). Check the backend logs.'
        : `HTTP ${resp?.status ?? '?'} — ${fallback}`
    }
    return data
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (typeof obj.detail === 'string') return obj.detail
    const parts: string[] = []
    for (const [k, v] of Object.entries(obj)) {
      const flat = Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : ''
      if (flat) parts.push(k === 'non_field_errors' ? flat : `${k}: ${flat}`)
    }
    if (parts.length) return parts.join(' • ')
  }
  return fallback
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-charcoal/80">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-charcoal/50">{hint}</span>
      ) : null}
    </label>
  )
}

function SelectInput({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <select
        className="input appearance-none pr-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-charcoal/50"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  )
}

function SectionHeader({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-bold leading-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-charcoal/60">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="mt-3 h-2 w-full rounded-full bg-charcoal/10 overflow-hidden">
      <div
        className="h-full bg-primary transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

function StatusBanner({ status, reason }: { status: string; reason?: string }) {
  const cfg: Record<string, { bg: string; text: string; title: string; body: string }> = {
    pending: {
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-800',
      title: 'Application under review',
      body: "Your profile and documents are being reviewed. You'll be notified once approved.",
    },
    approved: {
      bg: 'bg-green-50 border-green-200',
      text: 'text-green-800',
      title: "You're approved!",
      body: 'Go online from the dashboard to start receiving requests.',
    },
    rejected: {
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-800',
      title: 'Application needs attention',
      body: reason || 'Please update the flagged information and resubmit.',
    },
    suspended: {
      bg: 'bg-gray-50 border-gray-200',
      text: 'text-gray-800',
      title: 'Account suspended',
      body: reason || 'Contact support to resolve this.',
    },
  }
  const c = cfg[status] ?? cfg.pending
  return (
    <div className={`rounded-lg border ${c.bg} px-4 py-3 ${c.text}`}>
      <div className="font-semibold">{c.title}</div>
      <div className="mt-0.5 text-sm opacity-90">{c.body}</div>
    </div>
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
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
        map[status] ?? 'bg-gray-100'
      }`}
    >
      {status}
    </span>
  )
}

function ReviewCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-charcoal/10 bg-white p-4">
      <div className="text-xs uppercase tracking-wider text-charcoal/50 font-semibold">{title}</div>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-charcoal/60">{label}</span>
      <span className="font-medium text-charcoal text-right">{value ?? '—'}</span>
    </div>
  )
}

function DocSlot({
  label,
  hint,
  uploaded,
  fileUrl,
  onUpload,
  disabled,
  uploading,
}: {
  label: string
  hint?: string
  uploaded: boolean
  fileUrl?: string
  onUpload: (file: File) => void
  disabled: boolean
  uploading: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isImage = !!fileUrl && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(fileUrl)

  const handleFile = (file: File) => {
    setError(null)
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large (max 5 MB)')
      return
    }
    if (!/^(image\/|application\/pdf)/.test(file.type)) {
      setError('Only PDF, JPG, or PNG allowed')
      return
    }
    onUpload(file)
  }

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-4 bg-white transition ${
        disabled
          ? 'border-charcoal/10 opacity-60'
          : dragging
            ? 'border-primary bg-primary/5'
            : uploaded
              ? 'border-green-300'
              : 'border-charcoal/20 hover:border-charcoal/40'
      }`}
      onDragOver={(e) => {
        if (disabled) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (disabled) return
        const f = e.dataTransfer.files?.[0]
        if (f) handleFile(f)
      }}
    >
      <div className="flex justify-between items-start gap-3">
        <div>
          <div className="font-medium text-sm text-charcoal">{label}</div>
          {hint && <div className="mt-0.5 text-xs text-charcoal/50">{hint}</div>}
        </div>
        {uploaded ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
            <Check /> Uploaded
          </span>
        ) : (
          <span className="text-xs text-charcoal/40">Not uploaded</span>
        )}
      </div>

      {uploaded && fileUrl && (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-charcoal/10 bg-charcoal/5 p-2">
          {isImage ? (
            <img
              src={fileUrl}
              alt={label}
              className="h-12 w-12 rounded object-cover border border-charcoal/10"
            />
          ) : (
            <div className="h-12 w-12 rounded bg-white border border-charcoal/10 flex items-center justify-center text-charcoal/60">
              <DocIcon />
            </div>
          )}
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary hover:underline truncate"
          >
            View uploaded file
          </a>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
        className="hidden"
      />
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-md border border-charcoal/15 bg-white px-3 py-2 text-sm font-medium text-charcoal hover:bg-charcoal/5 disabled:opacity-60 transition"
      >
        {uploading ? (
          <>
            <Spinner /> Uploading…
          </>
        ) : (
          <>
            <UploadIcon />
            {uploaded ? 'Replace file' : 'Choose or drop file'}
          </>
        )}
      </button>

      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  )
}

/* ---------- icons ---------- */

function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h11v8H3zM14 10h4l3 3v2h-7zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
    </svg>
  )
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6M8 13h8M8 17h5" />
    </svg>
  )
}

function CashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18v10H3zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM6 9h.01M18 15h.01" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 9l5-5 5 5M12 4v12" />
    </svg>
  )
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}
