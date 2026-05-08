import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchRegions, requestOtp, verifyOtp } from '@/api/auth'
import { useAuth } from '@/store/auth'
import type { Role } from '@/types'

const ROLE_OPTIONS: { value: Role; label: string; desc: string; icon: string }[] = [
  { value: 'customer', label: 'Customer', desc: 'I need waste removal', icon: '🏠' },
  { value: 'driver', label: 'Driver', desc: 'I drive a tanker', icon: '🚛' },
  { value: 'fleet_admin', label: 'Fleet', desc: 'I manage drivers', icon: '🏢' },
]

function rolePath(role: Role): string {
  if (role === 'fleet_admin') return '/fleet'
  if (role === 'admin') return '/admin'
  return `/${role}`
}

function normalizeGhPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('233')) digits = digits.slice(3)
  else if (digits.startsWith('0')) digits = digits.slice(1)
  return '+233' + digits.slice(0, 9)
}

function isValidGhPhone(value: string): boolean {
  return /^\+233\d{9}$/.test(value)
}

interface OtpAuthFormProps {
  mode: 'login' | 'signup'
}

export function OtpAuthForm({ mode }: OtpAuthFormProps) {
  const navigate = useNavigate()
  const setSession = useAuth((s) => s.setSession)

  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('+233')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [role, setRole] = useState<Role>('customer')
  const [fullName, setFullName] = useState('')
  const [regionId, setRegionId] = useState<number | undefined>(undefined)
  const [channel, setChannel] = useState<'sms' | 'email'>('sms')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const codeRefs = useRef<(HTMLInputElement | null)[]>([])
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendNote, setResendNote] = useState<string | null>(null)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [resendCooldown])

  const regions = useQuery({ queryKey: ['regions'], queryFn: fetchRegions })

  const requestMut = useMutation({
    mutationFn: () => requestOtp(phone, mode, channel, email),
    onSuccess: () => {
      setStep('code')
      setError(null)
      setResendCooldown(60)
      setTimeout(() => codeRefs.current[0]?.focus(), 50)
    },
    onError: (
      err: Error & {
        response?: { data?: { detail?: string; phone?: string[] }; headers?: Record<string, string> }
      },
    ) => {
      const wait = parseRetryAfter(err)
      if (wait) setResendCooldown(wait)
      setError(
        err.response?.data?.detail ||
          err.response?.data?.phone?.[0] ||
          'Could not send code. Check the phone number.',
      )
    },
  })

  const resendMut = useMutation({
    mutationFn: () => requestOtp(phone, mode, channel, email),
    onSuccess: () => {
      setError(null)
      setResendNote(
        channel === 'email'
          ? 'New code sent. Check your inbox.'
          : 'New code sent. Check your messages.',
      )
      setResendCooldown(60)
      setTimeout(() => setResendNote(null), 4000)
    },
    onError: (
      err: Error & { response?: { data?: { detail?: string }; headers?: Record<string, string> } },
    ) => {
      const wait = parseRetryAfter(err)
      if (wait) setResendCooldown(wait)
      setError(err.response?.data?.detail || 'Could not resend code.')
    },
  })

  const verifyMut = useMutation({
    mutationFn: () =>
      verifyOtp({
        phone,
        code: code.join(''),
        role,
        full_name: fullName,
        region_id: regionId,
      }),
    onSuccess: (data) => {
      setSession(data.user, data.tokens)
      navigate(rolePath(data.user.role), { replace: true })
    },
    onError: (err: Error & { response?: { data?: { detail?: string; code?: string[] } } }) => {
      setError(
        err.response?.data?.detail ||
          err.response?.data?.code?.[0] ||
          'Verification failed.',
      )
    },
  })

  function setCodeAt(idx: number, val: string) {
    const cleaned = val.replace(/\D/g, '').slice(0, 1)
    const next = [...code]
    next[idx] = cleaned
    setCode(next)
    if (cleaned && idx < 5) codeRefs.current[idx + 1]?.focus()
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    e.preventDefault()
    const next = ['', '', '', '', '', '']
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setCode(next)
    codeRefs.current[Math.min(text.length, 5)]?.focus()
  }

  const codeComplete = code.every((c) => c !== '')

  return (
    <div>
      {error && (
        <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === 'phone' && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!isValidGhPhone(phone)) {
              setError('Enter a valid Ghana phone number — 9 digits after +233.')
              return
            }
            if (channel === 'email' && !email) {
              setError('Enter an email address.')
              return
            }
            setError(null)
            requestMut.mutate()
          }}
        >
          {mode === 'signup' && (
            <Field label="I am a…">
              <div className="grid grid-cols-3 gap-2">
                {ROLE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setRole(o.value)}
                    className={`p-3 rounded-lg border-2 text-left transition ${
                      role === o.value
                        ? 'border-primary bg-primary/5'
                        : 'border-charcoal/10 hover:border-charcoal/30'
                    }`}
                  >
                    <div className="text-xl">{o.icon}</div>
                    <div className="mt-1 font-semibold text-sm">{o.label}</div>
                    <div className="text-[10px] text-charcoal/60 leading-tight">{o.desc}</div>
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Phone number">
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(normalizeGhPhone(e.target.value))}
              placeholder="+233 24 123 4567"
              className="input text-lg"
              autoFocus
            />
            <p className="mt-1 text-xs text-charcoal/50">
              9 digits after +233 (e.g. 0557782728 → +233557782728).
            </p>
          </Field>

          <Field label="Send code via">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setChannel('sms')}
                className={`p-3 rounded-lg border-2 text-left transition ${
                  channel === 'sms'
                    ? 'border-primary bg-primary/5'
                    : 'border-charcoal/10 hover:border-charcoal/30'
                }`}
              >
                <div className="text-xl">📱</div>
                <div className="mt-1 font-semibold text-sm">SMS</div>
                <div className="text-[10px] text-charcoal/60 leading-tight">to your phone</div>
              </button>
              <button
                type="button"
                onClick={() => setChannel('email')}
                className={`p-3 rounded-lg border-2 text-left transition ${
                  channel === 'email'
                    ? 'border-primary bg-primary/5'
                    : 'border-charcoal/10 hover:border-charcoal/30'
                }`}
              >
                <div className="text-xl">✉️</div>
                <div className="mt-1 font-semibold text-sm">Email</div>
                <div className="text-[10px] text-charcoal/60 leading-tight">to your inbox</div>
              </button>
            </div>
          </Field>

          {channel === 'email' && (
            <Field label="Email address">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
              />
            </Field>
          )}

          {mode === 'signup' && (
            <>
              <Field label="Full name">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Kofi Mensah"
                  className="input"
                />
              </Field>
              <Field label="Town / City">
                <select
                  value={regionId ?? ''}
                  onChange={(e) =>
                    setRegionId(e.target.value ? Number(e.target.value) : undefined)
                  }
                  className="input"
                >
                  <option value="">Select your town / city</option>
                  {regions.data?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          <button
            type="submit"
            disabled={requestMut.isPending || !isValidGhPhone(phone)}
            className="w-full bg-primary text-white font-bold py-3.5 rounded-lg hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm"
          >
            {requestMut.isPending ? 'Sending code…' : 'Send code →'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            verifyMut.mutate()
          }}
        >
          <div className="text-sm text-charcoal/70">
            Code sent to{' '}
            <span className="font-semibold text-charcoal">
              {channel === 'email' ? email : phone}
            </span>
          </div>
          {resendNote && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
              {resendNote}
            </div>
          )}
          <div className="flex gap-2 justify-between">
            {code.map((c, i) => (
              <input
                key={i}
                ref={(el) => {
                  codeRefs.current[i] = el
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={c}
                onChange={(e) => setCodeAt(i, e.target.value)}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !c && i > 0) {
                    codeRefs.current[i - 1]?.focus()
                  }
                }}
                className="w-12 h-14 md:w-14 md:h-16 text-center text-2xl font-bold border-2 border-charcoal/15 rounded-lg focus:border-primary focus:outline-none transition"
              />
            ))}
          </div>
          <button
            type="submit"
            disabled={verifyMut.isPending || !codeComplete}
            className="w-full bg-accent text-charcoal font-bold py-3.5 rounded-lg hover:brightness-110 disabled:opacity-60 transition shadow-sm"
          >
            {verifyMut.isPending ? 'Verifying…' : 'Verify & continue'}
          </button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep('phone')
                setCode(['', '', '', '', '', ''])
                setError(null)
                setResendNote(null)
              }}
              className="text-charcoal/60 hover:text-charcoal transition"
            >
              ← Different number
            </button>
            <button
              type="button"
              disabled={resendCooldown > 0 || resendMut.isPending}
              onClick={() => resendMut.mutate()}
              className="text-primary font-semibold hover:underline disabled:text-charcoal/40 disabled:no-underline disabled:cursor-not-allowed transition"
            >
              {resendMut.isPending
                ? 'Resending…'
                : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : 'Resend code'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function parseRetryAfter(err: unknown): number {
  const e = err as { response?: { headers?: Record<string, string>; data?: { detail?: string } } }
  const header = e.response?.headers?.['retry-after']
  if (header) {
    const n = Number(header)
    if (Number.isFinite(n) && n > 0) return Math.ceil(n)
  }
  // DRF Throttled detail string contains the wait seconds.
  const detail = e.response?.data?.detail
  if (typeof detail === 'string') {
    const m = detail.match(/(\d+)\s*s/i)
    if (m) return Number(m[1])
  }
  return 0
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-charcoal/80">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}
