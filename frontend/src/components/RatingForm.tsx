import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchRequestRatings, submitRating } from '@/api/ratings'
import { useAuth } from '@/store/auth'

export function RatingForm({ requestId, label }: { requestId: number; label: string }) {
  const qc = useQueryClient()
  const user = useAuth((s) => s.user)
  const [score, setScore] = useState(5)
  const [comment, setComment] = useState('')

  const ratings = useQuery({
    queryKey: ['ratings', 'request', requestId],
    queryFn: () => fetchRequestRatings(requestId),
  })

  const alreadyRated = ratings.data?.some((r) => r.rated_by === user?.id)
  const myRating = ratings.data?.find((r) => r.rated_by === user?.id)

  const mut = useMutation({
    mutationFn: () => submitRating({ request_id: requestId, score, comment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ratings', 'request', requestId] }),
  })

  if (ratings.isLoading) return null

  if (alreadyRated) {
    return (
      <div className="card mt-6">
        <h3 className="font-bold">Your rating</h3>
        <Stars score={myRating!.score} />
        {myRating?.comment && (
          <p className="mt-2 text-sm text-charcoal/70">"{myRating.comment}"</p>
        )}
      </div>
    )
  }

  return (
    <form
      className="card mt-6"
      onSubmit={(e) => {
        e.preventDefault()
        mut.mutate()
      }}
    >
      <h3 className="font-bold">{label}</h3>
      <div className="mt-3 flex gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => setScore(s)}
            className={`text-3xl transition ${
              score >= s ? 'text-accent' : 'text-gray-300'
            }`}
            aria-label={`${s} stars`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment (optional)"
        className="input mt-3"
        rows={2}
      />
      <button
        type="submit"
        disabled={mut.isPending}
        className="mt-3 bg-primary text-white px-5 py-2 rounded-md font-semibold disabled:opacity-60"
      >
        {mut.isPending ? 'Submitting…' : 'Submit rating'}
      </button>
      {mut.isError && (
        <p className="mt-2 text-sm text-red-600">Could not submit rating.</p>
      )}
    </form>
  )
}

export function Stars({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= score ? 'text-accent' : 'text-gray-300'}>
          ★
        </span>
      ))}
    </div>
  )
}
