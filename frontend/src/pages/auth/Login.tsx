import { OtpAuthForm } from './OtpAuthForm'
import { AuthShell } from '@/components/auth/AuthShell'

export function Login() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Enter your phone number — we'll text a 6-digit code."
      footerText="New to Biniman?"
      footerLinkLabel="Create an account"
      footerLinkTo="/signup"
    >
      <OtpAuthForm mode="login" />
    </AuthShell>
  )
}
