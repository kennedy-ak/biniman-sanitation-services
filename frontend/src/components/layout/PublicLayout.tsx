import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { BRAND } from '@/lib/brand'

function rolePath(role: string): string {
  if (role === 'fleet_admin') return '/fleet'
  if (role === 'admin') return '/admin'
  return `/${role}`
}

export function PublicLayout() {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)

  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-primary text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-heading font-extrabold text-2xl tracking-tight">
            {BRAND.name}
          </Link>
          <nav className="flex gap-4 items-center text-sm font-medium">
            {user ? (
              <>
                <Link
                  to={rolePath(user.role)}
                  className="hover:text-accent transition-colors"
                >
                  Dashboard
                </Link>
                <button
                  onClick={() => {
                    logout()
                    navigate('/')
                  }}
                  className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-md transition"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="hover:text-accent transition-colors">
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="bg-accent text-charcoal px-4 py-2 rounded-md hover:brightness-110 transition"
                >
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-charcoal text-white/70 text-sm py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
          <span>© {new Date().getFullYear()} {BRAND.full}</span>
          <span>{BRAND.tagline}</span>
        </div>
      </footer>
    </div>
  )
}
