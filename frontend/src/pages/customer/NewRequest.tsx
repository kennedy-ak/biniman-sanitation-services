import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchRegions } from '@/api/auth'
import { createRequest, fetchMyRequests, previewQuote } from '@/api/requests'
import { useAuth } from '@/store/auth'
import type { RequestStatus } from '@/types'

const ACTIVE_STATUSES: RequestStatus[] = ['pending', 'assigned', 'accepted', 'en_route', 'arrived']
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

const WASTE_TYPES: { value: WasteType; label: string; desc: string; icon: string }[] = [
  { value: 'septic', label: 'Septic tank', desc: 'Residential or commercial', icon: '🚽' },
  { value: 'soak_pit', label: 'Soak pit', desc: 'Cesspit / leach pit', icon: '🕳️' },
  { value: 'industrial', label: 'Industrial', desc: 'Liquid industrial waste', icon: '🏭' },
]

const TIERS: { value: VolumeTier; label: string; range: string; fill: string }[] = [
  { value: 'small', label: 'Small load', range: 'Under 50% full', fill: '33%' },
  { value: 'medium', label: 'Medium load', range: '50–75% full', fill: '66%' },
  { value: 'full', label: 'Full load', range: '75–100% full', fill: '100%' },
]

const TRIP_OPTS = [1, 2, 3]

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

const STEP_LABELS = ['Service', 'Location', 'Access', 'Details']

