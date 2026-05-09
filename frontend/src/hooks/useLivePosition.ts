import { useEffect, useState } from 'react'
import type { LatLng } from '@/lib/mapboxDirections'

/**
 * Watches the device geolocation while `enabled` is true. Returns the latest
 * position or null if unavailable. Browsers coalesce multiple watchers, so it
 * is safe to use this alongside the location broadcaster.
 */
export function useLivePosition(enabled: boolean): LatLng | null {
  const [pos, setPos] = useState<LatLng | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (!('geolocation' in navigator)) return

    let cancelled = false
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (cancelled) return
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude })
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 5000 },
    )
    return () => {
      cancelled = true
      navigator.geolocation.clearWatch(id)
    }
  }, [enabled])

  return pos
}
