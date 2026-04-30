import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useAuth } from '@/store/auth'
import { BRAND } from '@/lib/brand'

interface PortalLayoutProps {
  title: string
  navItems: { to: string; label: string; icon?: ReactNode }[]
}

function EmailReminderBanner() {
  const user = useAuth((s) => s.user)
  const location = useLocation()
  const [dismissed, setDismissed] = useState<boolean>(() => {
    return sessionStorage.getItem('liquidgo.email_banner_dismissed') === '1'
  })
  if (!user) return null
  // Profile + email-OTP UI is currently only wired into the customer portal.
  if (user.role !== 'customer') return null
  const needs = !user.email || !user.is_email_verified
  if (!needs || dismissed) return null
  if (location.pathname.includes('/profile')) return null

  const profilePath = '/customer/profile'

  const message = !user.email
    ? 'Add an email to your profile so you can receive OTP codes by email too.'
    : 'Your email is unverified. Verify it from your profile to enable email OTP.'

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-amber-900">
        <span className="font-semibold">Heads up:</span> {message}
      </div>
      <div className="flex items-center gap-3">
        <Link
          to={profilePath}
          className="text-sm font-semibold text-amber-900 underline hover:no-underline"
        >
          {user.email ? 'Verify now' : 'Add email'}
        </Link>
        <button
          onClick={() => {
            sessionStorage.setItem('liquidgo.email_banner_dismissed', '1')
            setDismissed(true)
          }}
          className="text-amber-700/80 hover:text-amber-900 text-lg leading-none px-1"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}

export function PortalLayout({ title, navItems }: PortalLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  const [open, setOpen] = useState(false)

  // Close drawer on route change
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  const sidebar = (
    <aside className="bg-charcoal text-white flex flex-col gap-5 p-5 h-full w-full md:w-[240px]">
      <Link to="/" className="font-heading font-extrabold text-xl leading-tight">
        {BRAND.name}
        <span className="block text-[10px] font-medium text-white/50 uppercase tracking-widest mt-0.5">
          Sanitation Services
        </span>
      </Link>
      <div className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">
        {title}
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              cn(
                'px-3 py-2 rounded-md text-sm font-medium transition',
                isActive
                  ? 'bg-primary text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto pt-5 border-t border-white/10">
        {user && (
          <div className="text-sm">
            <div className="font-medium text-white truncate">
              {user.full_name || user.phone}
            </div>
            <div className="text-xs text-white/50 truncate">{user.phone}</div>
          </div>
        )}
        <button
          onClick={() => {
            logout()
            navigate('/')
          }}
          className="mt-3 text-xs text-white/60 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </aside>
  )

  return (
    <div className="min-h-full md:grid md:grid-cols-[240px_1fr]">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-charcoal text-white flex items-center justify-between px-4 h-14 border-b border-white/10">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="w-10 h-10 -ml-2 grid place-items-center rounded-lg hover:bg-white/10"
        >
          <span className="block w-5 h-0.5 bg-white relative before:content-[''] before:absolute before:-top-1.5 before:left-0 before:w-5 before:h-0.5 before:bg-white after:content-[''] after:absolute after:top-1.5 after:left-0 after:w-5 after:h-0.5 after:bg-white" />
        </button>
        <Link to="/" className="font-heading font-extrabold text-lg tracking-tight">
          {BRAND.name}
        </Link>
        <span className="text-[10px] uppercase tracking-widest text-white/60 font-semibold">
          {title}
        </span>
      </header>

      {/* Desktop sidebar */}
      <div className="hidden md:block">{sidebar}</div>

      {/* Mobile drawer */}
      {open && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="md:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute top-3 right-3 z-10 w-8 h-8 grid place-items-center rounded-lg text-white/70 hover:bg-white/10"
            >
              ✕
            </button>
            {sidebar}
          </div>
        </>
      )}

      <main className="bg-gray-50 min-h-[calc(100vh-3.5rem)] md:min-h-full p-4 sm:p-6 md:p-8 overflow-x-hidden">
        <EmailReminderBanner />
        <Outlet />
      </main>
    </div>
  )
}
