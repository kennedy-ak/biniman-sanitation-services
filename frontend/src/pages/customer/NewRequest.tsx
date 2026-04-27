import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchRegions } from '@/api/auth'
import { createRequest, previewQuote } from '@/api/requests'
import { useAuth } from '@/store/auth'
import type { QuotePreview, VolumeTier, WasteType } from '@/types'

const WASTE_TYPES: {
  value: WasteType
  label: string
  desc: string
  icon: string
}[] = [
  { value: 'septic', label: 'Septic tank', desc: 'Residential or commercial', icon: '🚽' },
  { value: 'soak_pit', label: 'Soak pit', desc: 'Cesspit / leach pit', icon: '🕳️' },
  { value: 'industrial', label: 'Industrial', desc: 'Liquid industrial waste', icon: '🏭' },
]

const TIERS: { value: VolumeTier; label: string; range: string }[] = [
  { value: 'small', label: 'Small', range: '≤ 2,000 L' },
  { value: 'medium', label: 'Medium', range: '2,000–5,000 L' },
  { value: 'large', label: 'Large', range: '5,000+ L' },
]

export function CustomerNewRequest() {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const regions = useQuery({ queryKey: ['regions'], queryFn: fetchRegions })

  const [regionId, setRegionId] = useState<number | undefined>(user?.region?.id)
  const [wasteType, setWasteType] = useState<WasteType>('septic')
  const [tier, setTier] = useState<VolumeTier>('medium')
  const [lat, setLat] = useState('5.6037')
  const [lng, setLng] = useState('-0.1870')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [quote, setQuote] = useState<QuotePreview | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)

  useEffect(() => {
    if (regions.data && !regionId) setRegionId(regions.data[0]?.id)
  }, [regions.data, regionId])

  // Auto-refresh quote when key inputs change
  useEffect(() => {
    if (!regionId) return
    const t = setTimeout(() => {
      void refreshQuote()
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId, tier, lat, lng])

  function locate() {
    if (!navigator.geolocation) {
      setLocateError('Location is not supported by this browser.')
      return
    }
    setLocating(true)
    setLocateError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(7))
        setLng(pos.coords.longitude.toFixed(7))
        setLocating(false)
      },
      (err) => {
        setLocateError(err.message || 'Could not access your location.')
        setLocating(false)
      },
      { timeout: 10000 },
    )
  }

  async function refreshQuote() {
    if (!regionId) return
    setQuoting(true)
    try {
      const q = await previewQuote({
        region_id: regionId,
        pickup_lat: lat,
        pickup_lng: lng,
        volume_tier: tier,
      })
      setQuote(q)
    } catch {
      setQuote(null)
    } finally {
      setQuoting(false)
    }
  }

  const submit = useMutation({
    mutationFn: () =>
      createRequest({
        region_id: regionId!,
        waste_type: wasteType,
        volume_tier: tier,
        pickup_lat: lat,
        pickup_lng: lng,
        pickup_address: address,
        notes,
      }),
    onSuccess: (sr) => navigate(`/customer/requests/${sr.id}/pay`),
  })

  const canSubmit = !!regionId && !!lat && !!lng

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">
          Request a pickup
        </h1>
        <p className="mt-1 text-charcoal/60 max-w-xl">
          Tell us where, what, and how much. We'll match you to the nearest
          verified driver.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Left: form */}
        <div className="space-y-6">
          {/* Step 1: Waste type */}
          <Section step="1" title="What needs hauling?">
            <div className="grid sm:grid-cols-3 gap-3">
              {WASTE_TYPES.map((w) => (
                <Tile
                  key={w.value}
                  active={wasteType === w.value}
                  onClick={() => setWasteType(w.value)}
                  icon={w.icon}
                  title={w.label}
                  desc={w.desc}
                />
              ))}
            </div>
          </Section>

          {/* Step 2: Tier */}
          <Section step="2" title="How big is the tank?">
            <div className="grid sm:grid-cols-3 gap-3">
              {TIERS.map((t) => (
                <Tile
                  key={t.value}
                  active={tier === t.value}
                  onClick={() => setTier(t.value)}
                  icon={
                    t.value === 'small' ? '🥤' : t.value === 'medium' ? '🪣' : '🛢️'
                  }
                  title={t.label}
                  desc={t.range}
                />
              ))}
            </div>
          </Section>

          {/* Step 3: Location */}
          <Section step="3" title="Where are we picking up?">
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Region">
                  <select
                    className="input"
                    value={regionId ?? ''}
                    onChange={(e) => setRegionId(Number(e.target.value))}
                  >
                    {regions.data?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={locate}
                    disabled={locating}
                    className="w-full border-2 border-primary text-primary font-semibold px-4 py-2.5 rounded-lg hover:bg-primary hover:text-white disabled:opacity-60 transition flex items-center justify-center gap-2"
                  >
                    {locating ? '📡 Locating…' : '📍 Use my location'}
                  </button>
                </div>
              </div>
              {locateError && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {locateError}
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Latitude">
                  <input
                    className="input font-mono"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                  />
                </Field>
                <Field label="Longitude">
                  <input
                    className="input font-mono"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Address" hint="Optional but helpful">
                <input
                  className="input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House 12, ABC Street, Tema"
                />
              </Field>
              <Field label="Notes for driver" hint="Optional">
                <textarea
                  rows={2}
                  className="input resize-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Gate code, driver instructions, parking info, etc."
                />
              </Field>
            </div>
          </Section>
        </div>

        {/* Right: live quote */}
        <div className="lg:sticky lg:top-6">
          <div className="bg-gradient-to-br from-primary to-[#084d29] text-white rounded-2xl shadow-lg overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-widest text-accent font-bold">
                  Estimated price
                </div>
                {quoting && (
                  <span className="text-[10px] uppercase tracking-wider text-white/60 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    Updating
                  </span>
                )}
              </div>

              {quote ? (
                <>
                  <div className="mt-3 font-heading text-4xl font-extrabold">
                    GHS {quote.total}
                  </div>
                  <div className="mt-1 text-xs text-white/70">
                    Estimated · final price confirmed at booking
                  </div>

                  <div className="mt-5 space-y-2 text-sm">
                    <Row label="Base fee" value={`GHS ${quote.base_fee}`} />
                    <Row
                      label={`Distance (${Number(quote.distance_km).toFixed(1)} km)`}
                      value={`GHS ${quote.distance_fee}`}
                    />
                    <Row label="Tank size fee" value={`GHS ${quote.tier_fee}`} />
                  </div>
                </>
              ) : (
                <div className="mt-4 text-sm text-white/70">
                  Pick a region and tank size to see your estimate.
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-black/20 border-t border-white/10">
              <button
                type="button"
                disabled={submit.isPending || !canSubmit}
                onClick={() => submit.mutate()}
                className="w-full bg-accent text-charcoal font-bold py-3 rounded-lg hover:brightness-110 disabled:opacity-60 transition shadow-sm"
              >
                {submit.isPending ? 'Submitting…' : 'Confirm & continue to payment →'}
              </button>
              {submit.isError && (
                <div className="mt-2 text-xs text-red-200">
                  Could not create request. Try again.
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 text-xs text-charcoal/60 leading-relaxed px-1">
            🛡️ All drivers are ID-verified and EPA-permitted. You'll only be
            charged after the request is confirmed.
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({
  step,
  title,
  children,
}: {
  step: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary text-white grid place-items-center font-heading font-extrabold">
          {step}
        </div>
        <h2 className="font-heading font-bold text-lg">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Tile({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean
  onClick: () => void
  icon: string
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-4 rounded-xl border-2 transition ${
        active
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-charcoal/10 hover:border-charcoal/30'
      }`}
    >
      <div className="text-2xl">{icon}</div>
      <div className="mt-2 font-bold text-charcoal text-sm">{title}</div>
      <div className="text-xs text-charcoal/60">{desc}</div>
    </button>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-charcoal/80">{label}</span>
        {hint && (
          <span className="text-[10px] uppercase text-charcoal/50">{hint}</span>
        )}
      </div>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-white/85">
      <span>{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  )
}
