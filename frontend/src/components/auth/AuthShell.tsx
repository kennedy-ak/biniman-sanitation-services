import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { BRAND } from '@/lib/brand'

interface AuthShellProps {
  title: string
  subtitle: string
  children: ReactNode
  footerText: string
  footerLinkLabel: string
  footerLinkTo: string
}

export function AuthShell({
  title,
  subtitle,
  children,
  footerText,
  footerLinkLabel,
  footerLinkTo,
}: AuthShellProps) {
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* Left brand panel */}
      <div className="hidden md:flex relative bg-gradient-to-br from-primary via-primary to-[#084d29] text-white p-12 flex-col justify-between overflow-hidden">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              'radial-gradient(circle at 30% 30%, #6FCF97 0%, transparent 45%), radial-gradient(circle at 70% 80%, #D4A017 0%, transparent 40%)',
          }}
        />
        <div className="relative">
          <Link to="/" className="font-heading font-extrabold text-3xl tracking-tight">
            {BRAND.name}
          </Link>
          <p className="mt-2 text-sm text-white/70">{BRAND.tagline}</p>
        </div>
        <div className="relative space-y-6">
          <Bullet>Match with the closest verified driver in minutes.</Bullet>
          <Bullet>Transparent pricing — see the cost before you book.</Bullet>
          <Bullet>Pay by mobile money or card. Live tracking included.</Bullet>
        </div>
        <div className="relative text-xs text-white/50">
          © {new Date().getFullYear()} {BRAND.full} · Accra & Kumasi
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 md:p-12 bg-white">
        <div className="w-full max-w-md">
          <div className="md:hidden mb-8">
            <Link to="/" className="font-heading font-extrabold text-2xl text-primary tracking-tight">
              {BRAND.name}
            </Link>
          </div>
          <h1 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">
            {title}
          </h1>
          <p className="mt-2 text-charcoal/70">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-8 text-sm text-charcoal/60 text-center">
            {footerText}{' '}
            <Link to={footerLinkTo} className="text-primary font-semibold hover:underline">
              {footerLinkLabel}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 w-6 h-6 rounded-full bg-accent text-charcoal grid place-items-center font-bold text-sm flex-shrink-0">
        ✓
      </div>
      <p className="text-white/90 leading-relaxed">{children}</p>
    </div>
  )
}
