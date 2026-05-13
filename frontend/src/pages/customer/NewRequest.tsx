import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchRegions } from '@/api/auth'
import { createRequest, previewQuote } from '@/api/requests'
import { useAuth } from '@/store/auth'
import type {
  GateFit,
  LastEmptied,
  ParkingDistance,
  PreferredTime,
  QuotePreview,
  TankCoverState,
  TankLocation,
  VolumeTier,
  WasteType,
} from '@/types'

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

const TIERS: { value: VolumeTier; label: string; range: string; icon: string }[] = [
  { value: 'small', label: 'Small', range: '≤ 2,000 L', icon: '🥤' },
  { value: 'medium', label: 'Medium', range: '2,000–5,000 L', icon: '🪣' },
  { value: 'large', label: 'Large', range: '5,000+ L', icon: '🛢️' },
]

const GATE_FIT_OPTS: { value: GateFit; label: string }[] = [
  { value: 'yes', label: 'Yes, it fits' },
  { value: 'no', label: 'No, too small' },
  { value: 'unsure', label: 'Not sure' },
]

const TANK_LOCATION_OPTS: { value: TankLocation; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'back', label: 'Back' },
  { value: 'under_driveway', label: 'Under driveway' },
  { value: 'other', label: 'Other' },
]

const PARKING_OPTS: { value: ParkingDistance; label: string }[] = [
  { value: 'at_gate', label: 'At the gate' },
  { value: '5_10', label: '5–10 m away' },
  { value: '10_20', label: '10–20 m away' },
  { value: '20_plus', label: '20 m or more' },
]

const TANK_COVER_OPTS: { value: TankCoverState; label: string }[] = [
  { value: 'open', label: 'Open / no cover' },
  { value: 'closed_accessible', label: 'Easy to open' },
  { value: 'sealed', label: 'Sealed' },
  { value: 'unknown', label: 'Not sure' },
]

const LAST_EMPTIED_OPTS: { value: LastEmptied; label: string }[] = [
  { value: 'lt_6m', label: '< 6 months' },
  { value: '6_12m', label: '6–12 months' },
  { value: '1_2y', label: '1–2 years' },
  { value: 'gt_2y', label: '2+ years' },
  { value: 'never', label: 'Never' },
  { value: 'unknown', label: "Don't know" },
]

