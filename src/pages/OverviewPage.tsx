import { Activity, Radio, Server } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { JsonBlock } from '../components/JsonBlock'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { api, ApiClientError } from '../lib/api'
import { getAccountId, setAccountId } from '../lib/storage'

export function OverviewPage() {
  const [accountId, setAccountIdState] = useState(getAccountId)
  const [systemData, setSystemData] = useState<unknown>(null)
  const [accountData, setAccountData] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [system, account] = await Promise.all([
        api.systemStatus(),
        api.accountStatus(accountId),
      ])
      setSystemData(system)
      setAccountData(account)
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Failed to load status',
      )
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    refresh()
  }, [refresh])

  function saveAccountId() {
    setAccountId(accountId)
    refresh()
  }

  const systemReady =
    systemData &&
    typeof systemData === 'object' &&
    ('ready' in systemData || 'isReady' in systemData)
      ? Boolean(
          (systemData as { ready?: boolean; isReady?: boolean }).ready ??
            (systemData as { isReady?: boolean }).isReady,
        )
      : null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted">
          System health and active WhatsApp account status
        </p>
      </header>

      <Card title="Active account">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Input
              label="Account ID"
              value={accountId}
              onChange={(e) => setAccountIdState(e.target.value)}
              placeholder="ibsprimary"
            />
          </div>
          <Button variant="secondary" onClick={saveAccountId}>
            Save
          </Button>
          <Button loading={loading} onClick={refresh}>
            Refresh
          </Button>
        </div>
      </Card>

      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          title="System"
          description="GET /api/status/system"
          action={
            systemReady !== null ? (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  systemReady
                    ? 'bg-wa-green/20 text-wa-green'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {systemReady ? 'Ready' : 'Not ready'}
              </span>
            ) : null
          }
        >
          <div className="mb-3 flex items-center gap-2 text-muted">
            <Server className="h-4 w-4" />
            <span className="text-xs">isReady / system status</span>
          </div>
          <JsonBlock data={systemData ?? { loading: true }} />
        </Card>

        <Card title="Account status" description={`GET /accounts/${accountId}/status`}>
          <div className="mb-3 flex items-center gap-2 text-muted">
            <Activity className="h-4 w-4" />
            <span className="text-xs">Connection state</span>
          </div>
          <JsonBlock data={accountData ?? { loading: true }} />
        </Card>
      </div>

      <Card title="Quick tips">
        <ul className="space-y-2 text-sm text-muted">
          <li className="flex gap-2">
            <Radio className="mt-0.5 h-4 w-4 shrink-0 text-wa-green" />
            Link a device under Accounts → scan the QR code when status is disconnected.
          </li>
          <li className="flex gap-2">
            <Radio className="mt-0.5 h-4 w-4 shrink-0 text-wa-green" />
            Use Messages to verify numbers before bulk sending.
          </li>
        </ul>
      </Card>
    </div>
  )
}
