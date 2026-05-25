import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchRequest } from '@/api/requests'
import { initPayment, verifyPayment } from '@/api/payments'
import type { Payment } from '@/api/payments'

const WASTE_ICON: Record<string, string> = {
  septic: '🚽',
  soak_pit: '🕳️',
  industrial: '🏭',
}

export function CustomerPay() {
  const { id } = useParams<{ id: string }>()
  const requestId = Number(id)
  const navigate = useNavigate()
  const [payment, setPayment] = useState<Payment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const initiated = useRef(false)

  const reqQuery = useQuery({
    queryKey: ['request', requestId],
    queryFn: () => fetchRequest(requestId),
    enabled: Number.isFinite(requestId),
  })

  const initMut = useMutation({
    mutationFn: () => initPayment(requestId),
    onSuccess: (p) => {
      setPayment(p)
      if (p.status === 'succeeded') {
        navigate(`/customer/requests/${requestId}`, { replace: true, state: { justPaid: true } })
        return
      }
      if (p.paystack_authorization_url && !p.paystack_authorization_url.includes('mock')) {
        window.location.href = p.paystack_authorization_url
      }
    },
    onError: (err: Error & { response?: { data?: { detail?: string } } }) => {
      setError(err.response?.data?.detail ?? 'Could not start payment.')
    },
  })

  const verifyMut = useMutation({
    mutationFn: (ref: string) => verifyPayment(ref),
    onSuccess: (p) => {
      setPayment(p)
      if (p.status === 'succeeded') {
        navigate(`/customer/requests/${requestId}`, { replace: true, state: { justPaid: true } })
      }
    },
  })

  useEffect(() => {
    if (!initiated.current && Number.isFinite(requestId)) {
      initiated.current = true
      initMut.mutate()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (reqQuery.isLoading)
    return <p className="text-charcoal/60">Loading…</p>
  if (!reqQuery.data) return <p className="text-charcoal/60">Request not found.</p>

  const sr = reqQuery.data
  const status = payment?.status

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        to={`/customer/requests/${requestId}`}
        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
      >
        ← Back to request
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary to-[#084d29] text-white rounded-2xl p-6 md:p-8 shadow-lg">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative">
          <div className="text-xs uppercase tracking-widest text-accent font-bold">
            Secure payment
          </div>
          <h1 className="mt-2 font-heading text-3xl md:text-4xl font-extrabold">
            Pay GHS {sr.quote_total}
          </h1>
          <div className="mt-3 flex items-center gap-3 text-sm text-white/85">
            <span className="w-9 h-9 rounded-lg bg-white/15 grid place-items-center text-lg">
              {WASTE_ICON[sr.waste_type] || '🛢️'}
            </span>
            <span>
              Request #{sr.id} · {sr.waste_type.replace('_', ' ')} · {sr.volume_tier}
            </span>
          </div>
        </div>
      </div>

      {/* Order summary */}
      <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm p-6">
        <h2 className="font-heading font-bold text-lg">Order summary</h2>
        <div className="mt-4 space-y-2 text-sm text-charcoal/80">
          <Row label="Base fee" value={`GHS ${sr.quote_base_fee}`} />
          <Row
            label={`Distance (${Number(sr.quote_distance_km).toFixed(1)} km)`}
            value={`GHS ${sr.quote_distance_fee}`}
          />
          <Row label="Tank size fee" value={`GHS ${sr.quote_tier_fee}`} />
        </div>
        <div className="mt-3 pt-3 border-t border-charcoal/10 flex justify-between items-center">
          <span className="font-bold text-charcoal">Total due</span>
          <span className="font-heading text-2xl font-extrabold text-primary">
            GHS {sr.quote_total}
          </span>
        </div>
      </section>

      {/* Payment status card */}
      <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm p-6">
        {!payment && initMut.isPending && (
          <PreparingState />
        )}

        {status === 'succeeded' && (
          <SuccessState />
        )}

        {status === 'pending' && payment && (
          <PendingState
            authUrl={payment.paystack_authorization_url}
            onVerify={() => verifyMut.mutate(payment.paystack_reference)}
            verifying={verifyMut.isPending}
          />
        )}

        {status === 'failed' && (
          <FailedState onRetry={() => initMut.mutate()} retrying={initMut.isPending} />
        )}

        {error && !status && (
          <div className="text-center py-6">
            <div className="text-4xl">⚠️</div>
            <h3 className="mt-3 font-bold text-charcoal">Could not start payment</h3>
            <p className="mt-1 text-sm text-red-700 max-w-sm mx-auto">{error}</p>
            <button
              onClick={() => {
                setError(null)
                initMut.mutate()
              }}
              className="mt-4 bg-primary text-white font-bold px-5 py-2.5 rounded-lg hover:bg-primary/90 transition"
            >
              Try again
            </button>
          </div>
        )}

        {/* Trust */}
        <div className="mt-6 pt-5 border-t border-charcoal/5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-charcoal/60">
          <span className="flex items-center gap-1.5">🔒 256-bit secure checkout</span>
          <span className="flex items-center gap-1.5">📱 MoMo · 💳 Card</span>
          <span className="flex items-center gap-1.5">⚡ Powered by Paystack</span>
        </div>
      </section>

      <div className="text-center">
        <button
          onClick={() => navigate(`/customer/requests/${requestId}`)}
          className="text-sm text-charcoal/60 hover:text-charcoal underline"
        >
          Skip and view request status
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="font-semibold text-charcoal">{value}</span>
    </div>
  )
}

function PreparingState() {
  return (
    <div className="text-center py-8">
      <div className="inline-flex w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      <h3 className="mt-4 font-bold text-charcoal">Preparing your payment…</h3>
      <p className="mt-1 text-sm text-charcoal/60">This usually takes a second.</p>
    </div>
  )
}

function SuccessState() {
  return (
    <div className="text-center py-8">
      <div className="inline-grid place-items-center w-14 h-14 rounded-full bg-green-100 text-green-700 text-2xl">
        ✓
      </div>
      <h3 className="mt-4 font-heading font-extrabold text-lg text-charcoal">
        Payment received
      </h3>
      <p className="mt-1 text-sm text-charcoal/70">
        Thanks! The driver will be paid out shortly.
      </p>
    </div>
  )
}

function PendingState({
  authUrl,
  onVerify,
  verifying,
}: {
  authUrl: string | undefined
  onVerify: () => void
  verifying: boolean
}) {
  return (
    <div>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 grid place-items-center text-xl flex-shrink-0">
          ⏳
        </div>
        <div>
          <h3 className="font-heading font-bold text-charcoal">
            Redirecting to secure payment…
          </h3>
          <p className="mt-1 text-sm text-charcoal/70">
            You will be redirected to Paystack. After paying you will return here automatically.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        {authUrl && (
          <a
            href={authUrl}
            className="bg-primary text-white font-bold px-5 py-2.5 rounded-lg hover:bg-primary/90 transition"
          >
            Go to Paystack →
          </a>
        )}
        <button
          onClick={onVerify}
          disabled={verifying}
          className="bg-accent text-charcoal font-bold px-5 py-2.5 rounded-lg hover:brightness-110 disabled:opacity-60 transition"
        >
          {verifying ? 'Verifying…' : "I've paid — verify"}
        </button>
      </div>
    </div>
  )
}

function FailedState({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="text-center py-6">
      <div className="inline-grid place-items-center w-14 h-14 rounded-full bg-red-100 text-red-700 text-2xl">
        ✕
      </div>
      <h3 className="mt-4 font-heading font-extrabold text-lg text-charcoal">
        Payment failed
      </h3>
      <p className="mt-1 text-sm text-charcoal/70">
        Your card or wallet was declined. No funds were taken.
      </p>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="mt-4 bg-primary text-white font-bold px-5 py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-60 transition"
      >
        {retrying ? 'Retrying…' : 'Try again'}
      </button>
    </div>
  )
}
