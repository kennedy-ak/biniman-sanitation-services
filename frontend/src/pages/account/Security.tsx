import { PasswordSecurityCard } from '@/components/auth/PasswordSecurityCard'
import { useAuth } from '@/store/auth'

export function AccountSecurity() {
  const user = useAuth((s) => s.user)
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-heading text-2xl md:text-3xl font-extrabold text-charcoal">
          Account security
        </h1>
        <p className="mt-1 text-sm text-charcoal/60">
          Manage how you sign in to {user?.phone ?? 'your account'}.
        </p>
      </div>
      <PasswordSecurityCard />
    </div>
  )
}
