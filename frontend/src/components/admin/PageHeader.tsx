import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: string
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-charcoal/5">
      <div className="flex items-start gap-4">
        {icon && (
          <div className="w-12 h-12 rounded-xl bg-primary/10 grid place-items-center text-2xl">
            {icon}
          </div>
        )}
        <div>
          <h1 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-charcoal/60 max-w-2xl">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex gap-2 items-center">{actions}</div>}
    </div>
  )
}

interface SegmentedTabsProps<T extends string> {
  value: T
  options: { value: T; label: string; count?: number }[]
  onChange: (v: T) => void
}

export function SegmentedTabs<T extends string>({
  value,
  options,
  onChange,
}: SegmentedTabsProps<T>) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-charcoal/5 border border-charcoal/5">
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              active
                ? 'bg-white text-charcoal shadow-sm'
                : 'text-charcoal/60 hover:text-charcoal'
            }`}
          >
            <span>{o.label}</span>
            {typeof o.count === 'number' && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  active ? 'bg-primary text-white' : 'bg-charcoal/10 text-charcoal/70'
                }`}
              >
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

interface EmptyStateProps {
  icon: string
  title: string
  body: string
}

export function EmptyState({ icon, title, body }: EmptyStateProps) {
  return (
    <div className="text-center py-16 px-6 bg-white border border-charcoal/5 rounded-2xl">
      <div className="text-5xl">{icon}</div>
      <h3 className="mt-4 font-bold text-charcoal text-lg">{title}</h3>
      <p className="mt-1 text-sm text-charcoal/60 max-w-md mx-auto">{body}</p>
    </div>
  )
}
