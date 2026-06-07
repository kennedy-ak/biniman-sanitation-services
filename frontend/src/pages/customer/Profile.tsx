import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchRegions, requestEmailOtp, updateProfile, verifyEmailOtp } from '@/api/auth'
import { fetchMyRequests } from '@/api/requests'
import { useAuth } from '@/store/auth'
import { PasswordSecurityCard } from '@/components/auth/PasswordSecurityCard'

function initials(name: string, fallback: string) {
  const src = name || fallback
  return src.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

export function CustomerProfile() {
  const qc = useQueryClient()
  const user = useAuth((s) => s.user)
  const setUser = useAuth((s) => s.setUser)
  const regions = useQuery({ queryKey: ['regions'], queryFn: fetchRegions })
  const requests = useQuery({ queryKey: ['requests', 'mine'], queryFn: fetchMyRequests })

  const [form, setForm] = useState({
    full_name: user?.full_name ?? '',
    region_id: user?.region?.id,
  })
  const [dirty, setDirty] = useState(false)

  const mut = useMutation({
    mutationFn: () => updateProfile(form),
    onSuccess: (data) => {
      setUser(data)
      qc.invalidateQueries({ queryKey: ['me'] })
      setDirty(false)
    },
  })

  const reqs = requests.data ?? []
  const completed = reqs.filter((r) => r.status === 'completed').length
  const totalSpent = reqs
    .filter((r) => r.status === 'completed')
    .reduce((s, r) => s + Number(r.quote_total), 0)

  const avatarText = initials(user?.full_name ?? '', user?.phone ?? 'U')

  return (
    <div className="space-y-5 pb-12">

      {/* ── Hero strip ── */}
      <div className="bg-primary rounded-2xl overflow-hidden relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 140% at 110% 50%, rgba(93,212,160,0.09) 0%, transparent 55%)' }}
        />
        <div className="relative flex items-center gap-5 px-7 py-6">
          <div className="w-14 h-14 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center font-heading font-bold text-xl text-accent flex-shrink-0">
            {avatarText}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] uppercase tracking-[2.5px] text-accent mb-1">Customer</p>
            <h1 className="font-heading text-2xl text-white leading-tight">
              {user?.full_name || 'Welcome'}
            </h1>
            <div className="flex flex-wrap items-center gap-4 mt-1.5">
              <span className="flex items-center gap-1.5 text-xs text-white/50">
                📞 {user?.phone}
              </span>
              {user?.email && (
                <>
                  <span className="w-px h-3.5 bg-white/15" />
                  <span className="flex items-center gap-1.5 text-xs text-white/50">
                    ✉️ {user.email}
                  </span>
                </>
              )}
              {user?.region && (
                <>
                  <span className="w-px h-3.5 bg-white/15" />
                  <span className="flex items-center gap-1.5 text-xs text-white/50">
                    📍 {user.region.name}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: '🗂', label: 'Total trips', value: String(reqs.length), accent: false },
          { icon: '✅', label: 'Completed', value: String(completed), accent: false },
          {
            icon: '💰',
            label: 'Total spent',
            value: null,
            ghs: totalSpent.toFixed(2),
            accent: true,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white border border-charcoal/8 rounded-xl px-5 py-4 flex items-center gap-4"
          >
            <span className="text-xl flex-shrink-0">{s.icon}</span>
            <div>
              <p className="text-[10px] uppercase tracking-[1.8px] text-charcoal/45 font-medium mb-0.5">
                {s.label}
              </p>
              {s.ghs != null ? (
                <p className={`font-heading text-[22px] leading-none ${s.accent ? 'text-primary' : 'text-charcoal'}`}>
                  <span className="font-sans text-xs font-normal text-charcoal/45 mr-0.5">GHS</span>
                  {s.ghs}
                </p>
              ) : (
                <p className={`font-heading text-[22px] leading-none ${s.accent ? 'text-primary' : 'text-charcoal'}`}>
                  {s.value}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Two-column grid ── */}
      <div className="grid lg:grid-cols-2 gap-4 items-start">

        {/* Left: email + password */}
        <div className="space-y-4">
          <EmailVerificationCard />
          <PasswordSecurityCard />
        </div>

        {/* Right: edit profile */}
        <div>
          <form
            className="bg-white border border-charcoal/8 rounded-2xl overflow-hidden shadow-sm"
            onSubmit={(e) => {
              e.preventDefault()
              mut.mutate()
            }}
          >
            <div className="px-5 py-4 border-b border-charcoal/6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-charcoal">Edit profile</h2>
                <p className="text-xs text-charcoal/45 mt-0.5">Name, email and region</p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">
              <FormField label="Phone" note="Cannot be changed">
                <input
                  className="input bg-charcoal/5 text-charcoal/50 cursor-not-allowed"
                  value={user?.phone ?? ''}
                  disabled
                />
              </FormField>
              <FormField label="Full name">
                <input
                  required
                  className="input"
                  value={form.full_name}
                  onChange={(e) => { setForm({ ...form, full_name: e.target.value }); setDirty(true) }}
                />
              </FormField>
              <FormField label="Region">
                <select
                  className="input"
                  value={form.region_id ?? ''}
                  onChange={(e) => {
                    setForm({ ...form, region_id: e.target.value ? Number(e.target.value) : undefined })
                    setDirty(true)
                  }}
                >
                  <option value="">Select region</option>
                  {regions.data?.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="px-5 py-3.5 border-t border-charcoal/6 bg-charcoal/[0.015] flex items-center justify-between gap-3">
              <div className="text-xs">
                {mut.isSuccess && <span className="text-green-700 font-semibold">✓ Saved.</span>}
                {mut.isError && <span className="text-red-700">Save failed.</span>}
              </div>
              <div className="flex gap-2">
                {dirty && (
                  <button
                    type="button"
                    onClick={() => {
                      setForm({ full_name: user?.full_name ?? '', region_id: user?.region?.id })
                      setDirty(false)
                    }}
                    className="px-4 py-2 rounded-lg border border-charcoal/15 bg-white text-sm font-medium text-charcoal hover:bg-charcoal/5 transition"
                  >
                    Discard
                  </button>
                )}
                <button
                  type="submit"
                  disabled={mut.isPending}
                  className="bg-primary text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition"
                >
                  {mut.isPending ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Email verification card ───────────────────────────────────────────────────

function EmailVerificationCard() {
  const qc = useQueryClient()
  const user = useAuth((s) => s.user)
  const setUser = useAuth((s) => s.setUser)
  const isVerified = !!user?.email && !!user?.is_email_verified
  const [mode, setMode] = useState<'view' | 'edit' | 'awaiting_code'>(
    isVerified ? 'view' : 'edit',
  )
  const [email, setEmail] = useState(isVerified ? '' : (user?.email ?? ''))
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const requestMut = useMutation({
    mutationFn: () => requestEmailOtp(email.trim().toLowerCase()),
    onSuccess: () => {
      setMode('awaiting_code')
      setError(null)
      setInfo(`Code sent to ${email.trim().toLowerCase()}. Expires in 10 minutes.`)
    },
    onError: (e: unknown) => {
      const data = (e as { response?: { data?: { email?: string[]; detail?: string } } })?.response?.data
      setError(data?.email?.[0] || data?.detail || 'Failed to send code.')
    },
  })

  const verifyMut = useMutation({
    mutationFn: () => verifyEmailOtp(email.trim().toLowerCase(), code),
    onSuccess: (updated) => {
      setUser(updated)
      qc.invalidateQueries({ queryKey: ['me'] })
      setMode('view')
      setCode('')
      setEmail('')
      setError(null)
      setInfo('Email verified.')
    },
    onError: (e: unknown) => {
      const data = (e as { response?: { data?: { code?: string[]; email?: string[]; detail?: string } } })?.response?.data
      setError(
        data?.code?.[0] ||
          data?.email?.[0] ||
          data?.detail ||
          'Verification failed.',
      )
    },
  })

  return (
    <div className="bg-white border border-charcoal/8 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-charcoal/6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-charcoal">Email address</h2>
          <p className="text-xs text-charcoal/45 mt-0.5">Backup OTP &amp; receipts</p>
        </div>
        {isVerified ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1 flex-shrink-0">
            ✓ Verified
          </span>
        ) : user?.email ? (
          <span className="inline-flex text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 flex-shrink-0">
            Unverified
          </span>
        ) : (
          <span className="inline-flex text-[11px] font-medium text-charcoal/50 bg-charcoal/5 border border-charcoal/10 rounded-full px-2.5 py-1 flex-shrink-0">
            Not set
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        {mode === 'view' && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-charcoal">{user?.email}</span>
            <button
              type="button"
              onClick={() => { setMode('edit'); setEmail(''); setCode(''); setError(null); setInfo(null) }}
              className="text-sm text-primary font-semibold hover:underline"
            >
              Change
            </button>
          </div>
        )}

        {mode !== 'view' && (
          <>
            <FormField label="Email">
              <input
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={mode === 'awaiting_code' || requestMut.isPending}
              />
            </FormField>

            {mode === 'awaiting_code' && (
              <FormField label="6-digit code">
                <input
                  inputMode="numeric"
                  maxLength={6}
                  className="input tracking-[0.4em] font-semibold text-center text-lg"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
              </FormField>
            )}
          </>
        )}

        {info && <p className="text-xs text-green-700 font-medium">{info}</p>}
        {error && <p className="text-xs text-red-700 font-medium">{error}</p>}
      </div>

      {/* Footer actions */}
      {mode !== 'view' && (
        <div className="px-5 py-3.5 border-t border-charcoal/6 bg-charcoal/[0.015] flex items-center justify-between gap-2">
          {mode === 'awaiting_code' ? (
            <>
              <div className="flex gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => requestMut.mutate()}
                  disabled={requestMut.isPending}
                  className="text-charcoal/60 hover:text-charcoal underline text-sm"
                >
                  Resend
                </button>
                <span className="text-charcoal/25">·</span>
                <button
                  type="button"
                  onClick={() => { setMode('edit'); setCode(''); setError(null) }}
                  className="text-charcoal/50 hover:text-charcoal text-sm"
                >
                  Use different email
                </button>
              </div>
              <button
                type="button"
                disabled={code.length !== 6 || verifyMut.isPending}
                onClick={() => verifyMut.mutate()}
                className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition"
              >
                {verifyMut.isPending ? 'Verifying…' : 'Verify email'}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!email || requestMut.isPending}
              onClick={() => requestMut.mutate()}
              className="ml-auto bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition"
            >
              {requestMut.isPending ? 'Sending…' : 'Send verification code'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Shared field ──────────────────────────────────────────────────────────────

function FormField({
  label,
  note,
  children,
}: {
  label: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-[1.2px] text-charcoal/50 font-medium">{label}</span>
        {note && <span className="text-[10px] text-charcoal/35">{note}</span>}
      </div>
      {children}
    </label>
  )
}
