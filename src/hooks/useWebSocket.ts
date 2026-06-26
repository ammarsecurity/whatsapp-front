import { useEffect, useRef, useCallback } from 'react'
import { getApiUrl, getToken } from '../lib/storage'

export type WsEventHandler = (event: string, data: unknown) => void

function wsUrlFromApi(): string {
  const api = getApiUrl()
  const token = getToken()
  const u = new URL(api)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.pathname = '/ws'
  if (token) u.searchParams.set('token', token.replace(/^Bearer\s+/i, ''))
  return u.toString()
}

export function useWebSocket(onEvent: WsEventHandler, enabled = true) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  const connect = useCallback(() => {
    if (!enabled || !getToken()) return () => {}

    let ws: WebSocket | null = null
    let closed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function open() {
      if (closed) return
      try {
        ws = new WebSocket(wsUrlFromApi())
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data as string) as { event?: string; data?: unknown }
            if (msg.event) handlerRef.current(msg.event, msg.data)
          } catch {
            /* ignore */
          }
        }
        ws.onclose = () => {
          if (!closed) {
            retryTimer = setTimeout(open, 5000)
          }
        }
        ws.onerror = () => ws?.close()
      } catch {
        retryTimer = setTimeout(open, 5000)
      }
    }

    open()

    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    }
  }, [enabled])

  useEffect(() => connect(), [connect])
}
