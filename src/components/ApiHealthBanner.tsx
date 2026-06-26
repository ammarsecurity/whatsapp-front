import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from './ui/Alert'
import { DEFAULT_API_URL, getApiUrl } from '../lib/storage'

const MIN_API_BUILD = '2026-06-02-v10'

interface HealthResponse {
  success?: boolean
  apiBuild?: string
  features?: string[]
}

export function ApiHealthBanner() {
  const [issue, setIssue] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const base = getApiUrl()
      try {
        const res = await fetch(`${base}/health`)
        const text = await res.text()
        if (text.trimStart().startsWith('<!')) {
          if (!cancelled) {
            setIssue(
              `API URL "${base}" returns HTML (not the Node server). Use ${DEFAULT_API_URL} in Settings → Configuration.`,
            )
          }
          return
        }
        const data = JSON.parse(text) as HealthResponse
        if (!res.ok || !data.apiBuild) {
          if (!cancelled) {
            setIssue(
              `Backend at ${base} is outdated (missing apiBuild). Deploy "New folder" to the server and restart Node.`,
            )
          }
          return
        }
        if (data.apiBuild < MIN_API_BUILD) {
          if (!cancelled) {
            setIssue(
              `Backend apiBuild is ${data.apiBuild}; need ${MIN_API_BUILD}+. Upload the latest backend and run migration_v10_features.sql.`,
            )
          }
        }
      } catch {
        if (!cancelled) {
          setIssue(`Cannot reach API at ${base}. Check Settings → Configuration.`)
        }
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  if (!issue) return null

  return (
    <Alert variant="error" title="Backend not updated" className="mb-4">
      {issue}{' '}
      <Link to="/settings" className="underline">
        Open settings
      </Link>
    </Alert>
  )
}
