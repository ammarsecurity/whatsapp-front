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
import { parseAccountStatus } from '../lib/accountStatus'

interface AccountPickerProps {
  showStatus?: boolean
  compact?: boolean
  className?: string
  /** Called when the add-account tile is clicked. Defaults to navigating to /accounts. */
  onAddAccount?: () => void
}

export function AccountPicker({
  showStatus = true,
  compact = false,
  className = '',
  onAddAccount,
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
      <div className={`space-y-2 ${className}`}>
        <div className="skeleton h-4 w-32 rounded-lg" />
        <div className="skeleton h-11 w-full rounded-[14px]" />
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div
        className={`flex flex-wrap items-center gap-4 rounded-[16px] bg-slate-50 p-6 ${className}`}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white text-muted shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text">لا توجد حسابات واتساب بعد</p>
          <p className="mt-1 text-[13px] text-muted">
            أضف أول رقم من صفحة الحسابات ثم اربطه بمسح رمز QR.
          </p>
        </div>
        <Link to="/accounts#add-account">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            إضافة حساب
          </Button>
        </Link>
      </div>
    )
  }

  const selected = accounts.find((a) => a.accountId === selectedAccountId)
  const selectedMeta = selected ? metaForAccount(selected) : null

  if (compact) {
    return (
      <label className={`block space-y-2 ${className}`}>
        <span className="text-[15px] font-medium text-text">حساب واتساب</span>
        <div className="relative">
          <select
            value={selectedAccountId}
            onChange={(e) => selectAccount(e.target.value)}
            className="min-h-11 w-full appearance-none rounded-[14px] border border-border bg-white py-2.5 ps-4 pe-10 text-[15px] font-medium text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          >
            {accounts.map((acc) => (
              <option key={acc.accountId} value={acc.accountId}>
                {formatAccountLabel(acc.accountId, acc.note)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        </div>
      </label>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-medium text-text">اختر حساب واتساب</p>
        <Button variant="ghost" loading={loading} onClick={() => refreshAccounts()}>
          تحديث القائمة
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {accounts.map((acc) => {
          const active = acc.accountId === selectedAccountId
          const meta = metaForAccount(acc)
          return (
            <button
              key={acc.accountId}
              type="button"
              onClick={() => selectAccount(acc.accountId)}
              className={`flex min-h-[72px] items-center gap-3 rounded-[16px] p-4 text-start transition-all ${
                active
                  ? 'bg-primary-50 ring-2 ring-primary-500'
                  : 'bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${
                  active ? 'bg-primary-500 text-white' : 'bg-white text-muted'
                }`}
              >
                <Smartphone className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-text">
                  {formatAccountLabel(acc.accountId, acc.note)}
                </p>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[13px] font-medium ${ACCOUNT_STATUS_STYLES[meta.tone]}`}
                >
                  {meta.label}
                </span>
              </div>
            </button>
          )
        })}

        {onAddAccount ? (
          <button
            type="button"
            onClick={onAddAccount}
            className="flex min-h-[72px] items-center gap-3 rounded-[16px] border-2 border-dashed border-primary-300 bg-white p-4 text-start transition-colors hover:border-primary-500 hover:bg-primary-50"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-primary-50 text-primary-700">
              <Plus className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-primary-700">إضافة حساب آخر</p>
              <p className="mt-0.5 text-[13px] text-muted">يُنشأ معرّف وتوكن تلقائياً ثم الربط بـ QR</p>
            </div>
          </button>
        ) : (
          <Link
            to="/accounts#add-account"
            className="flex min-h-[72px] items-center gap-3 rounded-[16px] border-2 border-dashed border-primary-300 bg-white p-4 text-start transition-colors hover:border-primary-500 hover:bg-primary-50"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-primary-50 text-primary-700">
              <Plus className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-primary-700">إضافة حساب آخر</p>
              <p className="mt-0.5 text-[13px] text-muted">يُنشأ معرّف وتوكن تلقائياً ثم الربط بـ QR</p>
            </div>
          </Link>
        )}
      </div>

      {showStatus && selected && selectedMeta && (
        <div className="flex flex-wrap items-center gap-2 rounded-[14px] bg-slate-50 px-4 py-3">
          <span className="text-[13px] text-muted">المحدد:</span>
          <span className="text-[15px] font-medium text-text">
            {formatAccountLabel(selected.accountId, selected.note)}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[13px] font-medium ${ACCOUNT_STATUS_STYLES[selectedMeta.tone]}`}
          >
            {selectedMeta.label}
          </span>
        </div>
      )}
    </div>
  )
}

export function SelectedAccountStatus({
  statusData,
  polling,
}: {
  statusData: ReturnType<typeof parseAccountStatus> | null
  polling?: boolean
}) {
  if (!statusData) return null
  const meta = liveStatusDisplayMeta(statusData)
  const state =
    meta.tone === 'ready'
      ? 'connected'
      : meta.tone === 'connecting'
        ? 'connecting'
        : meta.tone === 'offline'
          ? 'disconnected'
          : 'unknown'
  return (
    <ConnectionBadge
      state={state}
      label={meta.label}
      polling={polling && meta.tone !== 'ready'}
    />
  )
}
