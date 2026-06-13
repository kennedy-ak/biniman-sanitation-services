import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchMyRequests } from '@/api/requests'
import { verifyPayment } from '@/api/payments'
import { useAuth } from '@/store/auth'
import type { RequestStatus, ServiceRequest } from '@/types'

const ACTIVE_STATUSES: RequestStatus[] = ['pending', 'assigned', 'accepted', 'en_route', 'arrived']

const STATUS_META: Record<RequestStatus, { label: string; tone: string }> = {
  pending:     { label: 'Finding driver',    tone: 'bg-amber-100 text-amber-800' },
  assigned:    { label: 'Offering to driver',tone: 'bg-amber-100 text-amber-800' },
  accepted:    { label: 'Driver assigned',   tone: 'bg-blue-100 text-blue-800' },
  en_route:    { label: 'En route',          tone: 'bg-blue-100 text-blue-800' },
  arrived:     { label: 'Driver arrived',    tone: 'bg-purple-100 text-purple-800' },
  completed:   { label: 'Completed',         tone: 'bg-green-100 text-green-800' },
  cancelled:   { label: 'Cancelled',         tone: 'bg-red-100 text-red-800' },
  unfulfilled: { label: 'Unfulfilled',       tone: 'bg-red-100 text-red-800' },
}

