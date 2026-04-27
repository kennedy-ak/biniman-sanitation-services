import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  inviteFleetDriver,
  listFleetDrivers,
  removeFleetDriver,
} from '@/api/fleets'

export function FleetDrivers() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['fleet', 'drivers'], queryFn: listFleetDrivers })

  const [phone, setPhone] = useState('+233')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const invite = useMutation({
    mutationFn: () => inviteFleetDriver({ phone, full_name: name }),
    onSuccess: () => {
      setPhone('+233')
      setName('')
      setError(null)
      qc.invalidateQueries({ queryKey: ['fleet', 'drivers'] })
    },
    onError: (err: Error & { response?: { data?: { detail?: string; phone?: string[] } } }) => {
      setError(err.response?.data?.detail ?? err.response?.data?.phone?.[0] ?? 'Could not invite.')
    },
  })

  const remove = useMutation({
    mutationFn: (driverId: number) => removeFleetDriver(driverId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet', 'drivers'] }),
  })

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-extrabold">Drivers</h1>
      <p className="mt-2 text-charcoal/70">
        Invite drivers by phone. They'll get an SMS and complete their onboarding on first sign-in.
      </p>

      <form
        className="mt-6 card grid sm:grid-cols-3 gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          invite.mutate()
        }}
      >
        <input
          className="input"
          placeholder="+233241234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <input
          className="input"
          placeholder="Driver name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          disabled={invite.isPending}
          className="bg-primary text-white font-semibold rounded-md px-4 py-2 disabled:opacity-60"
        >
          {invite.isPending ? 'Inviting…' : 'Invite driver'}
        </button>
        {error && (
          <p className="sm:col-span-3 text-sm text-red-600">{error}</p>
        )}
      </form>

      <h2 className="mt-8 text-xl font-bold">Roster</h2>
      {list.isLoading && <p className="mt-2">Loading…</p>}
      {list.data?.length === 0 && (
        <p className="mt-2 text-charcoal/60">No drivers yet.</p>
      )}
      <div className="mt-4 space-y-3">
        {list.data?.map((d) => (
          <div key={d.id} className="card flex justify-between items-center">
            <div>
              <h3 className="font-bold">{d.user.full_name || d.user.phone}</h3>
              <p className="text-sm text-charcoal/60">
                {d.user.phone} · {d.vehicle_reg} ·{' '}
                <span className="uppercase font-semibold">{d.status}</span>{' '}
                {d.is_online && <span className="text-green-600">● online</span>}
              </p>
            </div>
            <button
              onClick={() => {
                if (confirm(`Remove ${d.user.phone} from your fleet?`)) {
                  remove.mutate(d.id)
                }
              }}
              className="text-sm text-red-600 underline"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
