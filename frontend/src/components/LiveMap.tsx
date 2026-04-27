import { useEffect, useMemo, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

if (TOKEN) {
  mapboxgl.accessToken = TOKEN
}

interface Point {
  lat: number
  lng: number
}

interface LiveMapProps {
  pickup: Point
  driver?: Point | null
  height?: number
}

export function LiveMap({ pickup, driver, height = 320 }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)

  const center = useMemo<[number, number]>(
    () => (driver ? [driver.lng, driver.lat] : [pickup.lng, pickup.lat]),
    [driver, pickup],
  )

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom: 13,
    })
    mapRef.current = map

    pickupMarkerRef.current = new mapboxgl.Marker({ color: '#0B6B3A' })
      .setLngLat([pickup.lng, pickup.lat])
      .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML('<strong>Pickup</strong>'))
      .addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
      pickupMarkerRef.current = null
      driverMarkerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    map.easeTo({ center: [driver.lng, driver.lat], duration: 600 })
  }, [driver])

  if (!TOKEN) {
    return (
      <div
        className="card text-sm text-charcoal/70"
        style={{ height: height ? `${height}px` : undefined }}
      >
        <div className="font-bold mb-2">Live map</div>
        <p>Mapbox token not configured. Set <code>VITE_MAPBOX_TOKEN</code> in <code>frontend/.env</code> to enable the live map.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-charcoal/50 uppercase">Pickup</div>
            <div>{pickup.lat.toFixed(5)}, {pickup.lng.toFixed(5)}</div>
          </div>
          {driver && (
            <div>
              <div className="text-charcoal/50 uppercase">Driver</div>
              <div>{driver.lat.toFixed(5)}, {driver.lng.toFixed(5)}</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-hidden border border-charcoal/10"
      style={{ height }}
    />
  )
}
