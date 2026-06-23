import {
  Activity,
  Cpu,
  HardDrive,
  RefreshCw,
  Server,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { JsonBlock } from './JsonBlock'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { api, ApiClientError } from '../lib/api'
import { formatMb, percentBarColor } from '../lib/formatBytes'
import type { SystemHealthResponse } from '../types/systemHealth'

const POLL_MS = 15000

function MetricBar({
  label,
  used,
  total,
  percent,
}: {
  label: string
  used: number
  total: number
  percent: number
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-medium text-text">
          {formatMb(used)} / {formatMb(total)} ({percent}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border/60">
        <div
          className={`h-full rounded-full transition-all ${percentBarColor(percent)}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string | number
  sub?: string
  tone?: 'default' | 'ok' | 'warn' | 'bad'
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-wa-green'
      : tone === 'warn'
        ? 'text-amber-300'
        : tone === 'bad'
          ? 'text-red-300'
          : 'text-text'
  return (
    <div className="rounded-xl border border-border bg-surface/50 px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  )
}

export function AdminSystemHealthPanel() {
  const [data, setData] = useState<SystemHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await api.adminSystemHealth()
      setData(res)
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Failed to load health',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [autoRefresh, load])

  const overall = data?.overall
  const mem = data?.memory
  const sys = data?.system
  const wa = data?.whatsapp as Record<string, unknown> | undefined
  const chrome = data?.chrome as Record<string, unknown> | undefined

  const chromeOk = chrome?.headlessLaunch === true

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {overall && (
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                overall.ok
                  ? 'bg-wa-green/20 text-wa-green'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              {overall.status === 'healthy' ? 'Healthy' : 'Degraded'}
            </span>
          )}
          {data?.apiBuild && (
            <span className="text-xs text-muted">build {data.apiBuild}</span>
          )}
          {data?.timestamp && (
            <span className="text-xs text-muted">
              {new Date(data.timestamp).toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-border"
            />
            Auto-refresh 15s
          </label>
          <Button variant="secondary" loading={loading} onClick={load}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {data?.checks && data.checks.some((c) => !c.ok) && (
        <Alert variant="warning" title="Issues detected">
          {data.checks
            .filter((c) => !c.ok)
            .map((c) => c.label)
            .join(' · ')}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="WhatsApp connected"
          value={String(wa?.connected ?? '—')}
          sub={`of ${wa?.accountsTotal ?? '—'} accounts`}
          tone={(wa?.connected as number) > 0 ? 'ok' : 'warn'}
        />
        <StatTile
          label="Sessions in memory"
          value={String(wa?.inMemory ?? '—')}
          sub={`${wa?.initLocks ?? 0} init locks`}
        />
        <StatTile
          label="Chrome RAM"
          value={formatMb(mem?.chromeMb as number | null)}
          sub={
            mem?.chromeProcessCount != null
              ? `${mem.chromeProcessCount} processes`
              : undefined
          }
          tone={chromeOk ? 'ok' : 'bad'}
        />
        <StatTile
          label="Node process RAM"
          value={formatMb(mem?.nodeProcessMb?.rss)}
          sub={`heap ${formatMb(mem?.nodeProcessMb?.heapUsed)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Memory" description="Server RAM usage">
          <div className="space-y-4">
            {mem?.systemMb && (
              <MetricBar
                label="System RAM"
                used={mem.systemMb.used}
                total={mem.systemMb.total}
                percent={mem.systemMb.usedPercent}
              />
            )}
            {mem?.nodeProcessMb && mem.systemMb && (
              <MetricBar
                label="Node.js (RSS)"
                used={mem.nodeProcessMb.rss}
                total={mem.systemMb.total}
                percent={Math.round((mem.nodeProcessMb.rss / mem.systemMb.total) * 1000) / 10}
              />
            )}
            {mem?.chromeMb != null && mem.systemMb && (
              <MetricBar
                label="Chrome (all processes)"
                used={mem.chromeMb}
                total={mem.systemMb.total}
                percent={Math.round((mem.chromeMb / mem.systemMb.total) * 1000) / 10}
              />
            )}
            <p className="text-xs text-muted">
              Estimated Node + Chrome:{' '}
              <strong className="text-text">
                {formatMb(mem?.estimatedTotalMb)}
              </strong>
            </p>
          </div>
        </Card>

        <Card title="Chrome" description="Headless browser health">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between gap-2">
              <span className="text-muted">Status</span>
              <span className={chromeOk ? 'text-wa-green' : 'text-red-300'}>
                {chromeOk ? 'OK' : 'Failed'}
              </span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted">Path</span>
              <code className="max-w-[220px] truncate text-xs">
                {String(chrome?.executablePath ?? '—')}
              </code>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted">Version</span>
              <span className="text-right text-xs">
                {String(chrome?.version ?? '—')}
              </span>
            </li>
            {!chromeOk && chrome?.launchError != null && (
              <li className="rounded-lg bg-red-500/10 p-2 text-xs text-red-300">
                {String(chrome.launchError)}
              </li>
            )}
            {chrome?.ubuntuHint != null && !chromeOk && (
              <li className="text-xs text-muted">{String(chrome.ubuntuHint)}</li>
            )}
          </ul>
        </Card>

        <Card title="Server" description="Process & OS">
          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2 text-muted">
              <Server className="h-4 w-4" />
              <span>
                Bridge:{' '}
                <strong className={sys?.bridgeReady ? 'text-wa-green' : 'text-amber-300'}>
                  {sys?.bridgeReady ? 'Ready' : 'Warming up'}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted">
              <Activity className="h-4 w-4" />
              <span>
                Uptime: {String(sys?.uptimeHuman ?? '—')} (OS:{' '}
                {String(sys?.osUptimeHuman ?? '—')})
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted">
              <Cpu className="h-4 w-4" />
              <span>
                {String(sys?.cpuCores ?? '—')} cores · load{' '}
                {Array.isArray(sys?.loadAverage)
                  ? (sys.loadAverage as number[]).join(', ')
                  : '—'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted">
              <HardDrive className="h-4 w-4" />
              <span>
                {String(sys?.platform ?? '—')} · Node {String(sys?.nodeVersion ?? '—')}
              </span>
            </div>
          </div>
        </Card>

        <Card title="WhatsApp sessions" description="Connection summary">
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-panel px-3 py-2">
              <span className="text-muted">Offline</span>
              <p className="font-bold text-text">{String(wa?.offline ?? 0)}</p>
            </div>
            <div className="rounded-lg bg-panel px-3 py-2">
              <span className="text-muted">Awaiting QR</span>
              <p className="font-bold text-text">{String(wa?.awaitingQr ?? 0)}</p>
            </div>
            <div className="rounded-lg bg-panel px-3 py-2">
              <span className="text-muted">Errors</span>
              <p className="font-bold text-red-300">{String(wa?.withErrors ?? 0)}</p>
            </div>
            <div className="rounded-lg bg-panel px-3 py-2">
              <span className="text-muted">Reconnect timers</span>
              <p className="font-bold text-text">{String(wa?.reconnectTimers ?? 0)}</p>
            </div>
          </div>
          {Array.isArray(wa?.sessions) && (wa.sessions as unknown[]).length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-panel text-muted">
                    <th className="px-2 py-1.5">Account</th>
                    <th className="px-2 py-1.5">State</th>
                    <th className="px-2 py-1.5">Linked</th>
                  </tr>
                </thead>
                <tbody>
                  {(wa.sessions as Record<string, unknown>[]).map((s) => (
                    <tr key={String(s.accountKey)} className="border-b border-border/50">
                      <td className="px-2 py-1.5 font-mono">
                        {String(s.userId)}:{String(s.accountId)}
                      </td>
                      <td className="px-2 py-1.5 text-muted">
                        {String(s.lastState ?? '—')}
                      </td>
                      <td className="px-2 py-1.5">
                        {s.isConnected ? (
                          <span className="text-wa-green">yes</span>
                        ) : (
                          <span className="text-muted">no</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {data?.checks && (
        <Card title="Health checks">
          <ul className="space-y-2">
            {data.checks.map((c) => (
              <li
                key={c.id}
                className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    c.ok ? 'bg-wa-green' : 'bg-red-400'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text">{c.label}</p>
                  {c.detail && (
                    <p className="truncate text-xs text-muted">{c.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <details className="rounded-xl border border-border bg-panel">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted hover:text-text">
          Raw JSON — GET /api/admin/system-health
        </summary>
        <div className="border-t border-border p-4">
          <JsonBlock data={data ?? { loading: true }} />
        </div>
      </details>
    </div>
  )
}
