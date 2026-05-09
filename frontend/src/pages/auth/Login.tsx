import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OtpAuthForm } from './OtpAuthForm'
import { PasswordLoginForm } from './PasswordLoginForm'
import { AuthShell } from '@/components/auth/AuthShell'

type Method = 'password' | 'otp'

export function Login() {
  const [params, setParams] = useSearchParams()
  const initial: Method = params.get('method') === 'otp' ? 'otp' : 'password'
  const [method, setMethod] = useState<Method>(initial)

  function pick(next: Method) {
    setMethod(next)
    const p = new URLSearchParams(params)
    if (next === 'otp') p.set('method', 'otp')
    else p.delete('method')
    setParams(p, { replace: true })
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle={
        method === 'password'
          ? 'Sign in with your phone and password.'
          : "Enter your phone number — we'll send a 6-digit code."
      }
      footerText="New to Biniman?"
      footerLinkLabel="Create an account"
      footerLinkTo="/signup"
    >
      <div className="mb-6 inline-flex p-1 rounded-lg bg-charcoal/5 border border-charcoal/10 w-full">
        <TabButton active={method === 'password'} onClick={() => pick('password')}>
          Password
        </TabButton>
        <TabButton active={method === 'otp'} onClick={() => pick('otp')}>
          One-time code
        </TabButton>
      </div>

      {method === 'password' ? <PasswordLoginForm /> : <OtpAuthForm mode="login" />}
    </AuthShell>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition ${
        active
          ? 'bg-white text-charcoal shadow-sm'
          : 'text-charcoal/60 hover:text-charcoal'
      }`}
    >
      {children}
    </button>
  )
}
