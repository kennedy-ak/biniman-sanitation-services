import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  adminCreateRegion,
  adminDeleteRegion,
  adminListRegions,
  adminUpdateRegion,
} from '@/api/auth'
import { EmptyState, PageHeader } from '@/components/admin/PageHeader'
import type { Region } from '@/types'

export function AdminRegions() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['admin', 'regions'], queryFn: adminListRegions })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'regions'] })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Regions / Towns"
        subtitle="Towns shown to customers and drivers during signup. Add Kumasi sub-metros or new towns here."
        icon="📍"
      />

      <AddRegionForm onAdded={invalidate} />

      {list.isLoading && <p className="text-charcoal/60">Loading…</p>}

      {!list.isLoading && !list.data?.length && (
        <EmptyState
          icon="🗺️"
          title="No towns yet"
          body="Add your first town above so users can pick a region during signup."
        />
      )}

      {!!list.data?.length && (
        <div className="bg-white border border-charcoal/5 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-charcoal/[0.03] text-charcoal/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/5">
              {list.data.map((r) => (
                <RegionRow key={r.id} region={r} onChanged={invalidate} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AddRegionForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: () => adminCreateRegion({ name: name.trim(), code: code.trim().toUpperCase() }),
    onSuccess: () => {
      setName('')
      setCode('')
      setError(null)
      onAdded()
    },
    onError: (err) => setError(extractError(err)),
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() || !code.trim()) {
          setError('Name and code are required.')
          return
        }
        mut.mutate()
      }}
      className="bg-white border border-charcoal/5 rounded-2xl p-5 shadow-sm flex flex-wrap items-end gap-3"
    >
      <label className="flex-1 min-w-[200px] block">
        <span className="text-xs font-semibold text-charcoal/70">Town name</span>
        <input
          className="input mt-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ejisu"
        />
      </label>
      <label className="w-32 block">
        <span className="text-xs font-semibold text-charcoal/70">Code</span>
        <input
          className="input mt-1 uppercase"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="EJS"
          maxLength={16}
        />
      </label>
      <button
        type="submit"
        disabled={mut.isPending}
        className="bg-primary text-white px-5 py-2.5 rounded-lg font-bold hover:bg-primary/90 disabled:opacity-60 transition shadow-sm"
      >
        {mut.isPending ? 'Adding…' : 'Add town'}
      </button>
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </form>
  )
}

function RegionRow({ region, onChanged }: { region: Region; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(region.name)
  const [code, setCode] = useState(region.code)
  const [error, setError] = useState<string | null>(null)

  const update = useMutation({
    mutationFn: (payload: Partial<Pick<Region, 'name' | 'code' | 'is_active'>>) =>
      adminUpdateRegion(region.id, payload),
    onSuccess: () => {
      setEditing(false)
      setError(null)
      onChanged()
    },
    onError: (err) => setError(extractError(err)),
  })

  const del = useMutation({
    mutationFn: () => adminDeleteRegion(region.id),
    onSuccess: () => {
      setError(null)
      onChanged()
    },
    onError: (err) => setError(extractError(err)),
  })

  if (editing) {
    return (
      <tr>
        <td className="px-4 py-3">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </td>
        <td className="px-4 py-3">
          <input
            className="input uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={16}
          />
        </td>
        <td className="px-4 py-3" colSpan={2}>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setName(region.name)
                setCode(region.code)
                setError(null)
              }}
              className="px-3 py-1.5 rounded-lg text-sm border border-charcoal/10 hover:bg-charcoal/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({ name: name.trim(), code: code.trim().toUpperCase() })
              }
              className="px-3 py-1.5 rounded-lg text-sm bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-60"
            >
              {update.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-700 text-right">{error}</p>}
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td className="px-4 py-3 font-semibold text-charcoal">{region.name}</td>
      <td className="px-4 py-3 text-charcoal/70 font-mono text-xs">{region.code}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
            region.is_active
              ? 'bg-green-100 text-green-800'
              : 'bg-charcoal/10 text-charcoal/60'
          }`}
        >
          {region.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() =>
              update.mutate({ is_active: !region.is_active })
            }
            disabled={update.isPending}
            className="px-3 py-1.5 rounded-lg text-sm border border-charcoal/10 hover:bg-charcoal/5 disabled:opacity-60"
          >
            {region.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 rounded-lg text-sm border border-charcoal/10 hover:bg-charcoal/5"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Delete "${region.name}"? This cannot be undone.`)) {
                del.mutate()
              }
            }}
            disabled={del.isPending}
            className="px-3 py-1.5 rounded-lg text-sm border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {del.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-700 text-right">{error}</p>}
      </td>
    </tr>
  )
}

function extractError(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as Record<string, unknown> | undefined
    if (data && typeof data === 'object') {
      if (typeof data.detail === 'string') return data.detail
      const first = Object.values(data)[0]
      if (Array.isArray(first) && typeof first[0] === 'string') return first[0]
      if (typeof first === 'string') return first
    }
    return err.message
  }
  return 'Something went wrong.'
}
