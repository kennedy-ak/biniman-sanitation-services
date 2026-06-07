import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/store/auth'
import { BRAND } from '@/lib/brand'
import { prefetchRoute } from '@/lib/routeLoaders'

interface PortalLayoutProps {
  title: string
  navItems: { to: string; label: string; icon?: ReactNode }[]
}

function initials(name: string, fallback: string) {
  const src = name || fallback
  return src.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function EmailReminderBanner() {
  const user = useAuth((s) => s.user)
  const location = useLocation()
  const [dismissed, setDismissed] = useState<boolean>(() => {
    return sessionStorage.getItem('biniman.email_banner_dismissed') === '1'
  })
  if (!user) return null
  if (user.role !== 'customer') return null
  const needs = !user.email || !user.is_email_verified
  if (!needs || dismissed) return null
  if (location.pathname.includes('/profile')) return null

  const profilePath = '/customer/profile'
  const message = !user.email
    ? 'Add an email to your profile so you can receive OTP codes by email too.'
    : 'Your email is unverified. Verify it from your profile to enable email OTP.'

  return (
    <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-amber-900">
        <span className="font-semibold">Heads up:</span> {message}
      </div>
      <div className="flex items-center gap-3">
        <Link to={profilePath} className="text-sm font-semibold text-amber-900 underline hover:no-underline">
          {user.email ? 'Verify now' : 'Add email'}
        </Link>
        <button
          onClick={() => { sessionStorage.setItem('biniman.email_banner_dismissed', '1'); setDismissed(true) }}
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

  // Close the mobile sidebar on navigation (reset state during render — no effect needed)
  const [prevPath, setPrevPath] = useState(location.pathname)
  if (location.pathname !== prevPath) {
    setPrevPath(location.pathname)
    setOpen(false)
  }

  const userInit = initials(user?.full_name ?? '', user?.phone ?? 'U')

  const sidebar = (
    <aside className="bg-primary text-white flex flex-col h-full w-full">
      {/* Brand */}
      <div className="px-6 py-7 border-b border-white/[0.08]">
        <Link to="/" className="block">
          <span className="font-heading text-[22px] text-white tracking-[-0.3px] leading-none">
            {BRAND.name}
          </span>
          <span className="block text-[9px] tracking-[2.5px] uppercase text-[#7aad8e] mt-1">
            Sanitation Services
          </span>
        </Link>
      </div>

      {/* Section label */}
      <div className="px-4 pt-5 pb-2 text-[9px] tracking-[2px] uppercase text-white/30 font-medium">
        {title}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            onMouseEnter={() => prefetchRoute(item.to)}
            onFocus={() => prefetchRoute(item.to)}
            onTouchStart={() => prefetchRoute(item.to)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] transition-all ${
                isActive
                  ? 'bg-white/[0.12] text-white font-medium'
                  : 'text-white/60 hover:bg-white/[0.07] hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all ${
                    isActive ? 'bg-[#5dd4a0] opacity-100' : 'bg-[#7aad8e] opacity-60'
                  }`}
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.08] px-4 py-5">
        {user && (
          <div className="flex items-center gap-2.5">
            <div className="w-[34px] h-[34px] rounded-full bg-[#3d7a5c] flex items-center justify-center text-[12px] font-semibold text-[#c8e6d4] flex-shrink-0">
              {userInit}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-medium text-white truncate">
                {user.full_name || user.phone}
              </p>
              <p className="text-[11px] text-white/40 truncate">{user.phone}</p>
            </div>
          </div>
        )}
        <button
          onClick={() => { logout(); navigate('/') }}
          className="mt-3 text-[11px] text-white/40 hover:text-white/70 transition"
        >
          Sign out
        </button>
      </div>
    </aside>
  )

  return (
    <div className="min-h-full md:grid md:grid-cols-[220px_1fr]">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-primary text-white flex items-center justify-between px-4 h-14 border-b border-white/10">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="w-10 h-10 -ml-2 grid place-items-center rounded-lg hover:bg-white/10"
        >
          <span className="block w-5 h-0.5 bg-white relative before:content-[''] before:absolute before:-top-1.5 before:left-0 before:w-5 before:h-0.5 before:bg-white after:content-[''] after:absolute after:top-1.5 after:left-0 after:w-5 after:h-0.5 after:bg-white" />
        </button>
        <Link to="/" className="font-heading text-lg text-white">{BRAND.name}</Link>
        <span className="text-[10px] uppercase tracking-widest text-white/50">{title}</span>
      </header>

      {/* Desktop sidebar */}
      <div className="hidden md:block sticky top-0 h-screen">{sidebar}</div>

      {/* Mobile drawer */}
      {open && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="md:hidden fixed inset-y-0 left-0 z-50 w-[220px] shadow-2xl">
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

      <main className="bg-[#faf8f4] min-h-[calc(100vh-3.5rem)] md:min-h-full p-6 md:p-10 overflow-x-hidden">
        <EmailReminderBanner />
        <Outlet />
      </main>
    </div>
  )
}
