import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchDisputes,
  forceComplete,
  forcePayout,
  forceRefund,
  requestCancelReason,
  sendDisputeMessage,
  type Dispute,
  type DisputeThreadMessage,
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

  const payout = useMutation({
    mutationFn: forcePayout,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'disputes'] }),
  })
  const complete = useMutation({
    mutationFn: forceComplete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'disputes'] }),
  })

  const counts = { failed_payout: 0, stuck_payout: 0, refund_pending: 0 } as Record<Dispute['kind'], number>
  list.data?.forEach((d) => { counts[d.kind] = (counts[d.kind] || 0) + 1 })

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

      {list.data?.length ? (
        <div className="grid sm:grid-cols-3 gap-4">
          {(Object.keys(KIND_META) as Dispute['kind'][]).map((k) => {
            const meta = KIND_META[k]
            return (
              <div key={k} className="bg-white border border-charcoal/5 rounded-2xl p-5 shadow-sm">
                <div className={`w-10 h-10 rounded-xl ${meta.tone} grid place-items-center text-lg`}>{meta.icon}</div>
                <div className="mt-3 text-xs uppercase tracking-wider text-charcoal/60 font-semibold">{meta.label}</div>
                <div className="mt-1 font-heading text-2xl font-extrabold text-charcoal">{counts[k] || 0}</div>
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
            onPayout={() => payout.mutate(d.request_id)}
            onComplete={() => complete.mutate(d.request_id)}
            onRefunded={() => qc.invalidateQueries({ queryKey: ['admin', 'disputes'] })}
          />
        ))}
      </div>
    </div>
  )
}

// ── Dispute Card ─────────────────────────────────────────────────────────────

function DisputeCard({
  dispute,
  onPayout,
  onRefunded,
}: {
  dispute: Dispute
  onPayout: () => void
  onComplete: () => void
  onRefunded: () => void
}) {
  const meta = KIND_META[dispute.kind]
  const [showThread, setShowThread] = useState(false)
  const [showRefundModal, setShowRefundModal] = useState(false)

  return (
    <div className={`bg-white border rounded-2xl shadow-sm hover:shadow-md transition ${meta.ring}`}>
      {/* ── Card header ── */}
      <div className="p-5 flex flex-wrap justify-between items-start gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl ${meta.tone} grid place-items-center text-lg flex-shrink-0`}>
            {meta.icon}
          </div>
          <div className="flex-1 min-w-0">
            {/* Kind + timestamp + age */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${meta.tone}`}>
                {meta.label}
              </span>
              <span className="text-xs text-charcoal/50">
                {new Date(dispute.created_at).toLocaleString()}
              </span>
              {dispute.days_pending != null && (
                <span className="text-xs font-semibold text-red-600">
                  {dispute.days_pending === 0 ? 'today' : `${dispute.days_pending}d pending`}
                </span>
              )}
            </div>

            {/* Request ID */}
            <h3 className="font-bold text-lg mt-1.5 text-charcoal">Request #{dispute.request_id}</h3>

            {/* Amount + contact info */}
            <p className="text-sm text-charcoal/70 mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
              <span className="font-bold text-charcoal">GHS {dispute.amount}</span>
              {dispute.customer_name && <span>{dispute.customer_name}</span>}
              {dispute.customer_phone && (
                <a href={`tel:${dispute.customer_phone}`} className="text-primary hover:underline font-mono text-xs">
                  {dispute.customer_phone}
                </a>
              )}
              {dispute.driver_phone && (
                <a href={`tel:${dispute.driver_phone}`} className="text-primary hover:underline font-mono text-xs">
                  {dispute.driver_phone}
                </a>
              )}
            </p>

            {/* MoMo number for refunds */}
            {dispute.kind === 'refund_pending' && dispute.momo_number && (
              <MoMoCopy number={dispute.momo_number} />
            )}

            {/* Payment reference */}
            {dispute.payment_reference && (
              <p className="text-xs text-charcoal/50 mt-1 font-mono">
                Ref: {dispute.payment_reference}
              </p>
            )}

            {/* Cancel reason */}
            {dispute.kind === 'refund_pending' && dispute.cancel_reason && (
              <div className="mt-2 text-sm text-charcoal/80 bg-charcoal/5 px-3 py-2 rounded-lg">
                <span className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide mr-1">Reason:</span>
                {dispute.cancel_reason}
              </div>
            )}

            {/* No cancel reason gate */}
            {dispute.kind === 'refund_pending' && !dispute.has_cancel_reason && (
              <NoCancelReasonBanner requestId={dispute.request_id} />
            )}

            <p className="mt-2 text-xs text-charcoal/60 italic">{meta.desc}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 min-w-[160px]">
          {dispute.kind === 'refund_pending' && (
            <>
              <button
                onClick={() => setShowThread((v) => !v)}
                className="border border-charcoal/15 text-charcoal px-4 py-2 rounded-lg text-sm font-medium hover:bg-charcoal/5 transition flex items-center justify-center gap-1.5"
              >
                {showThread ? 'Hide thread' : `Thread${dispute.thread_messages?.length ? ` (${dispute.thread_messages.length})` : ''}`}
              </button>
              <button
                onClick={() => setShowRefundModal(true)}
                disabled={!dispute.has_cancel_reason}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                title={!dispute.has_cancel_reason ? 'Request cancel reason first' : undefined}
              >
                Force refund
              </button>
            </>
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

      {/* ── Thread panel ── */}
      {showThread && dispute.kind === 'refund_pending' && (
        <DisputeThreadPanel
          requestId={dispute.request_id}
          initialMessages={dispute.thread_messages ?? []}
          customerPhone={dispute.customer_phone}
        />
      )}

      {/* ── Force refund modal ── */}
      {showRefundModal && (
        <ForceRefundModal
          dispute={dispute}
          onClose={() => setShowRefundModal(false)}
          onDone={() => { setShowRefundModal(false); onRefunded() }}
        />
      )}
    </div>
  )
}

// ── MoMo copy button ──────────────────────────────────────────────────────────

function MoMoCopy({ number }: { number: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(number)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="text-xs text-charcoal/60">MoMo:</span>
      <code className="text-sm font-bold text-charcoal">{number}</code>
      <button
        onClick={copy}
        className="text-xs text-primary hover:underline"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}

// ── No cancel reason banner ───────────────────────────────────────────────────

function NoCancelReasonBanner({ requestId }: { requestId: number }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => requestCancelReason(requestId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'disputes'] }),
  })
  return (
    <div className="mt-2 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      <span className="text-amber-600 text-sm">⚠ No cancellation reason on record.</span>
      <button
        onClick={() => mut.mutate()}
        disabled={mut.isPending || mut.isSuccess}
        className="ml-auto text-xs font-semibold text-amber-700 border border-amber-300 bg-white px-3 py-1 rounded-lg hover:bg-amber-50 transition disabled:opacity-60 whitespace-nowrap"
      >
        {mut.isPending ? 'Sending…' : mut.isSuccess ? 'SMS sent ✓' : 'Request reason'}
      </button>
    </div>
  )
}

// ── Dispute thread panel ──────────────────────────────────────────────────────

function DisputeThreadPanel({
  requestId,
  initialMessages,
  customerPhone,
}: {
  requestId: number
  initialMessages: DisputeThreadMessage[]
  customerPhone?: string
}) {
  const qc = useQueryClient()
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const send = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('message', message)
      if (file) fd.append('receipt', file)
      return sendDisputeMessage(requestId, fd)
    },
    onSuccess: () => {
      setMessage('')
      setFile(null)
      setPreview(null)
      qc.invalidateQueries({ queryKey: ['admin', 'disputes'] })
    },
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    if (f && f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f)
      setPreview(url)
    } else {
      setPreview(null)
    }
  }

  const messages = initialMessages

  return (
    <div className="border-t border-charcoal/8 px-5 pb-5 pt-4 space-y-4">
      <p className="text-xs font-semibold text-charcoal/50 uppercase tracking-wider">Dispute thread</p>

      {/* Messages */}
      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-charcoal/40 italic">No messages yet. Send one below.</p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} side="admin" />
        ))}
      </div>

      {/* Compose */}
      <div className="space-y-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Message to ${customerPhone ?? 'customer'} (sent via SMS + in-app)…`}
          rows={3}
          className="w-full border border-charcoal/15 rounded-xl px-3 py-2.5 text-sm text-charcoal resize-none outline-none focus:border-primary/50 transition"
        />

        {/* Receipt upload */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs border border-charcoal/15 rounded-lg px-3 py-1.5 hover:bg-charcoal/5 transition text-charcoal/70"
          >
            {file ? file.name : '+ Attach receipt'}
          </button>
          {file && (
            <button
              type="button"
              onClick={() => { setFile(null); setPreview(null) }}
              className="text-xs text-red-500 hover:underline"
            >
              Remove
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
        </div>

        {/* Receipt preview */}
        {preview && (
          <img src={preview} alt="Receipt preview" className="max-h-32 rounded-lg border border-charcoal/10 object-contain" />
        )}

        {send.isError && (
          <p className="text-xs text-red-600">Failed to send. Try again.</p>
        )}

        <button
          onClick={() => send.mutate()}
          disabled={send.isPending || !message.trim()}
          className="bg-primary text-white text-sm font-bold px-5 py-2 rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
        >
          {send.isPending ? 'Sending…' : 'Send & notify customer'}
        </button>
      </div>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: DisputeThreadMessage; side?: 'admin' | 'customer' }) {
  const isAdmin = msg.sender_type === 'admin'
  return (
    <div className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm space-y-1.5 ${
        isAdmin
          ? 'bg-primary text-white rounded-br-sm'
          : 'bg-charcoal/8 text-charcoal rounded-bl-sm'
      }`}>
        <p className={`text-[10px] font-semibold opacity-70 ${isAdmin ? 'text-right' : ''}`}>
          {msg.sender_name}
        </p>
        <p className="leading-relaxed">{msg.content}</p>
        {msg.attachment_url && (
          <a
            href={msg.attachment_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-[11px] underline block ${isAdmin ? 'text-white/80' : 'text-primary'}`}
          >
            View receipt
          </a>
        )}
        <p className={`text-[10px] opacity-50 ${isAdmin ? 'text-right' : ''}`}>
          {new Date(msg.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      </div>
    </div>
  )
}

// ── Force refund modal ────────────────────────────────────────────────────────

function ForceRefundModal({
  dispute,
  onClose,
  onDone,
}: {
  dispute: Dispute
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: () => forceRefund(dispute.request_id, reason),
    onSuccess: onDone,
    onError: (e: { response?: { data?: { reason?: string[]; detail?: string } } }) => {
      const d = e.response?.data
      setError(d?.reason?.[0] ?? d?.detail ?? 'Something went wrong.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-heading font-bold text-xl text-charcoal">Force refund — Request #{dispute.request_id}</h2>
        <div className="bg-charcoal/5 rounded-xl p-4 text-sm space-y-1">
          <p><span className="text-charcoal/50">Customer:</span> {dispute.customer_name} · {dispute.customer_phone}</p>
          <p><span className="text-charcoal/50">MoMo:</span> {dispute.momo_number}</p>
          <p><span className="text-charcoal/50">Amount:</span> GHS {dispute.amount}</p>
          <p><span className="text-charcoal/50">Cancel reason:</span> {dispute.cancel_reason || '—'}</p>
        </div>
        <p className="text-sm text-charcoal/70">
          This marks the payment as <strong>refunded</strong> in the system. Confirm you have already sent the money to the customer's MoMo.
        </p>
        <div>
          <label className="text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1 block">
            Audit note (required)
          </label>
          <textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(null) }}
            placeholder="e.g. Sent GHS 171.06 to 0556782728 via MTN MoMo, receipt uploaded in thread."
            rows={3}
            className="w-full border border-charcoal/15 rounded-xl px-3 py-2.5 text-sm resize-none outline-none focus:border-primary/50 transition"
          />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-charcoal/15 text-sm font-medium text-charcoal hover:bg-charcoal/5 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !reason.trim()}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition"
          >
            {mut.isPending ? 'Processing…' : 'Confirm refund'}
          </button>
        </div>
      </div>
    </div>
  )
}
