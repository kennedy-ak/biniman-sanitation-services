import type { Feature, LineString } from 'geojson'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

export interface LatLng {
  lat: number
  lng: number
}

export interface Route {
  geometry: Feature<LineString>
  durationSec: number
  distanceM: number
}

interface DirectionsResponse {
  routes: {
    geometry: LineString
    duration: number
    distance: number
  }[]
}

/**
 * Fetches a driving route between two points via Mapbox Directions.
 * Returns null when the token is missing or the API returns no routes.
 */
export async function fetchRoute(
  from: LatLng,
  to: LatLng,
  signal?: AbortSignal,
): Promise<Route | null> {
  if (!TOKEN) return null
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(TOKEN)}`

  const resp = await fetch(url, { signal })
  if (!resp.ok) return null
  const data = (await resp.json()) as DirectionsResponse
  const r = data.routes?.[0]
  if (!r) return null

  return {
    geometry: { type: 'Feature', properties: {}, geometry: r.geometry },
    durationSec: r.duration,
    distanceM: r.distance,
  }
}

export function formatEta(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

export function formatKm(meters: number): string {
  const km = meters / 1000
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}
