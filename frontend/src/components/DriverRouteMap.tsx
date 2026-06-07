import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { fetchRoute, formatEta, formatKm, type LatLng, type Route } from '@/lib/mapboxDirections'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

if (TOKEN) {
  mapboxgl.accessToken = TOKEN
}

const ROUTE_SOURCE = 'driver-route'
const ROUTE_LAYER = 'driver-route-line'
const ROUTE_REFRESH_MS = 30_000

interface DriverRouteMapProps {
  pickup: LatLng
  driver: LatLng | null
  height?: number
  /** Re-runs the directions fetch every 30s while true. */
  liveRefresh?: boolean
  onRoute?: (r: Route | null) => void
}

export function DriverRouteMap({
  pickup,
  driver,
  height = 220,
  liveRefresh = true,
  onRoute,
}: DriverRouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const [route, setRoute] = useState<Route | null>(null)

  // Initial map setup
  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return

    const center: [number, number] = driver
      ? [(driver.lng + pickup.lng) / 2, (driver.lat + pickup.lat) / 2]
      : [pickup.lng, pickup.lat]

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom: 12,
      attributionControl: false,
    })
    mapRef.current = map

    pickupMarkerRef.current = new mapboxgl.Marker({ color: '#0B6B3A' })
      .setLngLat([pickup.lng, pickup.lat])
      .setPopup(new mapboxgl.Popup({ offset: 12 }).setText('Pickup'))
      .addTo(map)

    map.on('load', () => {
      map.addSource(ROUTE_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: ROUTE_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#0B6B3A',
          'line-width': 5,
          'line-opacity': 0.85,
        },
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
      pickupMarkerRef.current = null
      driverMarkerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Driver marker follows the live position
  useEffect(() => {
    const map = mapRef.current
    if (!map || !driver) return

    if (!driverMarkerRef.current) {
      const el = document.createElement('div')
      el.style.width = '28px'
      el.style.height = '28px'
      el.style.borderRadius = '50%'
      el.style.background = '#D4A017'
      el.style.border = '3px solid #fff'
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)'
      el.style.display = 'grid'
      el.style.placeItems = 'center'
      el.style.fontSize = '14px'
      el.textContent = '🚛'
      driverMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([driver.lng, driver.lat])
        .addTo(map)
    } else {
      driverMarkerRef.current.setLngLat([driver.lng, driver.lat])
    }
  }, [driver])

  // Fit map to pickup + driver whenever both exist
  useEffect(() => {
    const map = mapRef.current
    if (!map || !driver) return
    const bounds = new mapboxgl.LngLatBounds()
    bounds.extend([pickup.lng, pickup.lat])
    bounds.extend([driver.lng, driver.lat])
    map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 })
  }, [driver, pickup.lat, pickup.lng])

  // Fetch route between driver and pickup, refresh on interval
  useEffect(() => {
    if (!driver) return
    let cancelled = false
    const controller = new AbortController()

    const run = async () => {
      try {
        const r = await fetchRoute(driver, { lat: pickup.lat, lng: pickup.lng }, controller.signal)
        if (cancelled) return
        setRoute(r)
        onRoute?.(r)
        const map = mapRef.current
        if (!map || !r) return
        const apply = () => {
          const src = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined
          if (src) src.setData(r.geometry)
        }
        if (map.isStyleLoaded()) apply()
        else map.once('load', apply)
      } catch {
        // ignored — abort or network blip
      }
    }
    void run()

    if (!liveRefresh) {
      return () => {
        cancelled = true
        controller.abort()
      }
    }
    const id = window.setInterval(run, ROUTE_REFRESH_MS)
    return () => {
      cancelled = true
      controller.abort()
      window.clearInterval(id)
    }
  }, [driver?.lat, driver?.lng, pickup.lat, pickup.lng, liveRefresh, onRoute, driver])

  if (!TOKEN) {
    return (
      <div
        className="card text-sm text-charcoal/70"
        style={{ height: height ? `${height}px` : undefined }}
      >
        <div className="font-bold mb-1">Route preview</div>
        <p className="text-xs">
          Mapbox token not set. Add <code>VITE_MAPBOX_TOKEN</code> to{' '}
          <code>frontend/.env</code> to see the route.
        </p>
        <div className="mt-2 text-xs">
          Pickup: {pickup.lat.toFixed(5)}, {pickup.lng.toFixed(5)}
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden border border-charcoal/10"
        style={{ height }}
      />
      {route && (
        <div className="absolute top-2 left-2 bg-white/95 backdrop-blur rounded-md shadow px-2.5 py-1 text-xs font-semibold flex items-center gap-2 border border-charcoal/10">
          <span className="text-primary">⏱ {formatEta(route.durationSec)}</span>
          <span className="text-charcoal/40">·</span>
          <span className="text-charcoal/80">{formatKm(route.distanceM)}</span>
        </div>
      )}
    </div>
  )
}
