import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { verifyPayment } from '@/api/payments'

/**
 * Landing page Paystack redirects to after the customer finishes paying.
 * Reads the `reference` query param Paystack appends, verifies it server-side,
 * then forwards the customer to the request detail page.
 *
 * Configured as the Paystack "Callback URL":
 *   https://<frontend-host>/customer/payment-return
 */
export function CustomerPaymentReturn() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const reference = params.get('reference') ?? params.get('trxref') ?? ''

  const verifyMut = useMutation({
    mutationFn: () => verifyPayment(reference),
    onSuccess: (p) => {
      navigate(`/customer/requests/${p.request}`, { replace: true, state: { justPaid: true } })
    },
    onError: () => {
      navigate('/customer/requests', { replace: true })
    },
  })

  useEffect(() => {
    if (!reference) {
      navigate('/customer/requests', { replace: true })
      return
    }
    verifyMut.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference])

  return (
    <div className="max-w-md mx-auto py-16 text-center">
      <div className="inline-flex w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      <h1 className="mt-5 font-heading text-2xl font-extrabold text-charcoal">
        Confirming your payment…
      </h1>
      <p className="mt-2 text-sm text-charcoal/60">
        One moment while we verify the transaction with Paystack.
      </p>
    </div>
  )
}
