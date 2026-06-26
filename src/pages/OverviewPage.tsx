import { Activity, Radio } from 'lucide-react'
import { useCallback, useState } from 'react'
import { AccountPicker, SelectedAccountStatus } from '../components/AccountPicker'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useAccounts } from '../context/AccountContext'
import { ApiClientError } from '../lib/api'
import { formatAccountLabel } from '../lib/accountDisplay'
import { isAccountReady } from '../lib/accountStatus'
import { Link } from 'react-router-dom'

export function OverviewPage() {
  const {
    selectedAccountId,
    selectedLiveStatus,
    liveStatusPolling,
    refreshSelectedLiveStatus,
  } = useAccounts()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accountStatus = selectedLiveStatus
  const polling = liveStatusPolling
  const accountReady = isAccountReady(accountStatus?.raw)
  const displayName = selectedAccountId
    ? formatAccountLabel(selectedAccountId)
    : ''

  const refreshStatus = useCallback(async () => {
    if (!selectedAccountId) return
    setLoading(true)
    setError(null)
    try {
      await refreshSelectedLiveStatus()
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Failed to load status',
      )
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId, refreshSelectedLiveStatus])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted">
          See which WhatsApp account is active and whether it is ready
        </p>
      </header>

      <Card title="WhatsApp account">
        <AccountPicker compact showStatus={false} className="mb-4" />
        {selectedAccountId ? (
          <div className="flex flex-wrap items-center gap-3">
            <SelectedAccountStatus statusData={accountStatus} polling={polling} />
            {!accountReady && (
              <Alert variant="info" title="Not ready yet" className="flex-1">
                Link <strong>{displayName}</strong> under{' '}
                <Link to="/accounts" className="text-wa-green underline">
                  Accounts
                </Link>{' '}
                by scanning the QR code.
              </Alert>
            )}
            <Button loading={loading} onClick={refreshStatus}>
              Refresh
            </Button>
          </div>
        ) : null}
      </Card>

      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {selectedAccountId && accountReady && (
        <Card title="Quick actions">
          <div className="flex flex-wrap gap-3">
            <Link to="/messages">
              <Button>Send a message</Button>
            </Link>
            <Link to="/accounts">
              <Button variant="secondary">Manage accounts</Button>
            </Link>
          </div>
        </Card>
      )}

      <Card title="Getting started">
        <ul className="space-y-3 text-sm text-muted">
          <li className="flex gap-2">
            <Activity className="mt-0.5 h-4 w-4 shrink-0 text-wa-green" />
            <span>
              <strong className="text-text">1. Add an account</strong> — go to
              Accounts and give your WhatsApp a name (Work, Support, etc.).
            </span>
          </li>
          <li className="flex gap-2">
            <Radio className="mt-0.5 h-4 w-4 shrink-0 text-wa-green" />
            <span>
              <strong className="text-text">2. Scan the QR</strong> — link your
              phone the same way as WhatsApp Web.
            </span>
          </li>
          <li className="flex gap-2">
            <Radio className="mt-0.5 h-4 w-4 shrink-0 text-wa-green" />
            <span>
              <strong className="text-text">3. Switch accounts</strong> — use the
              sidebar or the picker on any page when you have more than one number.
            </span>
          </li>
          <li className="flex gap-2">
            <Radio className="mt-0.5 h-4 w-4 shrink-0 text-wa-green" />
            <span>
              <strong className="text-text">4. Send messages</strong> — open
              Messages after the status shows &quot;Ready to send&quot;.
            </span>
          </li>
        </ul>
      </Card>
    </div>
  )
}
