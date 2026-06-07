import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminListPricing,
  adminUpdatePricing,
  type PricingConfig,
  type PricingConfigUpdate,
} from '@/api/pricing'
import { PageHeader } from '@/components/admin/PageHeader'

export function AdminPricing() {
  const list = useQuery({ queryKey: ['admin', 'pricing'], queryFn: adminListPricing })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing"
        subtitle="Configure rates per region. Changes apply to new requests immediately — existing quotes are not re-priced."
        icon="💵"
      />

      {list.isLoading && <p className="text-charcoal/60">Loading…</p>}
      {!list.isLoading && !list.data?.length && (
        <p className="text-charcoal/60">No pricing configs.</p>
      )}

      <div className="space-y-6">
        {list.data?.map((cfg) => (
          <PricingForm key={cfg.region.id} cfg={cfg} />
        ))}
      </div>
    </div>
  )
}

function PricingForm({ cfg }: { cfg: PricingConfig }) {
  const qc = useQueryClient()
  const initial = (): PricingConfigUpdate => ({
    base_fee: cfg.base_fee,
    distance_rate_per_km: cfg.distance_rate_per_km,
    min_billable_km: cfg.min_billable_km,
    small_discount_pct: cfg.small_discount_pct,
    medium_discount_pct: cfg.medium_discount_pct,
    extra_trip_surcharge_pct: cfg.extra_trip_surcharge_pct,
    commission_pct: cfg.commission_pct,
    matching_radius_km: cfg.matching_radius_km,
    accept_window_seconds: cfg.accept_window_seconds,
  })
  const [form, setForm] = useState<PricingConfigUpdate>(initial)

  // Re-seed the form when the selected config changes (reset state during render)
  const [prevCfg, setPrevCfg] = useState(cfg)
  if (cfg !== prevCfg) {
    setPrevCfg(cfg)
    setForm(initial())
  }

  const mut = useMutation({
    mutationFn: () => adminUpdatePricing(cfg.region.id, form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'pricing'] }),
  })

  return (
    <form
      className="bg-white border border-charcoal/5 rounded-2xl shadow-sm overflow-hidden"
      onSubmit={(e) => {
        e.preventDefault()
        mut.mutate()
      }}
    >
      {/* Region header */}
      <div className="flex items-center justify-between p-6 bg-gradient-to-r from-primary to-[#084d29] text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/15 grid place-items-center text-xl">
            📍
          </div>
          <div>
            <h2 className="font-heading text-xl font-extrabold">{cfg.region.name}</h2>
            <p className="text-xs text-white/70 uppercase tracking-wider">
              Region · {cfg.region.code}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <Section
          title="Base & distance"
          desc="Flat base fee, per-km rate over the A→B→C→A loop, and the minimum billed distance."
        >
          <NumField
            label="Base fee (GHS)"
            value={form.base_fee}
            onChange={(v) => setForm({ ...form, base_fee: v })}
          />
          <NumField
            label="Per-km rate (GHS)"
            value={form.distance_rate_per_km}
            onChange={(v) => setForm({ ...form, distance_rate_per_km: v })}
          />
          <NumField
            label="Min billable distance (km)"
            value={String(form.min_billable_km ?? 0)}
            onChange={(v) => setForm({ ...form, min_billable_km: Number(v) })}
          />
        </Section>

        <Section
          title="Volume discounts & trips"
          desc="Discount off the full-load price for partial loads, plus the surcharge per extra trip."
        >
          <NumField
            label="Small load discount (%)"
            value={form.small_discount_pct}
            onChange={(v) => setForm({ ...form, small_discount_pct: v })}
          />
          <NumField
            label="Medium load discount (%)"
            value={form.medium_discount_pct}
            onChange={(v) => setForm({ ...form, medium_discount_pct: v })}
          />
          <NumField
            label="Extra trip surcharge (%)"
            value={form.extra_trip_surcharge_pct}
            onChange={(v) => setForm({ ...form, extra_trip_surcharge_pct: v })}
          />
        </Section>

        <Section title="Commission" desc="The platform's cut of each completed job.">
          <NumField
            label="Commission (%)"
            value={form.commission_pct}
            onChange={(v) => setForm({ ...form, commission_pct: v })}
          />
        </Section>

        <Section
          title="Matching"
          desc="Standard radius — beyond this driver→pickup distance, riders confirm a higher price before paying. No hard cap on matching."
        >
          <NumField
            label="Standard radius (km)"
            value={String(form.matching_radius_km ?? 0)}
            onChange={(v) => setForm({ ...form, matching_radius_km: Number(v) })}
          />
          <NumField
            label="Accept window (s)"
            value={String(form.accept_window_seconds ?? 0)}
            onChange={(v) => setForm({ ...form, accept_window_seconds: Number(v) })}
          />
        </Section>
      </div>

      <div className="px-6 py-4 bg-charcoal/[0.02] border-t border-charcoal/5 flex items-center justify-between">
        <div className="text-xs text-charcoal/60">
          {mut.isSuccess && <span className="text-green-700 font-semibold">✓ Saved.</span>}
          {mut.isError && <span className="text-red-700">Save failed.</span>}
        </div>
        <button
          type="submit"
          disabled={mut.isPending}
          className="bg-primary text-white px-6 py-2.5 rounded-lg font-bold hover:bg-primary/90 disabled:opacity-60 transition shadow-sm"
        >
          {mut.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

function Section({
  title,
  desc,
  children,
}: {
  title: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-3">
        <h3 className="font-bold text-charcoal text-sm">{title}</h3>
        <p className="text-xs text-charcoal/60">{desc}</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-charcoal/70">{label}</span>
      <input
        className="input mt-1"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