export function CustomerNewRequest() {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const regions = useQuery({ queryKey: ['regions'], queryFn: fetchRegions })
  const myRequests = useQuery({ queryKey: ['my-requests'], queryFn: fetchMyRequests })

  useEffect(() => {
    if (myRequests.data?.some((r) => ACTIVE_STATUSES.includes(r.status))) {
      navigate('/customer', { replace: true })
    }
  }, [myRequests.data, navigate])

  const [step, setStep] = useState(1)
  const [regionId, setRegionId] = useState<number | undefined>(user?.region?.id)
  const [wasteType, setWasteType] = useState<WasteType>('septic')
  const [tier, setTier] = useState<VolumeTier>('full')
  const [numTrips, setNumTrips] = useState(1)
  const [lat, setLat] = useState('5.6037')
  const [lng, setLng] = useState('-0.1870')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [quote, setQuote] = useState<QuotePreview | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [showCoords, setShowCoords] = useState(false)

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

  // Default to the first region once they load (set state during render)
  if (regions.data && regions.data.length > 0 && !regionId) setRegionId(regions.data[0].id)

  const refreshQuote = useCallback(async () => {
    if (!regionId) return
    setQuoting(true)
    try {
      const q = await previewQuote({
        region_id: regionId, pickup_lat: lat, pickup_lng: lng, volume_tier: tier, num_trips: numTrips,
      })
      setQuote(q)
    } catch {
      setQuote(null)
    } finally {
      setQuoting(false)
    }
  }, [regionId, lat, lng, tier, numTrips])

  useEffect(() => {
    if (!regionId) return
    const t = setTimeout(() => { void refreshQuote() }, 400)
    return () => clearTimeout(t)
  }, [regionId, refreshQuote])

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

  const submit = useMutation({
    mutationFn: (acceptExpanded: boolean) =>
      createRequest({
        region_id: regionId!,
        waste_type: wasteType,
        volume_tier: tier,
        num_trips: numTrips,
        accept_expanded: acceptExpanded,
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
    onError: (err) => {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === 'confirmation_required') setShowConsent(true)
    },
  })

  const noDrivers = quote?.no_drivers === true
  const requiresConfirmation = quote?.requires_confirmation === true
  const canSubmit = !!regionId && !!lat && !!lng && !noDrivers

  function handleSubmit() {
    if (!canSubmit) return
    if (requiresConfirmation) {
      setShowConsent(true)
      return
    }
    submit.mutate(false)
  }

  function goStep(n: number) {
    setStep(n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* ── Progress bar ── */}
      <div className="mb-8">
        <div className="flex items-center">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1
            const isDone = n < step
            const isActive = n === step
            return (
              <div key={n} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                      isDone || isActive
                        ? 'border-primary bg-primary text-white'
                        : 'border-charcoal/20 bg-white text-charcoal/40'
                    }`}
                  >
                    {isDone ? '✓' : n}
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${
                      isActive ? 'text-primary' : 'text-charcoal/40'
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 mb-4 transition-all ${
                      n < step ? 'bg-primary' : 'bg-charcoal/15'
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-8 items-start">
        {/* ── Step pages ── */}
        <div>

          {/* Step 1: Service */}
          {step === 1 && (
            <StepCard
              step={1}
              title="What needs hauling?"
              sub="Select the type of tank and its size"
              onNext={() => goStep(2)}
            >
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

              <SectionDivider>Tank size</SectionDivider>

              <div className="grid grid-cols-3 gap-3">
                {TIERS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTier(t.value)}
                    className={`text-left p-4 rounded-xl border-2 transition ${
                      tier === t.value
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-charcoal/10 hover:border-charcoal/25 bg-white'
                    }`}
                  >
                    <div className="font-bold text-charcoal text-sm">{t.label}</div>
                    <div className="text-xs text-charcoal/55 mt-0.5">{t.range}</div>
                    <div className="mt-3 h-1 rounded-full bg-charcoal/10 overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: t.fill }} />
                    </div>
                  </button>
                ))}
              </div>

              <SectionDivider>Number of trips</SectionDivider>

              <div className="grid grid-cols-3 gap-3">
                {TRIP_OPTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNumTrips(n)}
                    className={`text-center p-4 rounded-xl border-2 transition ${
                      numTrips === n
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-charcoal/10 hover:border-charcoal/25 bg-white'
                    }`}
                  >
                    <div className="font-bold text-charcoal text-lg">{n}</div>
                    <div className="text-xs text-charcoal/55 mt-0.5">
                      {n === 1 ? 'Single trip' : `${n} truck loads`}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-charcoal/45 mt-2">
                Extra trips are needed when the waste is more than one truck can carry. Each additional
                trip adds a surcharge.
              </p>
            </StepCard>
          )}

          {/* Step 2: Location */}
          {step === 2 && (
            <StepCard
              step={2}
              title="Where are we picking up?"
              sub="Help us find the nearest available driver"
              onBack={() => goStep(1)}
              onNext={() => goStep(3)}
            >
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1 block">
                    Town / Area <span className="text-red-500 normal-case font-bold">*</span>
                  </label>
                  <div className="flex gap-3">
                    <select
                      className="input flex-1"
                      value={regionId ?? ''}
                      onChange={(e) => setRegionId(Number(e.target.value))}
                    >
                      <option value="" disabled>
                        {regions.isLoading ? 'Loading…' : 'Select your town or area…'}
                      </option>
                      {regions.data?.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={locate}
                      disabled={locating}
                      className="whitespace-nowrap border-2 border-primary text-primary font-semibold px-4 py-2.5 rounded-lg hover:bg-primary hover:text-white disabled:opacity-60 transition flex items-center gap-2 text-sm"
                    >
                      {locating ? '📡 Locating…' : '📍 Use my location'}
                    </button>
                  </div>
                  {locateError && (
                    <p className="mt-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {locateError}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1 block">
                    Street address <span className="normal-case font-normal">(optional)</span>
                  </label>
                  <input
                    className="input w-full"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. House 12, ABC Street, Tema"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1 block">
                    Notes for driver <span className="normal-case font-normal">(optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    className="input w-full resize-none"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Gate code, landmark, parking info, access instructions…"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowCoords((v) => !v)}
                  className="text-xs text-charcoal/50 hover:text-primary transition flex items-center gap-1"
                >
                  {showCoords ? '▲' : '▼'} Edit GPS coordinates manually
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
            </StepCard>
          )}

          {/* Step 3: Access */}
          {step === 3 && (
            <StepCard
              step={3}
              title="Gate & access"
              sub="Helps us send the right truck and avoid surprises"
              onBack={() => goStep(2)}
              onNext={() => goStep(4)}
            >
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-charcoal">Will the truck fit through your gate?</span>
                    <span className="text-[10px] text-charcoal/40 uppercase font-bold tracking-wide">~2.4 m wide, 3 m tall</span>
                  </div>
                  <Choices value={gateFits} onChange={(v) => setGateFits(v as GateFit)} options={GATE_FIT_OPTS} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-charcoal">Photo of your gate</span>
                    <span className="text-[10px] text-charcoal/40 uppercase font-bold tracking-wide">Optional</span>
                  </div>
                  <PhotoField file={gatePhoto} onFile={setGatePhoto} />
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-semibold text-charcoal block">How close can the truck park to the tank?</span>
                  <Choices value={parkingDistance} onChange={(v) => setParkingDistance(v as ParkingDistance)} options={PARKING_OPTS} />
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-semibold text-charcoal block">Will someone be on site to open the gate?</span>
                  <YesNo value={someoneOnSite} onChange={setSomeoneOnSite} />
                </div>
              </div>
            </StepCard>
          )}

          {/* Step 4: Tank details + scheduling */}
          {step === 4 && (
            <StepCard
              step={4}
              title="Tank details & scheduling"
              sub="A few last details so the driver comes prepared"
              onBack={() => goStep(3)}
              isLast
              canSubmit={canSubmit}
              submitting={submit.isPending}
              onSubmit={handleSubmit}
              submitError={submit.isError}
            >
              <div className="space-y-6">
                <SectionDivider>Tank info</SectionDivider>

                <div className="space-y-2">
                  <span className="text-sm font-semibold text-charcoal block">Where is the septic / waste tank?</span>
                  <Choices value={tankLocation} onChange={(v) => setTankLocation(v as TankLocation)} options={TANK_LOCATION_OPTS} />
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-semibold text-charcoal block">Tank cover condition</span>
                  <Choices value={tankCoverState} onChange={(v) => setTankCoverState(v as TankCoverState)} options={TANK_COVER_OPTS} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-charcoal">Photo of tank cover / manhole</span>
                    <span className="text-[10px] text-charcoal/40 uppercase font-bold tracking-wide">Optional</span>
                  </div>
                  <PhotoField file={tankCoverPhoto} onFile={setTankCoverPhoto} />
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-semibold text-charcoal block">When was the tank last emptied?</span>
                  <Choices value={lastEmptied} onChange={(v) => setLastEmptied(v as LastEmptied)} options={LAST_EMPTIED_OPTS} />
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-semibold text-charcoal block">Is the tank currently overflowing?</span>
                  <YesNo value={isOverflowing} onChange={setIsOverflowing} />
                </div>

                <SectionDivider>Scheduling</SectionDivider>

                <div className="space-y-2">
                  <span className="text-sm font-semibold text-charcoal block">Preferred time of day</span>
                  <Choices value={preferredTime} onChange={(v) => setPreferredTime(v as PreferredTime)} options={PREFERRED_TIME_OPTS} />
                </div>
              </div>
            </StepCard>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="lg:sticky lg:top-6 space-y-3">
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

              {noDrivers ? (
                <div className="mt-3 text-sm text-white/75 leading-relaxed">
                  No drivers are available right now — please try again shortly.
                </div>
              ) : quote ? (
                <>
                  <div className="font-heading text-4xl font-extrabold mt-1">GHS {quote.total}</div>
                  <div className="text-[11px] text-white/60 mt-0.5 mb-4">Estimate · confirmed at booking</div>
                  <div className="space-y-2 text-sm border-t border-white/10 pt-4">
                    <PriceRow label="Base fee" value={`GHS ${quote.base_fee}`} />
                    <PriceRow
                      label={`Distance (${Number(quote.billable_distance_km).toFixed(1)} km)`}
                      value={`GHS ${quote.distance_fee}`}
                    />
                    {Number(quote.volume_multiplier) !== 1 && (
                      <PriceRow label="Volume discount" value={`×${quote.volume_multiplier}`} />
                    )}
                    {quote.num_trips > 1 && (
                      <PriceRow label={`${quote.num_trips} trips`} value={`×${quote.trips_multiplier}`} />
                    )}
                  </div>
                  {requiresConfirmation && (
                    <div className="mt-4 text-[11px] leading-snug bg-accent/20 text-accent rounded-lg px-3 py-2">
                      Nearest driver is ~{quote.nearest_driver_km} km away — the price reflects the extra
                      distance. You'll confirm before paying.
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-3 text-sm text-white/60 leading-relaxed">
                  Select a town and tank size to see your price estimate.
                </div>
              )}
            </div>

            <div className="px-5 py-4 bg-black/20 border-t border-white/10">
              <button
                type="button"
                disabled={submit.isPending || !canSubmit}
                onClick={handleSubmit}
                className="w-full bg-accent text-charcoal font-bold py-3.5 rounded-xl hover:brightness-110 disabled:opacity-50 transition shadow-sm text-base"
              >
                {submit.isPending
                  ? 'Submitting…'
                  : requiresConfirmation
                    ? 'Review price & continue →'
                    : 'Confirm & find a driver →'}
              </button>
              {!canSubmit && !submit.isPending && (
                <p className="mt-2 text-center text-[11px] text-white/50">
                  {noDrivers
                    ? 'No drivers available right now'
                    : 'Fill in your location to continue'}
                </p>
              )}
              {submit.isError && !showConsent && (
                <p className="mt-2 text-center text-xs text-red-300">Could not create request. Please try again.</p>
              )}
            </div>
          </div>

          <div className="bg-white border border-charcoal/8 rounded-xl p-4 text-xs text-charcoal/60 leading-relaxed space-y-1.5">
            <div className="flex items-start gap-2">
              <span>🛡️</span>
              <span>All drivers are ID-verified and EPA-permitted.</span>
            </div>
            <div className="flex items-start gap-2">
              <span>💳</span>
              <span>You're only charged after a driver is confirmed.</span>
            </div>
            <div className="flex items-start gap-2">
              <span>📍</span>
              <span>Track your driver live once assigned.</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Expanded-price consent modal ── */}
      {showConsent && quote && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="text-3xl">🚚</div>
            <h3 className="font-heading text-xl font-bold text-charcoal mt-2">
              Driver is farther than usual
            </h3>
            <p className="text-sm text-charcoal/65 mt-2 leading-relaxed">
              The nearest available driver is about{' '}
              <span className="font-bold text-charcoal">{quote.nearest_driver_km} km</span> away. Because
              of the extra distance, the price for this job is{' '}
              <span className="font-bold text-charcoal">GHS {quote.total}</span>.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConsent(false)}
                className="flex-1 border-2 border-charcoal/15 rounded-xl py-3 text-sm font-semibold text-charcoal/60 hover:border-charcoal/30 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submit.isPending}
                onClick={() => {
                  setShowConsent(false)
                  submit.mutate(true)
                }}
                className="flex-1 bg-accent text-charcoal font-bold rounded-xl py-3 text-sm hover:brightness-110 disabled:opacity-50 transition"
              >
                {submit.isPending ? 'Submitting…' : `Proceed · GHS ${quote.total}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepCard({
  step,
  title,
  sub,
  children,
  onBack,
  onNext,
  canNext,
  isLast,
  canSubmit,
  submitting,
  onSubmit,
  submitError,
}: {
  step: number
  title: string
  sub: string
  children: React.ReactNode
  onBack?: () => void
  onNext?: () => void
  canNext?: boolean
  isLast?: boolean
  canSubmit?: boolean
  submitting?: boolean
  onSubmit?: () => void
  submitError?: boolean
}) {
  return (
    <section className="bg-white border border-charcoal/8 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-charcoal/6 bg-gradient-to-b from-charcoal/[0.02] to-white">
        <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          Step {step} of 4
        </div>
        <h2 className="font-heading text-2xl font-bold text-charcoal">{title}</h2>
        <p className="text-sm text-charcoal/55 mt-1">{sub}</p>
      </div>

      <div className="p-6">{children}</div>

      <div className="px-6 py-4 border-t border-charcoal/6 bg-charcoal/[0.015] flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="px-5 py-2.5 border-2 border-charcoal/15 rounded-full text-sm font-medium text-charcoal/60 hover:border-charcoal/30 hover:text-charcoal transition"
          >
            ← Back
          </button>
        ) : (
          <div />
        )}

        {isLast ? (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              disabled={submitting || !canSubmit}
              onClick={onSubmit}
              className="bg-accent text-charcoal font-bold px-7 py-3 rounded-full hover:brightness-110 disabled:opacity-50 transition text-sm"
            >
              {submitting ? 'Submitting…' : 'Confirm & find driver →'}
            </button>
            {submitError && (
              <span className="text-xs text-red-600">Could not create request. Please try again.</span>
            )}
            {!canSubmit && !submitting && (
              <span className="text-xs text-charcoal/40">Fill in your location to submit</span>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={onNext}
              disabled={canNext === false}
              className="bg-primary text-white font-semibold px-7 py-3 rounded-full hover:bg-primary/90 transition flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue →
            </button>
            {canNext === false && (
              <span className="text-xs text-charcoal/40">Complete this step to continue</span>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function SectionDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <span className="text-[11px] font-bold uppercase tracking-widest text-charcoal/40 whitespace-nowrap">
        {children}
      </span>
      <div className="flex-1 h-px bg-charcoal/10" />
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

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
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

function PhotoField({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
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
