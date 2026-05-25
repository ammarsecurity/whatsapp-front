import { QrCode, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { AccountsList } from '../components/AccountsList'
import { ConnectionBadge } from '../components/ConnectionBadge'
import { JsonBlock } from '../components/JsonBlock'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { useConfirm } from '../context/ConfirmContext'
import { useAccountStatusPoll } from '../hooks/useAccountStatusPoll'
import { api, ApiClientError } from '../lib/api'
import { qrResponseToImageSrc } from '../lib/qr'
import { getAccountId, setAccountId } from '../lib/storage'

export function AccountsPage() {
  const confirmDialog = useConfirm()
  const [accountId, setAccountIdState] = useState(getAccountId)
  const [newAccountId, setNewAccountId] = useState('')
  const [qrData, setQrData] = useState<unknown>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [result, setResult] = useState<unknown>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [watchConnection, setWatchConnection] = useState(true)
  const [listRefresh, setListRefresh] = useState(0)

  const { status: linkStatus, polling: statusPolling, error: statusError } =
    useAccountStatusPoll(accountId, watchConnection)

  const isLinked = linkStatus?.state === 'connected'

  function selectAccount(id: string) {
    setAccountIdState(id)
    setAccountId(id)
  }

  function persistAccount() {
    setAccountId(accountId)
    setSuccess(`Active account set to ${accountId}`)
  }

  async function deleteAccount(id: string) {
    const ok = await confirmDialog({
      title: 'Delete account',
      message: `Remove "${id}" from the server? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    run(`delete-${id}`, () => api.deleteAccount(id), () => {
      setSuccess(`Account "${id}" deleted`)
      if (accountId === id) {
        setAccountIdState('')
        setAccountId('')
        setQrData(null)
        setQrImage(null)
      }
    })
  }

  const deletingId =
    loading?.startsWith('delete-') ? loading.slice(7) : null

  async function run(
    action: string,
    fn: () => Promise<unknown>,
    onSuccess?: (data: unknown) => void | Promise<void>,
  ) {
    setLoading(action)
    setError(null)
    setSuccess(null)
    try {
      const data = await fn()
      setResult(data)
      await onSuccess?.(data)
      setListRefresh((k) => k + 1)
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Request failed',
      )
      setResult(err instanceof ApiClientError ? err.body : null)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
        <p className="mt-1 text-sm text-muted">
          Your WhatsApp accounts — select one to manage and link
        </p>
      </header>

      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert
          variant="success"
          title="Success"
          onDismiss={() => setSuccess(null)}
        >
          {success}
        </Alert>
      )}

      <Card title="Your accounts" description="GET /api/accounts">
        <AccountsList
          activeId={accountId}
          onSelect={selectAccount}
          onDelete={deleteAccount}
          deletingId={deletingId}
          refreshKey={listRefresh}
        />
      </Card>

      <Card title="Active account">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Input
              label="Account ID"
              value={accountId}
              onChange={(e) => setAccountIdState(e.target.value)}
            />
          </div>
          <Button variant="secondary" onClick={persistAccount}>
            Set active
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Add account"
          description="POST /api/accounts"
          action={<UserPlus className="h-4 w-4 text-muted" />}
        >
          <div className="space-y-3">
            <Input
              label="New account ID"
              value={newAccountId}
              onChange={(e) => setNewAccountId(e.target.value)}
              placeholder="ibsprimary"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                loading={loading === 'add'}
                onClick={() =>
                  run('add', () =>
                    api.addAccount({ accountId: newAccountId || accountId }),
                  )
                }
              >
                Add
              </Button>
              <Button
                variant="secondary"
                loading={loading === 'addPath'}
                onClick={() =>
                  run('addPath', () =>
                    api.addAccountByPath(newAccountId || accountId),
                  )
                }
              >
                Add (path)
              </Button>
            </div>
          </div>
        </Card>

        <Card
          title="Link device"
          description={`${accountId} — status / qr`}
          action={<QrCode className="h-4 w-4 text-muted" />}
        >
          <div className="mb-4 space-y-3">
            {linkStatus ? (
              <ConnectionBadge
                state={linkStatus.state}
                label={linkStatus.label}
                polling={statusPolling && !isLinked}
              />
            ) : watchConnection ? (
              <ConnectionBadge
                state="connecting"
                label="Checking…"
                polling
              />
            ) : null}

            {isLinked && (
              <Alert variant="success" title="Connected">
                Account is ready to send messages.
              </Alert>
            )}

            {statusError && !isLinked && (
              <Alert variant="error" title="Connection status">
                {statusError}
              </Alert>
            )}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={loading === 'qr'}
              disabled={isLinked}
              onClick={() => {
                setWatchConnection(true)
                run('qr', () => api.getQr(accountId), async (data) => {
                  setQrData(data)
                  setQrImage(null)
                  if (data && typeof data === 'object') {
                    try {
                      const src = await qrResponseToImageSrc(
                        data as Record<string, unknown>,
                      )
                      setQrImage(src)
                    } catch {
                      setError('Could not generate QR image')
                    }
                  }
                })
              }}
            >
              Fetch QR code
            </Button>
            <Button
              variant="ghost"
              onClick={() => setWatchConnection((v) => !v)}
            >
              {watchConnection ? 'Stop polling' : 'Poll status'}
            </Button>
          </div>

          {qrImage && !isLinked && (
            <div className="mb-4 flex flex-col items-center gap-2 rounded-xl bg-white p-5">
              <img
                src={qrImage}
                alt="WhatsApp QR"
                className="h-64 w-64 object-contain"
              />
              <p className="text-center text-xs text-gray-600">
                WhatsApp → Linked devices → Link a device
              </p>
              {statusPolling && (
                <p className="text-center text-xs text-amber-600">
                  Waiting for scan…
                </p>
              )}
            </div>
          )}

          {linkStatus && (
            <details className="mb-3">
              <summary className="cursor-pointer text-xs text-muted hover:text-text">
                API details
              </summary>
              <div className="mt-2">
                <JsonBlock data={linkStatus.raw} />
              </div>
            </details>
          )}

          {qrData !== null && !isLinked ? <JsonBlock data={qrData} /> : null}
        </Card>
      </div>

      {result !== null && (
        <Card title="Last response">
          <JsonBlock data={result} />
        </Card>
      )}
    </div>
  )
}
