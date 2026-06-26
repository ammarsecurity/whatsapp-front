import { useCallback, useEffect, useState } from 'react'
import { api, ApiClientError } from '../lib/api'
import {
  parseAccountStatus,
  isAccountReady,
  type ParsedAccountStatus,
} from '../lib/accountStatus'

const POLL_MS = 5000

export function useAccountStatusPoll(accountId: string, enabled: boolean) {
  const [status, setStatus] = useState<ParsedAccountStatus | null>(null)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.accountStatus(accountId)
      const parsed = parseAccountStatus(data)
      setStatus(parsed)
      setError(null)
      return { parsed, data }
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Status check failed',
      )
      return null
    }
  }, [accountId])

  useEffect(() => {
    if (!enabled || !accountId) {
      setPolling(false)
      return
    }

    let active = true
    let intervalId: ReturnType<typeof setInterval> | undefined

    const tick = async () => {
      const result = await fetchStatus()
      if (!active || !result) return
      if (isAccountReady(result.data)) {
        setPolling(false)
        if (intervalId) clearInterval(intervalId)
      }
    }

    setPolling(true)
    tick()
    intervalId = setInterval(tick, POLL_MS)

    return () => {
      active = false
      if (intervalId) clearInterval(intervalId)
      setPolling(false)
    }
  }, [accountId, enabled, fetchStatus])

  return { status, polling, error, refresh: fetchStatus }
}
