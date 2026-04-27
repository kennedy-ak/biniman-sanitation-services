import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminListPayments, adminListPayouts } from '@/api/payments'
import { EmptyState, PageHeader, SegmentedTabs } from '@/components/admin/PageHeader'

type Tab = 'payments' | 'payouts'

export function AdminTransactions() {
  const [tab, setTab] = useState<Tab>('payments')

  const paymentsQ = useQuery({
    queryKey: ['admin', 'payments'],
    queryFn: () => adminListPayments(),
  })
  const payoutsQ = useQuery({
    queryKey: ['admin', 'payouts'],
    queryFn: () => adminListPayouts(),
  })

  const totalPaid = (paymentsQ.data ?? [])
    .filter((p) => p.status === 'succeeded')
    .reduce((s, p) => s + Number(p.amount), 0)
  const totalRefunded = (paymentsQ.data ?? [])
    .filter((p) => p.status === 'refunded')
    .reduce((s, p) => s + Number(p.amount), 0)
  const totalPaidOut = (payoutsQ.data ?? [])
    .filter((p) => p.status === 'succeeded')
    .reduce((s, p) => s + Number(p.amount), 0)
  const totalCommission = (payoutsQ.data ?? [])
    .filter((p) => p.status === 'succeeded')
    .reduce((s, p) => s + Number(p.commission), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        subtitle="Customer payments and driver payouts. Reconcile against Paystack as needed."
        icon="💳"
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Summary label="Paid in" value={`GHS ${totalPaid.toFixed(2)}`} tone="primary" icon="↓" />
        <Summary
          label="Refunded"
          value={`GHS ${totalRefunded.toFixed(2)}`}
          tone="muted"
          icon="↩"
        />
        <Summary
          label="Paid out"
          value={`GHS ${totalPaidOut.toFixed(2)}`}
          tone="success"
          icon="↑"
        />
        <Summary
          label="Commission"
          value={`GHS ${totalCommission.toFixed(2)}`}
          tone="accent"
          icon="%"
        />
      </div>

      <SegmentedTabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'payments', label: 'Payments', count: paymentsQ.data?.length ?? 0 },
          { value: 'payouts', label: 'Payouts', count: payoutsQ.data?.length ?? 0 },
        ]}
      />

      {tab === 'payments' ? <Payments /> : <Payouts />}
    </div>
  )
}

function Summary({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: string
  tone: 'primary' | 'muted' | 'success' | 'accent'
  icon: string
}) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    muted: 'bg-charcoal/5 text-charcoal/70',
    success: 'bg-green-100 text-green-700',
    accent: 'bg-accent/15 text-amber-700',
  }
  return (
    <div className="bg-white border border-charcoal/5 rounded-2xl p-5 shadow-sm">
      <div className={`w-10 h-10 rounded-xl ${tones[tone]} grid place-items-center font-bold text-lg`}>
        {icon}
      </div>
      <div className="mt-3 text-xs uppercase tracking-wider text-charcoal/60 font-semibold">
        {label}
      </div>
      <div className="mt-1 font-heading text-2xl font-extrabold text-charcoal">
        {value}
      </div>
    </div>
  )
}

function Payments() {
  const list = useQuery({ queryKey: ['admin', 'payments'], queryFn: () => adminListPayments() })
  if (list.isLoading) return <p className="text-charcoal/60">Loading…</p>
  if (!list.data?.length)
    return (
      <EmptyState
        icon="💳"
        title="No payments yet"
        body="Customer payments will appear here once requests start being paid."
      />
    )

  return (
    <div className="bg-white border border-charcoal/5 rounded-2xl shadow-sm overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-[10px] uppercase tracking-wider text-charcoal/50 bg-charcoal/[0.02]">
          <tr>
            <th className="py-3 pl-6">Reference</th>
            <th>Request</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Status</th>
            <th className="pr-6">Paid at</th>
          </tr>
        </thead>
        <tbody>
          {list.data.map((p) => (
            <tr
              key={p.id}
              className="border-t border-charcoal/5 hover:bg-charcoal/[0.02] transition"
            >
              <td className="py-3 pl-6 font-mono text-xs text-charcoal/70">
                …{p.paystack_reference.slice(-12)}
              </td>
              <td className="font-semibold">#{p.request}</td>
              <td className="font-bold">GHS {p.amount}</td>
              <td className="capitalize text-charcoal/70">{p.method}</td>
              <td>
                <Pill value={p.status} />
              </td>
              <td className="pr-6 text-charcoal/60 text-xs">
                {p.paid_at ? new Date(p.paid_at).toLocaleString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Payouts() {
  const list = useQuery({ queryKey: ['admin', 'payouts'], queryFn: () => adminListPayouts() })
  if (list.isLoading) return <p className="text-charcoal/60">Loading…</p>
  if (!list.data?.length)
    return (
      <EmptyState
        icon="💸"
        title="No payouts yet"
        body="Driver payouts will appear here after completed jobs are settled."
      />
    )

  return (
    <div className="bg-white border border-charcoal/5 rounded-2xl shadow-sm overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-[10px] uppercase tracking-wider text-charcoal/50 bg-charcoal/[0.02]">
          <tr>
            <th className="py-3 pl-6">Transfer code</th>
            <th>Request</th>
            <th>Amount</th>
            <th>Commission</th>
            <th>Status</th>
            <th className="pr-6">Transferred</th>
          </tr>
        </thead>
        <tbody>
          {list.data.map((p) => (
            <tr
              key={p.id}
              className="border-t border-charcoal/5 hover:bg-charcoal/[0.02] transition"
            >
              <td className="py-3 pl-6 font-mono text-xs text-charcoal/70">
                {p.paystack_transfer_code ? `…${p.paystack_transfer_code.slice(-12)}` : '—'}
              </td>
              <td className="font-semibold">#{p.request}</td>
              <td className="font-bold">GHS {p.amount}</td>
              <td className="text-charcoal/70">GHS {p.commission}</td>
              <td>
                <Pill value={p.status} />
              </td>
              <td className="pr-6 text-charcoal/60 text-xs">
                {p.transferred_at ? new Date(p.transferred_at).toLocaleString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Pill({ value }: { value: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 ring-amber-200',
    succeeded: 'bg-green-100 text-green-800 ring-green-200',
    failed: 'bg-red-100 text-red-800 ring-red-200',
    refunded: 'bg-charcoal/10 text-charcoal/70 ring-charcoal/15',
  }
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1 ${map[value] ?? 'bg-charcoal/5 text-charcoal/60 ring-charcoal/10'}`}
    >
      {value}
    </span>
  )
}
