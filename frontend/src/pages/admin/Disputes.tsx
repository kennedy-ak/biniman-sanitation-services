import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchDisputes,
  forceComplete,
  forcePayout,
  forceRefund,
  type Dispute,
} from '@/api/analytics'
import { EmptyState, PageHeader } from '@/components/admin/PageHeader'

const KIND_META: Record<
  Dispute['kind'],
  { label: string; icon: string; tone: string; ring: string; desc: string }
> = {
  failed_payout: {
    label: 'Failed payout',
    icon: '⚠️',
    tone: 'bg-red-100 text-red-700',
    ring: 'border-red-200',
    desc: 'Paystack rejected the transfer. Investigate the recipient code.',
  },
  stuck_payout: {
    label: 'Stuck pending payout',
    icon: '⏳',
    tone: 'bg-amber-100 text-amber-700',
    ring: 'border-amber-200',
    desc: 'Transfer queued but not settled. Retry or escalate.',
  },
  refund_pending: {
    label: 'Refund pending',
    icon: '↩️',
    tone: 'bg-purple-100 text-purple-700',
    ring: 'border-purple-200',
    desc: 'Cancelled or unfulfilled paid request still owes a refund.',
  },
}

export function AdminDisputes() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['admin', 'disputes'], queryFn: fetchDisputes })

  const refund = useMutation({
    mutationFn: forceRefund,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'disputes'] }),
  })
  const payout = useMutation({
    mutationFn: forcePayout,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'disputes'] }),
  })
  const complete = useMutation({
    mutationFn: forceComplete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'disputes'] }),
  })

  const counts = {
    failed_payout: 0,
    stuck_payout: 0,
    refund_pending: 0,
  } as Record<Dispute['kind'], number>
  list.data?.forEach((d) => {
    counts[d.kind] = (counts[d.kind] || 0) + 1
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disputes"
        subtitle="Items that need manual review: failed payouts, stuck pending payouts, and unrefunded cancelled or unfulfilled paid requests."
        icon="⚖️"
        actions={
          list.data?.length ? (
            <div className="px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-sm font-bold">
              {list.data.length} open
            </div>
          ) : null
        }
      />

      {/* Kind summary */}
      {list.data?.length ? (
        <div className="grid sm:grid-cols-3 gap-4">
          {(Object.keys(KIND_META) as Dispute['kind'][]).map((k) => {
            const meta = KIND_META[k]
            return (
              <div
                key={k}
                className="bg-white border border-charcoal/5 rounded-2xl p-5 shadow-sm"
              >
                <div className={`w-10 h-10 rounded-xl ${meta.tone} grid place-items-center text-lg`}>
                  {meta.icon}
                </div>
                <div className="mt-3 text-xs uppercase tracking-wider text-charcoal/60 font-semibold">
                  {meta.label}
                </div>
                <div className="mt-1 font-heading text-2xl font-extrabold text-charcoal">
                  {counts[k] || 0}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {list.isLoading && <p className="text-charcoal/60">Loading…</p>}
      {!list.isLoading && !list.data?.length && (
        <EmptyState
          icon="✨"
          title="Everything looks healthy"
          body="No outstanding disputes. Failed payouts and unrefunded cancellations would surface here."
        />
      )}

      <div className="space-y-3">
        {list.data?.map((d, i) => (
          <DisputeCard
            key={`${d.kind}-${d.request_id}-${i}`}
            dispute={d}
            onRefund={() => refund.mutate(d.request_id)}
            onPayout={() => payout.mutate(d.request_id)}
            onComplete={() => complete.mutate(d.request_id)}
          />
        ))}
      </div>
    </div>
  )
}

function DisputeCard({
  dispute,
  onRefund,
  onPayout,
  onComplete: _onComplete,
}: {
  dispute: Dispute
  onRefund: () => void
  onPayout: () => void
  onComplete: () => void
}) {
  const meta = KIND_META[dispute.kind]
  return (
    <div
      className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition ${meta.ring}`}
    >
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl ${meta.tone} grid place-items-center text-lg flex-shrink-0`}>
            {meta.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${meta.tone}`}
              >
                {meta.label}
              </span>
              <span className="text-xs text-charcoal/50">
                {new Date(dispute.created_at).toLocaleString()}
              </span>
            </div>
            <h3 className="font-bold text-lg mt-1.5 text-charcoal">
              Request #{dispute.request_id}
            </h3>
            <p className="text-sm text-charcoal/70 mt-0.5">
              <span className="font-bold">GHS {dispute.amount}</span>
              {dispute.driver_phone && <> · driver <code className="text-xs">{dispute.driver_phone}</code></>}
              {dispute.customer_phone && <> · customer <code className="text-xs">{dispute.customer_phone}</code></>}
              {dispute.request_status && <> · status {dispute.request_status}</>}
            </p>
            {dispute.reason && (
              <p className="mt-2 text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                {dispute.reason}
              </p>
            )}
            <p className="mt-2 text-xs text-charcoal/60 italic">{meta.desc}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-[140px]">
          {dispute.kind === 'refund_pending' && (
            <button
              onClick={onRefund}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-700 transition"
            >
              Force refund
            </button>
          )}
          {(dispute.kind === 'failed_payout' || dispute.kind === 'stuck_payout') && (
            <button
              onClick={onPayout}
              className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/90 transition"
            >
              Retry payout
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
