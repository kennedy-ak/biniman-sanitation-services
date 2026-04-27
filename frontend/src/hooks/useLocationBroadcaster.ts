import { useEffect, useRef } from 'react'
import { pingDriverLocation } from '@/api/requests'

const PING_INTERVAL_MS = 7000

/**
 * While `enabled` is true, sends the driver's current geolocation to the
 * server every ~7 seconds. The server forwards it to the active request's
 * customer via Channels.
 */
export function useLocationBroadcaster(enabled: boolean) {
  const lastSentAtRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    if (!('geolocation' in navigator)) return

    let cancelled = false

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        if (cancelled) return
        if (now - lastSentAtRef.current < PING_INTERVAL_MS) return
        lastSentAtRef.current = now
        pingDriverLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {
          // best-effort
        })
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 5000 },
    )

    return () => {
      cancelled = true
      navigator.geolocation.clearWatch(watchId)
    }
  }, [enabled])
}
