import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setPassword } from '@/api/auth'
import { useAuth } from '@/store/auth'

export function PasswordSecurityCard() {
  const qc = useQueryClient()
  const user = useAuth((s) => s.user)
  const setUser = useAuth((s) => s.setUser)
  const hasPassword = !!user?.has_password

  const [editing, setEditing] = useState(!hasPassword)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: () =>
      setPassword({
        current_password: hasPassword ? current : undefined,
        new_password: next,
      }),
    onSuccess: () => {
      if (user) setUser({ ...user, has_password: true })
      qc.invalidateQueries({ queryKey: ['me'] })
      setCurrent('')
      setNext('')
      setConfirm('')
      setError(null)
      setInfo(hasPassword ? 'Password updated.' : 'Password set. You can now sign in with it.')
      setEditing(false)
    },
    onError: (
      err: Error & {
        response?: {
          data?: {
            detail?: string
            new_password?: string[] | string
            current_password?: string[] | string
          }
        }
      },
    ) => {
      const data = err.response?.data
      const flatten = (v: unknown) =>
        Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : ''
      setError(
        data?.detail ||
          flatten(data?.new_password) ||
          flatten(data?.current_password) ||
          'Could not update password.',
      )
    },
  })

  return (
    <div className="bg-white border border-charcoal/5 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-6 border-b border-charcoal/5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading font-bold text-lg">Password</h2>
          <p className="text-xs text-charcoal/60 mt-0.5">
            Sign in faster without waiting for an SMS code.
          </p>
        </div>
        {hasPassword ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
            ✓ Set
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
            Not set
          </span>
        )}
      </div>

      <div className="p-6 space-y-4">
        {!editing && (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-charcoal/70">
              {hasPassword
                ? 'You can sign in with your phone and password.'
                : 'Set a password to enable password sign-in.'}
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(true)
                setError(null)
                setInfo(null)
              }}
              className="text-sm text-primary font-semibold hover:underline whitespace-nowrap"
            >
              {hasPassword ? 'Change password' : 'Set password'}
            </button>
          </div>
        )}

        {editing && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (next.length < 8) {
                setError('New password must be at least 8 characters.')
                return
              }
              if (next !== confirm) {
                setError('Passwords do not match.')
                return
              }
              if (hasPassword && !current) {
                setError('Enter your current password.')
                return
              }
              setError(null)
              mut.mutate()
            }}
          >
            {hasPassword && (
              <Field label="Current password">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                />
              </Field>
            )}
            <Field label="New password">
              <input
                type={showPw ? 'text' : 'password'}
                className="input"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type={showPw ? 'text' : 'password'}
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </Field>
            <label className="inline-flex items-center gap-2 text-xs text-charcoal/70 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPw}
                onChange={(e) => setShowPw(e.target.checked)}
              />
              Show passwords
            </label>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={mut.isPending}
                className="bg-primary text-white px-5 py-2 rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-60 transition"
              >
                {mut.isPending
                  ? 'Saving…'
                  : hasPassword
                    ? 'Update password'
                    : 'Set password'}
              </button>
              {hasPassword && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setCurrent('')
                    setNext('')
                    setConfirm('')
                    setError(null)
                  }}
                  className="text-sm text-charcoal/60 hover:text-charcoal"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {info && <div className="text-xs text-green-700 font-medium">{info}</div>}
        {error && <div className="text-xs text-red-700 font-medium">{error}</div>}
      </div>
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
