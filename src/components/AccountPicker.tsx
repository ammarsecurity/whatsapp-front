import { ChevronDown, Plus, Smartphone } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  ACCOUNT_STATUS_STYLES,
  accountStatusLabel,
  formatAccountLabel,
  liveStatusDisplayMeta,
} from '../lib/accountDisplay'
import { useAccounts } from '../context/AccountContext'
import { Button } from './ui/Button'
import { ConnectionBadge } from './ConnectionBadge'
import { parseAccountStatus, isAccountReady } from '../lib/accountStatus'

interface AccountPickerProps {
  /** Show live status badge for the selected account */
  showStatus?: boolean
  /** Compact single-line layout */
  compact?: boolean
  className?: string
}

export function AccountPicker({
  showStatus = true,
  compact = false,
  className = '',
}: AccountPickerProps) {
  const {
    accounts,
    selectedAccountId,
    selectAccount,
    loading,
    refreshAccounts,
    selectedLiveStatus,
  } = useAccounts()

  function metaForAccount(acc: (typeof accounts)[number]) {
    if (acc.accountId === selectedAccountId) {
      return liveStatusDisplayMeta(selectedLiveStatus, acc)
    }
    return accountStatusLabel(acc)
  }

  if (loading && accounts.length === 0) {
    return (
      <p className={`text-sm text-muted ${className}`}>Loading your accounts…</p>
    )
  }

  if (accounts.length === 0) {
    return (
      <div
        className={`flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-panel/50 p-4 ${className}`}
      >
        <Smartphone className="h-8 w-8 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text">No WhatsApp accounts yet</p>
          <p className="text-sm text-muted">
            Add your first number under Accounts, then link it with a QR code.
          </p>
        </div>
        <Link to="/accounts">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            Add account
          </Button>
        </Link>
      </div>
    )
  }

  const selected = accounts.find((a) => a.accountId === selectedAccountId)
  const selectedMeta = selected ? metaForAccount(selected) : null

  if (compact) {
    return (
      <label className={`block space-y-1.5 ${className}`}>
        <span className="text-sm font-medium text-muted">WhatsApp account</span>
        <div className="relative">
          <select
            value={selectedAccountId}
            onChange={(e) => selectAccount(e.target.value)}
            className="w-full appearance-none rounded-lg border border-border bg-panel py-2.5 pl-3 pr-10 text-sm font-medium text-text outline-none focus:border-wa-green"
          >
            {accounts.map((acc) => {
              const meta = metaForAccount(acc)
              return (
                <option key={acc.accountId} value={acc.accountId}>
                  {formatAccountLabel(acc.accountId)} — {meta.label}
                </option>
              )
            })}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        </div>
      </label>
    )
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-text">Choose WhatsApp account</p>
        <Button variant="ghost" loading={loading} onClick={() => refreshAccounts()}>
          Refresh list
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {accounts.map((acc) => {
          const active = acc.accountId === selectedAccountId
          const meta = metaForAccount(acc)
          return (
            <button
              key={acc.accountId}
              type="button"
              onClick={() => selectAccount(acc.accountId)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                active
                  ? 'border-wa-green/50 bg-wa-green/10 ring-1 ring-wa-green/30'
                  : 'border-border bg-panel hover:border-wa-green/30'
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  active ? 'bg-wa-green text-surface' : 'bg-card text-muted'
                }`}
              >
                <Smartphone className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-text">
                  {formatAccountLabel(acc.accountId)}
                </p>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${ACCOUNT_STATUS_STYLES[meta.tone]}`}
                >
                  {meta.label}
                </span>
              </div>
            </button>
          )
        })}

        <Link
          to="/accounts"
          className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-panel/40 p-3 text-sm font-medium text-muted transition-colors hover:border-wa-green/40 hover:text-wa-green"
        >
          <Plus className="h-4 w-4" />
          Add another account
        </Link>
      </div>

      {showStatus && selected && selectedMeta && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface/40 px-3 py-2">
          <span className="text-sm text-muted">Selected:</span>
          <span className="text-sm font-medium text-text">
            {formatAccountLabel(selected.accountId)}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ACCOUNT_STATUS_STYLES[selectedMeta.tone]}`}
          >
            {selectedMeta.label}
          </span>
        </div>
      )}
    </div>
  )
}

/** Live connection badge for the currently selected account */
export function SelectedAccountStatus({
  statusData,
  polling,
}: {
  statusData: ReturnType<typeof parseAccountStatus> | null
  polling?: boolean
}) {
  if (!statusData) return null
  const ready = isAccountReady(statusData.raw)
  return (
    <ConnectionBadge
      state={ready ? 'connected' : statusData.state}
      label={ready ? 'Ready to send' : statusData.label}
      polling={polling && !ready}
    />
  )
}
