import { useEffect, useState } from 'react'
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
  const [form, setForm] = useState<PricingConfigUpdate>({
    base_fee_min: cfg.base_fee_min,
    base_fee_max: cfg.base_fee_max,
    distance_rate_per_km: cfg.distance_rate_per_km,
    tier_small_fee: cfg.tier_small_fee,
    tier_medium_fee: cfg.tier_medium_fee,
    tier_large_fee: cfg.tier_large_fee,
    commission_pct: cfg.commission_pct,
    matching_radius_km: cfg.matching_radius_km,
    accept_window_seconds: cfg.accept_window_seconds,
  })

  useEffect(() => {
    setForm({
      base_fee_min: cfg.base_fee_min,
      base_fee_max: cfg.base_fee_max,
      distance_rate_per_km: cfg.distance_rate_per_km,
      tier_small_fee: cfg.tier_small_fee,
      tier_medium_fee: cfg.tier_medium_fee,
      tier_large_fee: cfg.tier_large_fee,
      commission_pct: cfg.commission_pct,
      matching_radius_km: cfg.matching_radius_km,
      accept_window_seconds: cfg.accept_window_seconds,
    })
  }, [cfg])

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
        <Section title="Base fee" desc="Floor and cap on the request base fee.">
          <NumField
            label="Min (GHS)"
            value={form.base_fee_min}
            onChange={(v) => setForm({ ...form, base_fee_min: v })}
          />
          <NumField
            label="Max (GHS)"
            value={form.base_fee_max}
            onChange={(v) => setForm({ ...form, base_fee_max: v })}
          />
        </Section>

        <Section title="Distance & commission" desc="Rate per km plus the platform's cut.">
          <NumField
            label="Per-km rate (GHS)"
            value={form.distance_rate_per_km}
            onChange={(v) => setForm({ ...form, distance_rate_per_km: v })}
          />
          <NumField
            label="Commission (%)"
            value={form.commission_pct}
            onChange={(v) => setForm({ ...form, commission_pct: v })}
          />
        </Section>

        <Section title="Volume tier fees" desc="Added to base fee based on tank size.">
          <NumField
            label="Small (GHS)"
            value={form.tier_small_fee}
            onChange={(v) => setForm({ ...form, tier_small_fee: v })}
          />
          <NumField
            label="Medium (GHS)"
            value={form.tier_medium_fee}
            onChange={(v) => setForm({ ...form, tier_medium_fee: v })}
          />
          <NumField
            label="Large (GHS)"
            value={form.tier_large_fee}
            onChange={(v) => setForm({ ...form, tier_large_fee: v })}
          />
        </Section>

        <Section
          title="Matching"
          desc="How far we search for a driver and how long offers stay open."
        >
          <NumField
            label="Radius (km)"
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
