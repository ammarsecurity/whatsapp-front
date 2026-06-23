import { Check, RefreshCw, Smartphone, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, ApiClientError } from '../lib/api'
import type { WaAccount } from '../types/models'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'

interface AccountWithLiveStatus extends WaAccount {
  connectionLabel?: string
  connectionState?: 'connected' | 'connecting' | 'disconnected' | 'unknown'
}

interface AccountsListProps {
  activeId: string
  onSelect: (accountId: string) => void
  onDelete: (accountId: string) => void
  deletingId?: string | null
  refreshKey?: number
}

function statusFromAccount(acc: WaAccount): AccountWithLiveStatus {
  const connected =
    acc.isConnected === true ||
    acc.connected === true ||
    acc.status === 'connected'
  const ready =
    acc.isReady === true ||
    acc.ready === true ||
    connected

  let connectionState: AccountWithLiveStatus['connectionState'] = 'unknown'
  let connectionLabel = 'Unknown'

  if (connected || ready) {
    connectionState = 'connected'
    connectionLabel = 'Connected'
  } else if (acc.status === 'connecting') {
    connectionState = 'connecting'
    connectionLabel = 'Connecting…'
  } else {
    connectionState = 'disconnected'
    connectionLabel = 'Disconnected'
  }

  return { ...acc, connectionState, connectionLabel }
}

export function AccountsList({
  activeId,
  onSelect,
  onDelete,
  deletingId = null,
  refreshKey = 0,
}: AccountsListProps) {
  const [accounts, setAccounts] = useState<AccountWithLiveStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await api.listAccounts()
      setAccounts(list.map(statusFromAccount))
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load accounts',
      )
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const statusColor = (
    state?: AccountWithLiveStatus['connectionState'],
  ) => {
    if (state === 'connected') return 'bg-wa-green/20 text-wa-green'
    if (state === 'connecting') return 'bg-amber-500/15 text-amber-300'
    if (state === 'disconnected') return 'bg-red-500/10 text-red-300'
    return 'bg-border/50 text-muted'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted">
          {loading
            ? 'Loading…'
            : `${accounts.length} account${accounts.length === 1 ? '' : 's'}`}
        </p>
        <Button variant="ghost" onClick={load} loading={loading}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!loading && !error && accounts.length === 0 && (
        <Alert variant="info" title="No accounts">
          Add a new account below or verify your API connection.
        </Alert>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {accounts.map((acc) => {
          const selected = acc.accountId === activeId
          const isDeleting = deletingId === acc.accountId
          return (
            <div
              key={acc.accountId}
              className={`flex items-start gap-2 rounded-xl border p-3 transition-all ${
                selected
                  ? 'border-wa-green/50 bg-wa-green/10 ring-1 ring-wa-green/30'
                  : 'border-border bg-panel hover:border-wa-green/30'
              } ${isDeleting ? 'opacity-60' : ''}`}
            >
              <button
                type="button"
                onClick={() => onSelect(acc.accountId)}
                className="flex min-w-0 flex-1 items-start gap-3 text-left"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    selected ? 'bg-wa-green text-surface' : 'bg-card text-muted'
                  }`}
                >
                  <Smartphone className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-text">
                      {acc.accountId}
                    </p>
                    {selected && (
                      <Check className="h-4 w-4 shrink-0 text-wa-green" />
                    )}
                  </div>
                  {acc.phone && (
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {acc.phone}
                    </p>
                  )}
                  <span
                    className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColor(acc.connectionState)}`}
                  >
                    {acc.connectionLabel ?? acc.status ?? 'Unknown'}
                  </span>
                </div>
              </button>

              <button
                type="button"
                title={`Delete ${acc.accountId}`}
                disabled={isDeleting}
                onClick={() => onDelete(acc.accountId)}
                className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-red-500/15 hover:text-red-400 disabled:cursor-not-allowed"
              >
                <Trash2
                  className={`h-4 w-4 ${isDeleting ? 'animate-pulse' : ''}`}
                />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
