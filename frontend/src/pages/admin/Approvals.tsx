import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminDriverAction, adminListDrivers } from '@/api/drivers'
import { adminFleetAction, adminListFleets } from '@/api/fleets'
import { EmptyState, PageHeader, SegmentedTabs } from '@/components/admin/PageHeader'

type Tab = 'drivers' | 'fleets'

const DOC_LABEL: Record<string, string> = {
  national_id: 'National ID',
  driving_license: 'Driving license',
  vehicle_registration: 'Vehicle reg.',
  epa_permit: 'EPA permit',
}

export function AdminApprovals() {
  const [tab, setTab] = useState<Tab>('drivers')

  const driversQ = useQuery({
    queryKey: ['admin', 'drivers', 'pending'],
    queryFn: () => adminListDrivers('pending'),
  })
  const fleetsQ = useQuery({
    queryKey: ['admin', 'fleets', 'pending'],
    queryFn: () => adminListFleets('pending'),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        subtitle="Review pending drivers and fleet companies. Verify documents before approving."
        icon="✅"
      />

      <SegmentedTabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'drivers', label: 'Drivers', count: driversQ.data?.length ?? 0 },
          { value: 'fleets', label: 'Fleets', count: fleetsQ.data?.length ?? 0 },
        ]}
      />

      <div>{tab === 'drivers' ? <DriverQueue /> : <FleetQueue />}</div>
    </div>
  )
}

function initials(name: string, fallback: string) {
  const src = name || fallback
  return src
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function DriverQueue() {
  const qc = useQueryClient()
  const list = useQuery({
    queryKey: ['admin', 'drivers', 'pending'],
    queryFn: () => adminListDrivers('pending'),
  })

  const action = useMutation({
    mutationFn: ({
      id,
      verb,
      reason,
    }: {
      id: number
      verb: 'approve' | 'reject'
      reason?: string
    }) => adminDriverAction(id, verb, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'drivers', 'pending'] }),
  })

  if (list.isLoading) return <p className="text-charcoal/60">Loading…</p>
  if (!list.data?.length)
    return (
      <EmptyState
        icon="🎉"
        title="All caught up"
        body="No pending driver applications. New signups will appear here for review."
      />
    )

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {list.data.map((d) => {
        const docCount = d.documents.length
        const docComplete = docCount >= 4
        return (
          <div
            key={d.id}
            className="bg-white border border-charcoal/5 rounded-2xl p-5 shadow-sm hover:shadow-md transition"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary text-white grid place-items-center font-bold text-lg flex-shrink-0">
                {initials(d.user.full_name, d.user.phone)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-charcoal truncate">
                  {d.user.full_name || d.user.phone}
                </h3>
                <p className="text-xs text-charcoal/60">{d.user.phone}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <Chip>{d.vehicle_reg}</Chip>
                  <Chip>{d.vehicle_capacity_litres}L</Chip>
                  <Chip>{d.vehicle_type.replace('_', ' ')}</Chip>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-charcoal/[0.02] border border-charcoal/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-charcoal/70">
                  Documents
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    docComplete
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {docCount}/4 {docComplete ? 'complete' : 'pending'}
                </span>
              </div>
              {docCount > 0 ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {d.documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-primary hover:underline truncate flex items-center gap-1"
                    >
                      📎 {DOC_LABEL[doc.doc_type] || doc.doc_type}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-charcoal/50">No documents uploaded yet.</p>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => action.mutate({ id: d.id, verb: 'approve' })}
                disabled={action.isPending}
                className="flex-1 bg-primary text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition"
              >
                Approve
              </button>
              <button
                onClick={() => {
                  const reason = prompt('Reason for rejection?') || ''
                  if (!reason) return
                  action.mutate({ id: d.id, verb: 'reject', reason })
                }}
                disabled={action.isPending}
                className="flex-1 bg-white border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm font-bold hover:bg-red-50 disabled:opacity-60 transition"
              >
                Reject
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FleetQueue() {
  const qc = useQueryClient()
  const list = useQuery({
    queryKey: ['admin', 'fleets', 'pending'],
    queryFn: () => adminListFleets('pending'),
  })

  const action = useMutation({
    mutationFn: ({
      id,
      verb,
      reason,
    }: {
      id: number
      verb: 'approve' | 'reject'
      reason?: string
    }) => adminFleetAction(id, verb, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'fleets', 'pending'] }),
  })

  if (list.isLoading) return <p className="text-charcoal/60">Loading…</p>
  if (!list.data?.length)
    return (
      <EmptyState
        icon="🏢"
        title="No pending fleets"
        body="New fleet company registrations will appear here for review."
      />
    )

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {list.data.map((f) => (
        <div
          key={f.id}
          className="bg-white border border-charcoal/5 rounded-2xl p-5 shadow-sm hover:shadow-md transition"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent/15 grid place-items-center text-2xl flex-shrink-0">
              🏢
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-charcoal truncate">{f.name}</h3>
              <p className="text-xs text-charcoal/60">Reg. {f.registration_number}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <Chip>{f.region.name}</Chip>
                <Chip>Owner: {f.owner.phone}</Chip>
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => action.mutate({ id: f.id, verb: 'approve' })}
              disabled={action.isPending}
              className="flex-1 bg-primary text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition"
            >
              Approve
            </button>
            <button
              onClick={() => {
                const reason = prompt('Reason for rejection?') || ''
                if (!reason) return
                action.mutate({ id: f.id, verb: 'reject', reason })
              }}
              disabled={action.isPending}
              className="flex-1 bg-white border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm font-bold hover:bg-red-50 disabled:opacity-60 transition"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-full bg-charcoal/5 text-charcoal/70 font-medium">
      {children}
    </span>
  )
}
