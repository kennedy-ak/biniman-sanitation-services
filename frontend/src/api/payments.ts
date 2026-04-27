import { api } from './client'

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'
export type PayoutStatus = 'pending' | 'succeeded' | 'failed'

export interface Payment {
  id: number
  request: number
  amount: string
  currency: string
  status: PaymentStatus
  method: 'momo' | 'card' | 'unknown'
  paystack_reference: string
  paystack_authorization_url: string
  paid_at: string | null
  refunded_at: string | null
  refund_amount: string
  created_at: string
}

export interface Payout {
  id: number
  request: number
  driver: number
  amount: string
  commission: string
  paystack_transfer_code: string
  status: PayoutStatus
  failure_reason: string
  transferred_at: string | null
  created_at: string
}

export async function initPayment(requestId: number) {
  const { data } = await api.post<Payment>('/payments/init/', { request_id: requestId })
  return data
}

export async function verifyPayment(reference: string) {
  const { data } = await api.post<Payment>(`/payments/verify/${reference}/`)
  return data
}

export async function fetchMyPayments() {
  const { data } = await api.get<Payment[]>('/payments/mine/')
  return data
}

export async function adminListPayments(status?: PaymentStatus) {
  const { data } = await api.get<Payment[]>('/payments/admin/payments/', {
    params: status ? { status } : undefined,
  })
  return data
}

export async function adminListPayouts(status?: PayoutStatus) {
  const { data } = await api.get<Payout[]>('/payments/admin/payouts/', {
    params: status ? { status } : undefined,
  })
  return data
}
