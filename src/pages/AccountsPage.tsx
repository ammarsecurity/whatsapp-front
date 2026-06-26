import { Eraser, QrCode, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AccountPicker } from '../components/AccountPicker'
import { ConnectionBadge } from '../components/ConnectionBadge'
import { JsonBlock } from '../components/JsonBlock'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { useConfirm } from '../context/ConfirmContext'
import { useAccounts } from '../context/AccountContext'
import { api, ApiClientError } from '../lib/api'
import { formatAccountLabel, slugifyAccountName } from '../lib/accountDisplay'
import { isAccountReady } from '../lib/accountStatus'
import { parseQrApiResponse } from '../lib/qr'

export function AccountsPage() {
  const confirmDialog = useConfirm()
  const {
    selectedAccountId,
    selectAccount,
    refreshAccounts,
    selectedLiveStatus,
    liveStatusPolling,
    liveStatusError,
    refreshSelectedLiveStatus,
  } = useAccounts()

  const [newAccountName, setNewAccountName] = useState('')
  const [qrData, setQrData] = useState<unknown>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [watchConnection, setWatchConnection] = useState(false)
  const [showTechnical, setShowTechnical] = useState(false)

  const linkStatus = selectedLiveStatus
  const statusPolling = liveStatusPolling
  const statusError = liveStatusError
  const refreshLinkStatus = refreshSelectedLiveStatus

  const accountReady = isAccountReady(linkStatus?.raw)
  const isLinked =
    accountReady || linkStatus?.state === 'connected'
  const displayName = selectedAccountId
    ? formatAccountLabel(selectedAccountId)
    : ''

  useEffect(() => {
    setQrData(null)
    setQrImage(null)
    setWatchConnection(false)
  }, [selectedAccountId])

  async function applyQrResponse(data: unknown) {
    setQrData(data)
    setQrImage(null)
    if (!data || typeof data !== 'object') return
    const parsed = await parseQrApiResponse(data as Record<string, unknown>)
    if (parsed.ok) {
      setQrImage(parsed.imageSrc)
      setError(null)
    } else if (parsed.error) {
      setError(parsed.error)
    }
  }

  async function fetchQrForAccount(regenerate = false) {
    if (!selectedAccountId) return
    setWatchConnection(true)
    const action = regenerate ? 'reset' : 'qr'
    await run(action, () => api.getQr(selectedAccountId, regenerate), applyQrResponse)
  }

  async function addAccount() {
    const slug = slugifyAccountName(newAccountName)
    if (!newAccountName.trim()) {
      setError('Enter a name for this WhatsApp account')
      return
    }
    await run('add', () => api.addAccount({ accountId: slug }), async () => {
      selectAccount(slug)
      setNewAccountName('')
      setSuccess(`"${formatAccountLabel(slug)}" added — scan the QR code to link`)
      await refreshAccounts()
      await fetchQrForAccount(false)
    })
  }

  async function disconnectSelectedAccount() {
    if (!selectedAccountId) return
    const ok = await confirmDialog({
      title: 'Disconnect WhatsApp',
      message: `Unlink "${displayName}" from this server? The account stays in your list — you can link again with a QR code.`,
      confirmLabel: 'Disconnect',
      variant: 'danger',
    })
    if (!ok) return
    const id = selectedAccountId
    await run('disconnect', () => api.disconnectAccount(id), async () => {
      setSuccess(`"${displayName}" disconnected`)
      setQrData(null)
      setQrImage(null)
      setWatchConnection(false)
      await refreshAccounts()
      await refreshLinkStatus()
    })
  }

  async function clearStuckSessions() {
    const ok = await confirmDialog({
      title: 'Clear stuck sessions',
      message:
        'Stop and remove all pending WhatsApp sessions (QR, pairing, disconnected) that are not ready to send? Ready accounts will not be affected. You can link again with QR afterward.',
      confirmLabel: 'Clear stuck sessions',
      variant: 'danger',
    })
    if (!ok) return
    await run('clear-stuck', () => api.clearStuckSessions(), async (data) => {
      const result = data as { clearedCount?: number; message?: string }
      setSuccess(
        result.message ??
          (result.clearedCount
            ? `Cleared ${result.clearedCount} stuck session(s).`
            : 'No stuck sessions found.'),
      )
      setQrData(null)
      setQrImage(null)
      setWatchConnection(false)
      await refreshAccounts()
      await refreshLinkStatus()
    })
  }

  async function deleteSelectedAccount() {
    if (!selectedAccountId) return
    const ok = await confirmDialog({
      title: 'Remove account',
      message: `Remove "${displayName}" from the server? You will need to link again with a new QR.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    })
    if (!ok) return
    const id = selectedAccountId
    await run(`delete-${id}`, () => api.deleteAccount(id), async () => {
      setSuccess(`"${displayName}" removed`)
      setQrData(null)
      setQrImage(null)
      await refreshAccounts()
    })
  }

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
      await onSuccess?.(data)
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Something went wrong',
      )
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp accounts</h1>
        <p className="mt-1 text-sm text-muted">
          Add your numbers, link them with QR, and switch between them anytime
        </p>
      </header>

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

      <Card title="Your accounts">
        <AccountPicker showStatus={false} />
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <p className="min-w-[200px] flex-1 text-sm text-muted">
            If an account shows the wrong status or send/check hangs, clear stuck
            sessions on the server (QR, pairing, disconnected). Ready accounts stay
            connected.
          </p>
          <Button
            variant="secondary"
            loading={loading === 'clear-stuck'}
            onClick={clearStuckSessions}
          >
            <Eraser className="h-4 w-4" />
            Clear stuck sessions
          </Button>
        </div>
      </Card>

      <Card
        title="Add a new WhatsApp"
        description="Give it a name you will recognize — e.g. Work, Sales, Support"
        action={<UserPlus className="h-4 w-4 text-muted" />}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Input
              label="Account name"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              placeholder="Work phone"
              hint={
                newAccountName.trim()
                  ? `Will be saved as: ${slugifyAccountName(newAccountName)}`
                  : 'Use letters and numbers only'
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') addAccount()
              }}
            />
          </div>
          <Button loading={loading === 'add'} onClick={addAccount}>
            Add account
          </Button>
        </div>
      </Card>

      {selectedAccountId && (
        <Card
          title={`Link ${displayName}`}
          description="Open WhatsApp on your phone → Linked devices → Link a device"
          action={<QrCode className="h-4 w-4 text-muted" />}
        >
          <div className="mb-4 space-y-3">
            {linkStatus ? (
              <ConnectionBadge
                state={accountReady ? 'connected' : linkStatus.state}
                label={accountReady ? 'Ready to send messages' : linkStatus.label}
                polling={statusPolling && !accountReady}
              />
            ) : watchConnection ? (
              <ConnectionBadge state="connecting" label="Checking connection…" polling />
            ) : null}

            {accountReady && (
              <Alert variant="success" title="Linked">
                This account is connected. Go to Messages to send.
              </Alert>
            )}

            {isLinked && !accountReady && (
              <Alert variant="info" title="Connected">
                WhatsApp is linked but still starting up. Wait a moment or refresh.
              </Alert>
            )}

            {statusError && !accountReady && (
              <Alert variant="error" title="Connection">
                {statusError}
              </Alert>
            )}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {!accountReady && (
              <Button
                variant="secondary"
                loading={loading === 'qr'}
                onClick={() => fetchQrForAccount(false)}
              >
                Show QR code
              </Button>
            )}
            {isLinked && (
              <Button
                variant="secondary"
                loading={loading === 'disconnect'}
                onClick={disconnectSelectedAccount}
              >
                Disconnect
              </Button>
            )}
            <Button
              variant="ghost"
              loading={loading === 'reset'}
              onClick={() => fetchQrForAccount(true)}
            >
              {isLinked ? 'Link another phone (new QR)' : 'Generate new QR'}
            </Button>
            {!watchConnection && !accountReady && (
              <Button variant="ghost" onClick={() => setWatchConnection(true)}>
                Check connection
              </Button>
            )}
            <Button
              variant="danger"
              loading={loading === `delete-${selectedAccountId}`}
              onClick={deleteSelectedAccount}
            >
              Remove account
            </Button>
          </div>

          {qrImage && !accountReady && (
            <div className="mb-4 flex flex-col items-center gap-2 rounded-xl bg-white p-5">
              <img
                src={qrImage}
                alt="WhatsApp QR code"
                className="h-64 w-64 object-contain"
              />
              <p className="text-center text-xs text-gray-600">
                Scan with WhatsApp → Linked devices → Link a device
              </p>
              {statusPolling && (
                <p className="text-center text-xs text-amber-600">
                  Waiting for scan…
                </p>
              )}
            </div>
          )}

          {(linkStatus || qrData !== null) && (
            <details
              open={showTechnical}
              onToggle={(e) => setShowTechnical((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer text-xs text-muted hover:text-text">
                Technical details (for developers)
              </summary>
              <div className="mt-2 space-y-2">
                {linkStatus && <JsonBlock data={linkStatus.raw} />}
                {qrData !== null && !accountReady && <JsonBlock data={qrData} />}
              </div>
            </details>
          )}
        </Card>
      )}
    </div>
  )
}
