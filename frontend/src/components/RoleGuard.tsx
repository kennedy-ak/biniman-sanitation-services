import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/store/auth'
import type { Role } from '@/types'

export function RoleGuard({
  allow,
  children,
}: {
  allow: Role[]
  children: ReactNode
}) {
  const location = useLocation()
  const user = useAuth((s) => s.user)
  const hydrated = useAuth((s) => s.hydrated)

  if (!hydrated) return null

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!allow.includes(user.role)) {
    return <Navigate to={`/${user.role === 'fleet_admin' ? 'fleet' : user.role}`} replace />
  }

  return <>{children}</>
}
