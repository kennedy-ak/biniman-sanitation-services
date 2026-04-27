import { OtpAuthForm } from './OtpAuthForm'
import { AuthShell } from '@/components/auth/AuthShell'

export function Signup() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Pick your role and we'll text a verification code."
      footerText="Already have an account?"
      footerLinkLabel="Sign in"
      footerLinkTo="/login"
    >
      <OtpAuthForm mode="signup" />
    </AuthShell>
  )
}
