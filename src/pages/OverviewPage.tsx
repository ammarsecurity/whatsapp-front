import { Activity, Globe, Radio, Server } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ConnectionBadge } from '../components/ConnectionBadge'
import { JsonBlock } from '../components/JsonBlock'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { api, ApiClientError } from '../lib/api'
import { parseAccountStatus } from '../lib/accountStatus'
import { getAccountId, setAccountId } from '../lib/storage'

function readChrome(data: unknown) {
  if (!data || typeof data !== 'object') return null
  const chrome = (data as Record<string, unknown>).chrome
  if (!chrome || typeof chrome !== 'object') return null
  return chrome as Record<string, unknown>
}

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

  const systemObj =
    systemData && typeof systemData === 'object'
      ? (systemData as Record<string, unknown>)
      : null

  const systemReady =
    systemObj && ('ready' in systemObj || 'isReady' in systemObj)
      ? Boolean(systemObj.ready ?? systemObj.isReady)
      : null

  const apiBuild =
    typeof systemObj?.apiBuild === 'string' ? systemObj.apiBuild : null

  const chrome = readChrome(systemData)
  const chromeOk = chrome?.headlessLaunch === true

  const accountStatus =
    accountData && typeof accountData === 'object'
      ? parseAccountStatus(accountData)
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
                {systemReady ? 'Ready' : 'Warming up'}
              </span>
            ) : null
          }
        >
          {apiBuild && (
            <p className="mb-2 text-xs text-muted">
              API build:{' '}
              <code className="rounded bg-card px-1.5 py-0.5 text-wa-green">{apiBuild}</code>
            </p>
          )}
          {chrome && (
            <div className="mb-3 rounded-lg border border-border bg-surface/50 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Globe className="h-4 w-4 text-muted" />
                Chrome (Ubuntu)
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    chromeOk
                      ? 'bg-wa-green/20 text-wa-green'
                      : 'bg-red-500/15 text-red-300'
                  }`}
                >
                  {chromeOk ? 'OK' : 'Failed'}
                </span>
              </div>
              <ul className="space-y-1 text-xs text-muted">
                <li>
                  Path:{' '}
                  <code className="text-text">
                    {String(chrome.executablePath ?? '—')}
                  </code>
                </li>
                {chrome.version != null && (
                  <li>Version: {String(chrome.version)}</li>
                )}
                {!chromeOk && chrome.launchError != null && (
                  <li className="text-red-300">{String(chrome.launchError)}</li>
                )}
              </ul>
            </div>
          )}
          <div className="mb-3 flex items-center gap-2 text-muted">
            <Server className="h-4 w-4" />
            <span className="text-xs">Full system payload</span>
          </div>
          <JsonBlock data={systemData ?? { loading: true }} />
        </Card>

        <Card title="Account status" description={`GET /accounts/${accountId}/status`}>
          {accountStatus && (
            <div className="mb-3">
              <ConnectionBadge
                state={accountStatus.state}
                label={accountStatus.label}
              />
            </div>
          )}
          {accountStatus?.state === 'connected' && (
            <Alert variant="success" title="Linked" className="mb-3">
              WhatsApp is connected and ready. <code className="text-wa-green">qrCode: null</code> is
              expected while the session is active.
            </Alert>
          )}
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
            If requests fail right after restart, wait ~20s (server warmup).
          </li>
          <li className="flex gap-2">
            <Radio className="mt-0.5 h-4 w-4 shrink-0 text-wa-green" />
            Link a device under Accounts → scan QR when disconnected.
          </li>
          <li className="flex gap-2">
            <Radio className="mt-0.5 h-4 w-4 shrink-0 text-wa-green" />
            Messages → History shows sent/failed logs from the database.
          </li>
        </ul>
      </Card>
    </div>
  )
}
