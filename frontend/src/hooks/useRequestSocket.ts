import { useEffect, useRef, useState } from 'react'
import { ACCESS_KEY } from '@/api/client'
import type { RequestStatus } from '@/types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

function wsBase(): string {
  // Strip /api/v1 and convert protocol
  const base = API_URL.replace(/\/api\/v1\/?$/, '')
  return base.replace(/^http/, 'ws')
}

export interface RequestStatusEvent {
  type: 'request.status' | 'connected'
  request_id: number
  status?: RequestStatus
  driver_id?: number | null
}

export interface DriverLocationEvent {
  type: 'driver.location'
  request_id: number
  driver_id: number
  lat: number
  lng: number
}

export type RequestSocketEvent = RequestStatusEvent | DriverLocationEvent

export function useRequestSocket(requestId: number | null) {
  const [latest, setLatest] = useState<RequestStatusEvent | null>(null)
  const [driverLoc, setDriverLoc] = useState<{ lat: number; lng: number } | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!requestId) return
    const token = localStorage.getItem(ACCESS_KEY)
    if (!token) return

    const url = `${wsBase()}/ws/request/${requestId}/?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as RequestSocketEvent
        if (msg.type === 'driver.location') {
          setDriverLoc({ lat: msg.lat, lng: msg.lng })
        } else {
          setLatest(msg as RequestStatusEvent)
        }
      } catch {
        // ignore
      }
    }
    ws.onclose = () => {
      wsRef.current = null
    }

    return () => {
      ws.close()
    }
  }, [requestId])

  return { latest, driverLoc }
}

export interface DriverOfferEvent {
  type: 'offer.new' | 'connected'
  assignment_id?: number
  request_id?: number
  distance_km?: number
  expires_at?: string
}

export function useDriverSocket(enabled: boolean) {
  const [event, setEvent] = useState<DriverOfferEvent | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!enabled) return
    const token = localStorage.getItem(ACCESS_KEY)
    if (!token) return

    const url = `${wsBase()}/ws/driver/?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (ev) => {
      try {
        setEvent(JSON.parse(ev.data) as DriverOfferEvent)
      } catch {
        // ignore
      }
    }
    ws.onclose = () => {
      wsRef.current = null
    }

    return () => {
      ws.close()
    }
  }, [enabled])

  return event
}
