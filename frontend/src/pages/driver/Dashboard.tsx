import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMyDriver } from '@/api/drivers'
import {
  acceptOffer,
  declineOffer,
  fetchActiveRequest,
  fetchCurrentOffer,
  fetchDriverPendingRating,
  setDriverOnline,
  transitionStatus,
} from '@/api/requests'
import { useDriverSocket } from '@/hooks/useRequestSocket'
import { useLocationBroadcaster } from '@/hooks/useLocationBroadcaster'
import { RatingForm } from '@/components/RatingForm'
import type { RequestStatus } from '@/types'

const NEXT_STATUS: Record<RequestStatus, RequestStatus | null> = {
  accepted: 'en_route',
  en_route: 'arrived',
  arrived: 'completed',
  pending: null,
  assigned: null,
  completed: null,
  cancelled: null,
  unfulfilled: null,
}

const STATUS_LABEL: Partial<Record<RequestStatus, string>> = {
  en_route: 'Mark en route',
  arrived: 'Mark arrived',
  completed: 'Mark completed',
}

export function DriverDashboard() {
  const qc = useQueryClient()
  const driver = useQuery({ queryKey: ['driver', 'me'], queryFn: fetchMyDriver, retry: false })
  const isApproved = driver.data?.status === 'approved'
  const [busy, setBusy] = useState(false)

  const offerQuery = useQuery({
    queryKey: ['driver', 'offer'],
    queryFn: fetchCurrentOffer,
    enabled: isApproved && !!driver.data?.is_online,
    refetchInterval: 5000,
  })

  const activeQuery = useQuery({
    queryKey: ['driver', 'active'],
    queryFn: fetchActiveRequest,
    enabled: isApproved,
    refetchInterval: 8000,
  })

  const pendingRatingQuery = useQuery({
    queryKey: ['driver', 'pending-rating'],
    queryFn: fetchDriverPendingRating,
    enabled: isApproved && !activeQuery.data,
    refetchInterval: 30000,
  })

  // Broadcast GPS while online with an active job.
  useLocationBroadcaster(
    isApproved && !!driver.data?.is_online && !!activeQuery.data,
  )

  // Subscribe to driver WS to nudge offer refetch faster than polling
  const wsEvent = useDriverSocket(isApproved && !!driver.data?.is_online)
  useEffect(() => {
    if (wsEvent?.type === 'offer.new') {
      qc.invalidateQueries({ queryKey: ['driver', 'offer'] })
    }
  }, [wsEvent, qc])

  const onlineMut = useMutation({
    mutationFn: async (turnOn: boolean) => {
      let lat: number | undefined
      let lng: number | undefined
      if (turnOn && navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              lat = pos.coords.latitude
              lng = pos.coords.longitude
              resolve()
            },
            () => resolve(),
            { timeout: 5000 },
          )
        })
      }
      return setDriverOnline({ is_online: turnOn, lat, lng })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver', 'me'] }),
  })

  const acceptMut = useMutation({
    mutationFn: (assignmentId: number) => acceptOffer(assignmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver', 'offer'] })
      qc.invalidateQueries({ queryKey: ['driver', 'active'] })
    },
  })

  const declineMut = useMutation({
    mutationFn: (assignmentId: number) => declineOffer(assignmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver', 'offer'] }),
  })

  const statusMut = useMutation({
    mutationFn: ({ id, next }: { id: number; next: RequestStatus }) =>
      transitionStatus(id, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver', 'active'] }),
  })

  if (driver.isLoading) return <p>Loading…</p>
  if (!driver.data) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold">Welcome, driver</h1>
        <p className="mt-2 text-charcoal/70">Complete onboarding to start.</p>
        <Link
          to="/driver/onboard"
          className="mt-4 inline-block bg-primary text-white px-5 py-2.5 rounded-md font-semibold"
        >
          Start onboarding →
        </Link>
      </div>
    )
  }

  if (!isApproved) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold">Awaiting approval</h1>
        <p className="mt-2 text-charcoal/70">
          Status: <span className="font-semibold uppercase">{driver.data.status}</span>
        </p>
        <Link to="/driver/onboard" className="mt-4 inline-block text-primary underline">
          Update profile and documents
        </Link>
      </div>
    )
  }

  const offer = offerQuery.data
  const active = activeQuery.data

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-extrabold">Driver dashboard</h1>
        <button
          disabled={onlineMut.isPending || busy}
          onClick={() => {
            setBusy(true)
            onlineMut.mutate(!driver.data.is_online, {
              onSettled: () => setBusy(false),
            })
          }}
          className={`px-4 py-2 rounded-md font-semibold transition ${
            driver.data.is_online
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-charcoal/10 text-charcoal hover:bg-charcoal/20'
          }`}
        >
          {driver.data.is_online ? '● Online — tap to go offline' : '○ Tap to go online'}
        </button>
      </div>

      {active && (
        <section className="mt-6 card border-primary/40 bg-primary/5">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs uppercase tracking-wider text-primary font-bold">
                Active job
              </div>
              <h2 className="mt-1 text-xl font-bold">
                #{active.id} · {active.waste_type.replace('_', ' ')} · {active.volume_tier}
              </h2>
              <p className="mt-1 text-sm text-charcoal/70">
                {active.pickup_address || `${active.pickup_lat}, ${active.pickup_lng}`}
              </p>
              {active.notes && (
                <p className="mt-1 text-sm">📝 {active.notes}</p>
              )}
              <p className="mt-2 text-sm">
                Earnings (after commission):{' '}
                <span className="font-bold">
                  GHS {(Number(active.quote_total) - Number(active.commission_amount)).toFixed(2)}
                </span>
              </p>
            </div>
            <div className="text-right">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold uppercase bg-amber-100 text-amber-800">
                {active.status.replace('_', ' ')}
              </span>
            </div>
          </div>
          {NEXT_STATUS[active.status] && (
            <button
              onClick={() =>
                statusMut.mutate({ id: active.id, next: NEXT_STATUS[active.status]! })
              }
              disabled={statusMut.isPending}
              className="mt-4 bg-accent text-charcoal font-bold px-5 py-2.5 rounded-md hover:brightness-110 disabled:opacity-60"
            >
              {STATUS_LABEL[NEXT_STATUS[active.status]!]}
            </button>
          )}
        </section>
      )}

      {!active && offer && (
        <section className="mt-6 card border-accent/60 bg-accent/10">
          <div className="text-xs uppercase tracking-wider text-accent font-bold">
            Incoming offer
          </div>
          <h2 className="mt-1 text-xl font-bold">
            {offer.request.waste_type.replace('_', ' ')} · {offer.request.volume_tier}
          </h2>
          <p className="text-sm text-charcoal/70">
            {offer.distance_km.toFixed(2)} km away ·{' '}
            {offer.request.pickup_address || 'Location pinned on map'}
          </p>
          <p className="mt-2 text-sm">
            Quote: <span className="font-bold">GHS {offer.request.quote_total}</span>
          </p>
          <p className="text-xs text-charcoal/50">
            Expires at {new Date(offer.expires_at).toLocaleTimeString()}
          </p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => acceptMut.mutate(offer.assignment_id)}
              disabled={acceptMut.isPending}
              className="bg-primary text-white px-5 py-2 rounded-md font-bold hover:bg-primary/90"
            >
              Accept
            </button>
            <button
              onClick={() => declineMut.mutate(offer.assignment_id)}
              disabled={declineMut.isPending}
              className="bg-white border border-charcoal/20 px-5 py-2 rounded-md font-medium hover:bg-charcoal/5"
            >
              Decline
            </button>
          </div>
        </section>
      )}

      {!active && pendingRatingQuery.data && (
        <section className="mt-6">
          <p className="text-sm text-charcoal/70">
            Rate the customer for completed job #{pendingRatingQuery.data.id}.
          </p>
          <RatingForm
            requestId={pendingRatingQuery.data.id}
            label="Rate the customer"
          />
        </section>
      )}

      {!active && !offer && !pendingRatingQuery.data && driver.data.is_online && (
        <p className="mt-6 text-charcoal/60">Waiting for jobs nearby…</p>
      )}
      {!driver.data.is_online && (
        <p className="mt-6 text-charcoal/60">
          You're offline. Toggle online above to start receiving jobs.
        </p>
      )}
    </div>
  )
}
