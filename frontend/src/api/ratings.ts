import { api } from './client'

export interface Rating {
  id: number
  request: number
  rated_by: number
  rated_by_name: string
  rated_by_phone: string
  rated_user: number
  rated_user_name: string
  score: number
  comment: string
  created_at: string
}

export interface RatingSummary {
  user_id: number
  avg: number | null
  count: number
  flagged: boolean
}

export interface MyRatings {
  given: Rating[]
  received: Rating[]
  summary: { avg: number | null; count: number; flagged: boolean }
}

export interface FlaggedUser {
  user_id: number
  phone: string
  full_name: string
  role: string
  avg: number
  count: number
}

export async function submitRating(payload: {
  request_id: number
  score: number
  comment?: string
}) {
  const { data } = await api.post<Rating>('/ratings/', payload)
  return data
}

export async function fetchMyRatings() {
  const { data } = await api.get<MyRatings>('/ratings/mine/')
  return data
}

export async function fetchRequestRatings(requestId: number) {
  const { data } = await api.get<Rating[]>(`/ratings/requests/${requestId}/`)
  return data
}

export async function fetchUserSummary(userId: number) {
  const { data } = await api.get<RatingSummary>(`/ratings/users/${userId}/`)
  return data
}

export async function adminFlaggedUsers() {
  const { data } = await api.get<FlaggedUser[]>('/ratings/admin/flagged/')
  return data
}
