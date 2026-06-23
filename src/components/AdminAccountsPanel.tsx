import {
  Pause,
  QrCode,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import { useConfirm } from '../context/ConfirmContext'
import { api, ApiClientError } from '../lib/api'
import { parseQrApiResponse } from '../lib/qr'
import type { AdminWaAccount } from '../types/models'

function statusLabel(acc: AdminWaAccount): { text: string; className: string } {
  if (acc.isConnected || acc.isReady) {
    return { text: 'Connected', className: 'bg-wa-green/15 text-wa-green' }
  }
  if (acc.hasQrCode || acc.liveState === 'INITIALIZING') {
    return { text: 'Awaiting scan', className: 'bg-amber-500/15 text-amber-300' }
  }
  if (acc.initError) {
    return { text: 'Error', className: 'bg-red-500/15 text-red-300' }
  }
  return { text: 'Offline', className: 'bg-border/40 text-muted' }
}

export function AdminAccountsPanel() {
  const confirmDialog = useConfirm()
  const [accounts, setAccounts] = useState<AdminWaAccount[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [qrModal, setQrModal] = useState<{
    account: AdminWaAccount
    imageSrc: string | null
    error: string | null
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setAccounts(await api.listAllAccountsAdmin())
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Failed to load accounts',
      )
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = accounts.filter((a) => {
    const q = filter.trim().toLowerCase()
    if (!q) return true
    return (
      a.accountId.toLowerCase().includes(q) ||
      String(a.userId).includes(q) ||
      (a.ownerUsername ?? '').toLowerCase().includes(q)
    )
  })

  async function runAction(
    key: string,
    fn: () => Promise<unknown>,
    okMessage: string,
  ) {
    setActionKey(key)
    setError(null)
    setSuccess(null)
    try {
      await fn()
      setSuccess(okMessage)
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed')
    } finally {
      setActionKey(null)
    }
  }

  async function handleDisconnect(acc: AdminWaAccount) {
    const ok = await confirmDialog({
      title: 'Stop session',
      message: `Stop WhatsApp for "${acc.accountId}" (user ${acc.ownerUsername ?? acc.userId})? The account stays in the database.`,
      confirmLabel: 'Stop',
      variant: 'danger',
    })
    if (!ok) return
    await runAction(
      `dc-${acc.userId}-${acc.accountId}`,
      () => api.adminDisconnectAccount(acc.userId, acc.accountId),
      `Session stopped for ${acc.accountId}`,
    )
  }

  async function handleReset(acc: AdminWaAccount) {
    const ok = await confirmDialog({
      title: 'Reset session',
      message: `Clear session files for "${acc.accountId}" and prepare a new QR?`,
      confirmLabel: 'Reset',
      variant: 'danger',
    })
    if (!ok) return
    await runAction(
      `rs-${acc.userId}-${acc.accountId}`,
      () => api.adminResetSession(acc.userId, acc.accountId),
      `Session reset for ${acc.accountId}`,
    )
  }

  async function handleDelete(acc: AdminWaAccount) {
    const ok = await confirmDialog({
      title: 'Delete account',
      message: `Permanently delete "${acc.accountId}" for user ${acc.ownerUsername ?? acc.userId}?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    await runAction(
      `del-${acc.userId}-${acc.accountId}`,
      () => api.adminDeleteAccount(acc.userId, acc.accountId),
      `Deleted ${acc.accountId}`,
    )
  }

  async function handleQr(acc: AdminWaAccount, regenerate: boolean) {
    const key = `qr-${acc.userId}-${acc.accountId}`
    setActionKey(key)
    setError(null)
    try {
      const data = await api.adminGetQr(acc.userId, acc.accountId, regenerate)
      const parsed = await parseQrApiResponse(data as Record<string, unknown>)
      setQrModal({
        account: acc,
        imageSrc: parsed.imageSrc,
        error: parsed.error,
      })
      if (parsed.ok) await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'QR fetch failed')
    } finally {
      setActionKey(null)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" title="Done" onDismiss={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Card title="All WhatsApp accounts" description="GET /api/admin/accounts">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Input
              label="Filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="account, user id, username…"
            />
          </div>
          <Button variant="secondary" loading={loading} onClick={load}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {loading && accounts.length === 0 ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <Alert variant="info" title="No accounts">
            No WhatsApp accounts match your filter.
          </Alert>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-panel text-xs text-muted">
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Memory</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((acc) => {
                  const st = statusLabel(acc)
                  const base = `${acc.userId}-${acc.accountId}`
                  return (
                    <tr
                      key={base}
                      className="border-b border-border/60 last:border-0 hover:bg-panel/40"
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium text-text">
                          {acc.ownerUsername ?? '—'}
                        </p>
                        <p className="text-xs text-muted">ID {acc.userId}</p>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{acc.accountId}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}
                        >
                          {st.text}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {acc.inMemory ? 'Loaded' : '—'}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2 text-xs text-muted">
                        {acc.liveState ?? acc.initError ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            variant="ghost"
                            loading={actionKey === `qr-${base}`}
                            onClick={() => handleQr(acc, false)}
                            title="Fetch QR"
                          >
                            <QrCode className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            loading={actionKey === `rs-${base}`}
                            onClick={() => handleReset(acc)}
                            title="Reset session"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            loading={actionKey === `dc-${base}`}
                            onClick={() => handleDisconnect(acc)}
                            title="Stop session"
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="danger"
                            loading={actionKey === `del-${base}`}
                            onClick={() => handleDelete(acc)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-md rounded-xl border border-border bg-panel p-5 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold">QR — {qrModal.account.accountId}</h3>
            <p className="mb-4 text-sm text-muted">
              User: {qrModal.account.ownerUsername ?? qrModal.account.userId}
            </p>
            {qrModal.imageSrc ? (
              <div className="mb-4 flex justify-center rounded-lg bg-white p-4">
                <img
                  src={qrModal.imageSrc}
                  alt="WhatsApp QR"
                  className="h-56 w-56 object-contain"
                />
              </div>
            ) : (
              <Alert variant="error" title="QR unavailable" className="mb-4">
                {qrModal.error ?? 'No QR in response'}
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                loading={actionKey === `qr-${qrModal.account.userId}-${qrModal.account.accountId}`}
                onClick={() => handleQr(qrModal.account, true)}
              >
                New QR (reset)
              </Button>
              <Button variant="ghost" onClick={() => setQrModal(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