const WASTE_ICON: Record<string, string> = {
  septic: '🚽', soak_pit: '🕳️', industrial: '🏭',
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function CustomerDashboard() {
  const user = useAuth((s) => s.user)
  const navigate = useNavigate()

  const [params, setParams] = useSearchParams()
  const paystackRef = params.get('reference') ?? params.get('trxref')
  const verifyMut = useMutation({
    mutationFn: (ref: string) => verifyPayment(ref),
    onSuccess: (p) => { setParams({}, { replace: true }); navigate(`/customer/requests/${p.request}`, { replace: true }) },
    onError: () => setParams({}, { replace: true }),
  })
  useEffect(() => {
    if (paystackRef && !verifyMut.isPending && !verifyMut.isSuccess) verifyMut.mutate(paystackRef)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paystackRef])

  // Poll while a job is in flight so a driver completing/declining updates the
  // dashboard (and frees the "New request" gate) even when the WebSocket is down.
  const list = useQuery({
    queryKey: ['requests', 'mine'],
    queryFn: fetchMyRequests,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => ACTIVE_STATUSES.includes(r.status)) ? 12_000 : false,
    refetchOnWindowFocus: true,
  })
  const requests = list.data ?? []
  const active = requests.find((r) => ACTIVE_STATUSES.includes(r.status))
  const completed = requests.filter((r) => r.status === 'completed')
  const totalSpent = completed.reduce((s, r) => s + Number(r.quote_total), 0)
  const recent = [...requests]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 5)

  const firstName = user?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="space-y-5 pb-12">

      {/* ── Top bar ── */}
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <p className="text-xs text-charcoal/45 mb-1">{getGreeting()},</p>
          <h1 className="font-heading text-[28px] text-charcoal tracking-[-0.4px] leading-none">
            {firstName} <span className="text-[22px]">👋</span>
          </h1>
          <p className="text-sm text-charcoal/45 mt-1.5">Here's what's happening with your pickups.</p>
        </div>
        {active ? (
          <span
            title="Complete or cancel your active job first"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary/40 text-white text-sm font-medium rounded-lg cursor-not-allowed select-none"
          >
            <span className="text-base leading-none">+</span> New request
          </span>
        ) : (
          <Link
            to="/customer/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition whitespace-nowrap"
          >
            <span className="text-base leading-none">+</span> New request
          </Link>
        )}
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: '🗂', label: 'Total jobs', value: String(requests.length), ghs: null },
          { icon: '⚡', label: 'Active', value: active ? '1' : '0', ghs: null },
          { icon: '✅', label: 'Completed', value: String(completed.length), ghs: null },
          { icon: '💰', label: 'Total spent', value: null, ghs: totalSpent.toFixed(0) },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white border border-charcoal/8 rounded-xl px-5 py-4 flex items-center gap-4"
          >
            <span className="text-xl flex-shrink-0">{s.icon}</span>
            <div>
              <p className="text-[9.5px] uppercase tracking-[1.8px] text-charcoal/45 font-medium mb-0.5">{s.label}</p>
              {s.ghs != null ? (
                <p className="font-heading text-[24px] leading-none text-charcoal">
                  <span className="font-sans text-xs font-normal text-charcoal/40 mr-0.5">GHS</span>
                  {s.ghs}
                </p>
              ) : (
                <p className="font-heading text-[24px] leading-none text-charcoal">{s.value}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── CTA / Active job banner ── */}
      {active ? (
        <ActiveJobBanner req={active} />
      ) : (
        <div className="bg-primary rounded-2xl overflow-hidden relative">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 60% 150% at 110% 50%, rgba(93,212,160,0.10) 0%, transparent 55%)' }}
          />
          <div className="relative flex items-center justify-between gap-6 px-7 py-6">
            <div>
              <p className="text-[9px] uppercase tracking-[2.5px] text-[#7aad8e] font-medium mb-1.5">Ready when you are</p>
              <h2 className="font-heading text-[22px] text-white mb-1.5 tracking-[-0.3px]">Need a pickup?</h2>
              <p className="text-sm text-white/50 max-w-md">
                Tell us your location, waste type, and tank size. We'll match the closest verified driver in minutes.
              </p>
            </div>
            <Link
              to="/customer/new"
              className="flex-shrink-0 px-5 py-2.5 bg-white text-primary font-semibold text-sm rounded-lg hover:bg-[#c8e6d4] transition whitespace-nowrap"
            >
              Start request →
            </Link>
          </div>
        </div>
      )}

      {/* ── Bottom grid: recent requests + tips ── */}
      <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">

        {/* Recent requests */}
        <div className="bg-white border border-charcoal/8 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-charcoal/6 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-charcoal">Recent requests</h2>
            <Link to="/customer/requests" className="text-sm text-primary font-medium hover:underline">
              View all →
            </Link>
          </div>

          {list.isLoading ? (
            <div className="p-6 text-sm text-charcoal/50">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-4xl">📭</div>
              <p className="mt-2 text-sm text-charcoal/50">No requests yet.</p>
            </div>
          ) : (
            <ul>
              {recent.map((r) => (
                <li key={r.id} className="border-b border-charcoal/5 last:border-b-0">
                  <Link
                    to={`/customer/requests/${r.id}`}
                    className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-[#faf8f4] transition"
                  >
                    <div className="w-9 h-9 rounded-[10px] bg-charcoal/5 flex items-center justify-center text-base flex-shrink-0">
                      {WASTE_ICON[r.waste_type] || '🛢️'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-medium text-charcoal">
                        #{r.id} · {r.waste_type.replace('_', ' ')} · {r.volume_tier}
                      </p>
                      <p className="text-xs text-charcoal/45 mt-0.5 truncate">
                        {r.pickup_address || `${r.pickup_lat}, ${r.pickup_lng}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.5px] ${STATUS_META[r.status].tone}`}>
                        {STATUS_META[r.status].label}
                      </span>
                      <p className="text-xs text-charcoal/45 mt-1">GHS {r.quote_total} · {formatDate(r.created_at)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tips */}
        <div className="space-y-3">
          {[
            { icon: '📍', title: 'Pin your location', desc: 'Drop a precise pin on the map for faster, accurate matches.' },
            { icon: '⭐', title: 'Rate your driver', desc: 'After every job, share feedback to keep our network top-quality.' },
            { icon: '📱', title: 'Pay with MoMo', desc: 'MTN, Vodafone, AirtelTigo all supported via Paystack.' },
          ].map((t) => (
            <div
              key={t.title}
              className="bg-white border border-charcoal/8 rounded-xl px-4 py-4 flex items-start gap-3.5 hover:border-[#7aad8e] transition"
            >
              <div className="w-9 h-9 rounded-[10px] bg-charcoal/5 flex items-center justify-center text-[17px] flex-shrink-0">
                {t.icon}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-charcoal">{t.title}</p>
                <p className="text-xs text-charcoal/50 leading-relaxed mt-0.5">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ActiveJobBanner({ req }: { req: ServiceRequest }) {
  const meta = STATUS_META[req.status]
  return (
    <div className="bg-primary rounded-2xl overflow-hidden relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 150% at 110% 50%, rgba(93,212,160,0.10) 0%, transparent 55%)' }}
      />
      <div className="relative px-7 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[9px] uppercase tracking-[2.5px] text-[#7aad8e] font-medium mb-1.5">Active job</p>
            <h2 className="font-heading text-[22px] text-white tracking-[-0.3px]">Request #{req.id}</h2>
            <p className="text-sm text-white/50 mt-1">
              {req.waste_type.replace('_', ' ')} · {req.volume_tier} · {req.pickup_address || 'Location pinned'}
            </p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase ${meta.tone}`}>
            {meta.label}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: 'Quote', value: `GHS ${req.quote_total}` },
            { label: 'Driver', value: req.driver?.user.full_name || req.driver?.user.phone || 'Searching…' },
            { label: 'Vehicle', value: req.driver?.vehicle_reg || '—' },
          ].map((m) => (
            <div key={m.label} className="bg-white/10 border border-white/15 rounded-xl px-3 py-3 sm:px-4 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-medium">{m.label}</p>
              <p className="mt-0.5 font-semibold text-white text-sm truncate">{m.value}</p>
            </div>
          ))}
        </div>
        <Link
          to={`/customer/requests/${req.id}`}
          className="mt-5 inline-flex items-center gap-2 bg-accent text-charcoal font-bold px-5 py-2.5 rounded-lg hover:brightness-110 transition text-sm"
        >
          Track this job →
        </Link>
      </div>
    </div>
  )
}