const PREFERRED_TIME_OPTS: { value: PreferredTime; label: string }[] = [
  { value: 'asap', label: 'ASAP' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
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
  const [showCoords, setShowCoords] = useState(false)

  // Site survey
  const [gateFits, setGateFits] = useState<GateFit | ''>('')
  const [gatePhoto, setGatePhoto] = useState<File | null>(null)
  const [tankLocation, setTankLocation] = useState<TankLocation | ''>('')
  const [parkingDistance, setParkingDistance] = useState<ParkingDistance | ''>('')
  const [tankCoverPhoto, setTankCoverPhoto] = useState<File | null>(null)
  const [tankCoverState, setTankCoverState] = useState<TankCoverState | ''>('')
  const [lastEmptied, setLastEmptied] = useState<LastEmptied | ''>('')
  const [isOverflowing, setIsOverflowing] = useState<boolean | null>(null)
  const [preferredTime, setPreferredTime] = useState<PreferredTime | ''>('')
  const [someoneOnSite, setSomeoneOnSite] = useState<boolean | null>(null)

  useEffect(() => {
    if (regions.data && !regionId) setRegionId(regions.data[0]?.id)
  }, [regions.data, regionId])

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
        gate_fits_truck: gateFits,
        gate_photo: gatePhoto,
        tank_location: tankLocation,
        truck_parking_distance: parkingDistance,
        tank_cover_photo: tankCoverPhoto,
        tank_cover_state: tankCoverState,
        last_emptied: lastEmptied,
        is_overflowing: isOverflowing,
        preferred_time: preferredTime,
        someone_on_site: someoneOnSite,
      }),
    onSuccess: (sr) => navigate(`/customer/requests/${sr.id}/pay`),
  })

  const canSubmit = !!regionId && !!lat && !!lng && !!gatePhoto

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">
          Request a pickup
        </h1>
        <p className="mt-1 text-charcoal/60 max-w-lg">
          Fill in the details below and we'll match you to the nearest verified driver.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-8 items-start">
        {/* ── Left column: form steps ── */}
        <div className="space-y-5">

          {/* Step 1: Waste type */}
          <Card step={1} title="What needs hauling?">
            <div className="grid grid-cols-3 gap-3">
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
          </Card>

          {/* Step 2: Volume tier */}
          <Card step={2} title="How big is the tank?">
            <div className="grid grid-cols-3 gap-3">
              {TIERS.map((t) => (
                <Tile
                  key={t.value}
                  active={tier === t.value}
                  onClick={() => setTier(t.value)}
                  icon={t.icon}
                  title={t.label}
                  desc={t.range}
                />
              ))}
            </div>
          </Card>

          {/* Step 3: Location */}
          <Card step={3} title="Where are we picking up?">
            <div className="space-y-4">
              {/* Town + locate row */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1 block">
                    Town / Area
                  </label>
                  <select
                    className="input w-full"
                    value={regionId ?? ''}
                    onChange={(e) => setRegionId(Number(e.target.value))}
                  >
                    <option value="" disabled>
                      {regions.isLoading ? 'Loading…' : 'Select a town'}
                    </option>
                    {regions.data?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={locate}
                    disabled={locating}
                    className="whitespace-nowrap border-2 border-primary text-primary font-semibold px-4 py-2.5 rounded-lg hover:bg-primary hover:text-white disabled:opacity-60 transition flex items-center gap-2 text-sm"
                  >
                    {locating ? '📡 Locating…' : '📍 Use my location'}
                  </button>
                </div>
              </div>

              {locateError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {locateError}
                </p>
              )}

              <div>
                <label className="text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1 block">
                  Address <span className="normal-case font-normal">(optional but helpful)</span>
                </label>
                <input
                  className="input w-full"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House 12, ABC Street, Tema"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1 block">
                  Notes for driver <span className="normal-case font-normal">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  className="input w-full resize-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Gate code, parking info, access instructions…"
                />
              </div>

              {/* Coordinates — collapsed by default */}
              <button
                type="button"
                onClick={() => setShowCoords((v) => !v)}
                className="text-xs text-charcoal/50 hover:text-primary transition"
              >
                {showCoords ? '▲ Hide coordinates' : '▼ Edit coordinates manually'}
              </button>
              {showCoords && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1 block">Latitude</label>
                    <input className="input w-full font-mono" value={lat} onChange={(e) => setLat(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1 block">Longitude</label>
                    <input className="input w-full font-mono" value={lng} onChange={(e) => setLng(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Step 4: Site survey */}
          <Card step={4} title="Help your driver prepare">
            <p className="text-sm text-charcoal/60 -mt-1 mb-5">
              These details help us send the right truck and avoid surprises on the day.
            </p>

            <div className="space-y-6">
              {/* Group A: Gate & access */}
              <SurveyGroup label="Gate & access">
                <SurveyRow label="Will the truck fit through your gate?" hint="Standard truck: ~2.4 m wide, 3 m tall">
                  <Choices value={gateFits} onChange={(v) => setGateFits(v as GateFit)} options={GATE_FIT_OPTS} />
                </SurveyRow>
                <SurveyRow label="Photo of your gate" hint="Required">
                  <PhotoField file={gatePhoto} onFile={setGatePhoto} />
                </SurveyRow>
                <SurveyRow label="How close can the truck park to the tank?">
                  <Choices value={parkingDistance} onChange={(v) => setParkingDistance(v as ParkingDistance)} options={PARKING_OPTS} />
                </SurveyRow>
                <SurveyRow label="Will someone be on site to open the gate?">
                  <YesNo value={someoneOnSite} onChange={setSomeoneOnSite} />
                </SurveyRow>
              </SurveyGroup>

              {/* Group B: Tank details */}
              <SurveyGroup label="Tank details">
                <SurveyRow label="Where is the septic / waste tank?">
                  <Choices value={tankLocation} onChange={(v) => setTankLocation(v as TankLocation)} options={TANK_LOCATION_OPTS} />
                </SurveyRow>
                <SurveyRow label="Tank cover condition">
                  <Choices value={tankCoverState} onChange={(v) => setTankCoverState(v as TankCoverState)} options={TANK_COVER_OPTS} />
                </SurveyRow>
                <SurveyRow label="Photo of tank cover / manhole" hint="Optional">
                  <PhotoField file={tankCoverPhoto} onFile={setTankCoverPhoto} />
                </SurveyRow>
                <SurveyRow label="When was the tank last emptied?">
                  <Choices value={lastEmptied} onChange={(v) => setLastEmptied(v as LastEmptied)} options={LAST_EMPTIED_OPTS} />
                </SurveyRow>
                <SurveyRow label="Is the tank currently overflowing?">
                  <YesNo value={isOverflowing} onChange={setIsOverflowing} />
                </SurveyRow>
              </SurveyGroup>

              {/* Group C: Scheduling */}
              <SurveyGroup label="Scheduling">
                <SurveyRow label="Preferred time of day">
                  <Choices value={preferredTime} onChange={(v) => setPreferredTime(v as PreferredTime)} options={PREFERRED_TIME_OPTS} />
                </SurveyRow>
              </SurveyGroup>
            </div>
          </Card>
        </div>

        {/* ── Right column: quote + submit ── */}
        <div className="lg:sticky lg:top-6 space-y-3">
          {/* Price card */}
          <div className="bg-gradient-to-br from-primary to-[#084d29] text-white rounded-2xl shadow-lg overflow-hidden">
            <div className="p-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] uppercase tracking-widest text-accent font-bold">
                  Estimated price
                </span>
                {quoting && (
                  <span className="text-[10px] text-white/60 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    Updating
                  </span>
                )}
              </div>

              {quote ? (
                <>
                  <div className="font-heading text-4xl font-extrabold mt-1">
                    GHS {quote.total}
                  </div>
                  <div className="text-[11px] text-white/60 mt-0.5 mb-4">
                    Estimate · confirmed at booking
                  </div>
                  <div className="space-y-2 text-sm border-t border-white/10 pt-4">
                    <PriceRow label="Base fee" value={`GHS ${quote.base_fee}`} />
                    <PriceRow
                      label={`Distance (${Number(quote.distance_km).toFixed(1)} km)`}
                      value={`GHS ${quote.distance_fee}`}
                    />
                    <PriceRow label="Tank size fee" value={`GHS ${quote.tier_fee}`} />
                  </div>
                </>
              ) : (
                <div className="mt-3 text-sm text-white/60 leading-relaxed">
                  Select a town and tank size above to see your price estimate.
                </div>
              )}
            </div>

            <div className="px-5 py-4 bg-black/20 border-t border-white/10">
              <button
                type="button"
                disabled={submit.isPending || !canSubmit}
                onClick={() => submit.mutate()}
                className="w-full bg-accent text-charcoal font-bold py-3.5 rounded-xl hover:brightness-110 disabled:opacity-50 transition shadow-sm text-base"
              >
                {submit.isPending ? 'Submitting…' : 'Confirm & find a driver →'}
              </button>
              {!canSubmit && !submit.isPending && (
                <p className="mt-2 text-center text-[11px] text-white/50">
                  {!gatePhoto ? 'Gate photo required to continue' : 'Fill in your location to continue'}
                </p>
              )}
              {submit.isError && (
                <p className="mt-2 text-center text-xs text-red-300">
                  Could not create request. Please try again.
                </p>
              )}
            </div>
          </div>

          {/* Trust badge */}
          <div className="bg-white border border-charcoal/8 rounded-xl p-4 text-xs text-charcoal/60 leading-relaxed space-y-1.5">
            <div className="flex items-start gap-2">
              <span>🛡️</span>
              <span>All drivers are ID-verified and EPA-permitted.</span>
            </div>
            <div className="flex items-start gap-2">
              <span>💳</span>
              <span>You're only charged after a driver is confirmed.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Card({
  step,
  title,
  children,
}: {
  step: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white border border-charcoal/8 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-charcoal/6 bg-charcoal/[0.015]">
        <div className="w-7 h-7 rounded-lg bg-primary text-white grid place-items-center font-heading font-extrabold text-sm flex-shrink-0">
          {step}
        </div>
        <h2 className="font-heading font-bold text-base text-charcoal">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </section>
  )
}

function SurveyGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-widest text-primary/70 mb-3">
        {label}
      </div>
      <div className="space-y-4 pl-0">
        {children}
      </div>
    </div>
  )
}

function SurveyRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-charcoal">{label}</span>
        {hint && (
          <span
            className={`text-[10px] uppercase font-bold tracking-wide ${
              hint === 'Required' ? 'text-red-500' : 'text-charcoal/40'
            }`}
          >
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
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
          : 'border-charcoal/10 hover:border-charcoal/25'
      }`}
    >
      <div className="text-2xl">{icon}</div>
      <div className="mt-2 font-bold text-charcoal text-sm leading-tight">{title}</div>
      <div className="text-xs text-charcoal/55 mt-0.5">{desc}</div>
    </button>
  )
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-white/80">
      <span>{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  )
}

function Choices<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T | ''
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition ${
              active
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-charcoal/10 text-charcoal/65 hover:border-charcoal/25'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function YesNo({
  value,
  onChange,
}: {
  value: boolean | null
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex gap-2">
      {[
        { v: true, label: 'Yes' },
        { v: false, label: 'No' },
      ].map((o) => {
        const active = value === o.v
        return (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border-2 transition ${
              active
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-charcoal/10 text-charcoal/65 hover:border-charcoal/25'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function PhotoField({
  file,
  onFile,
}: {
  file: File | null
  onFile: (f: File | null) => void
}) {
  const previewUrl = file ? URL.createObjectURL(file) : null
  return (
    <div className="flex items-center gap-3">
      <label className="flex-1 cursor-pointer rounded-xl border-2 border-dashed border-charcoal/20 hover:border-primary/50 px-4 py-4 text-center text-sm text-charcoal/55 transition block">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <span className="font-semibold text-primary">📷 {file.name}</span>
        ) : (
          <span>📷 Tap to take photo or upload</span>
        )}
      </label>
      {previewUrl && (
        <div className="relative flex-shrink-0">
          <img
            src={previewUrl}
            alt="preview"
            className="w-16 h-16 object-cover rounded-lg border border-charcoal/10"
          />
          <button
            type="button"
            onClick={() => onFile(null)}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-xs grid place-items-center"
            aria-label="Remove"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
