import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { passwordLogin } from '@/api/auth'
import { useAuth } from '@/store/auth'
import type { Role } from '@/types'

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

export function PasswordLoginForm() {
  const navigate = useNavigate()
  const setSession = useAuth((s) => s.setSession)

  const [phone, setPhone] = useState('+233')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: () => passwordLogin(phone, password),
    onSuccess: (data) => {
      setSession(data.user, data.tokens)
      navigate(rolePath(data.user.role), { replace: true })
    },
    onError: (
      err: Error & {
        response?: { data?: { detail?: string; phone?: string[]; password?: string[] } }
      },
    ) => {
      setError(
        err.response?.data?.detail ||
          err.response?.data?.phone?.[0] ||
          err.response?.data?.password?.[0] ||
          'Could not sign in. Check your details.',
      )
    },
  })

  return (
    <div>
      {error && (
        <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!isValidGhPhone(phone)) {
            setError('Enter a valid Ghana phone number — 9 digits after +233.')
            return
          }
          if (!password) {
            setError('Enter your password.')
            return
          }
          setError(null)
          mut.mutate()
        }}
      >
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
        </Field>
        <Field label="Password">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className="input pr-16"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-charcoal/60 hover:text-charcoal px-2 py-1"
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </Field>
        <button
          type="submit"
          disabled={mut.isPending || !isValidGhPhone(phone) || !password}
          className="w-full bg-primary text-white font-bold py-3.5 rounded-lg hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm"
        >
          {mut.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-xs text-charcoal/60 text-center">
          Forgot your password?{' '}
          <Link to="/login?method=otp" className="text-primary font-semibold hover:underline">
            Sign in with a code
          </Link>{' '}
          and reset it in your profile.
        </p>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-charcoal/80">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}
