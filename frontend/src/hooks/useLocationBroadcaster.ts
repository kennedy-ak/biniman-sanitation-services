import { useEffect } from 'react'
import { pingDriverLocation } from '@/api/requests'

const PING_INTERVAL_MS = 30_000

/**
 * While `enabled` is true, sends the driver's current geolocation to the
 * server every ~30 seconds. Uses getCurrentPosition on an interval rather than
 * watchPosition so pings fire reliably even when the driver is stationary —
 * watchPosition only triggers on movement, which would let last_seen_at go
 * stale (> driver_stale_after_seconds) and drop the driver from matching.
 */
export function useLocationBroadcaster(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    if (!('geolocation' in navigator)) return

    let cancelled = false

    const sendPing = () => {
      if (cancelled) return
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return
          pingDriverLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {})
        },
        undefined,
        { enableHighAccuracy: true, maximumAge: 10_000 },
      )
    }

    sendPing()
    const iv = setInterval(sendPing, PING_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [enabled])
}
