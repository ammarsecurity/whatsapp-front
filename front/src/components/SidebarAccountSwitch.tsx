import { ChevronDown, QrCode, Smartphone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ACCOUNT_STATUS_STYLES,
  accountStatusLabel,
  formatAccountLabel,
  liveStatusDisplayMeta,
} from '../lib/accountDisplay'
import { useAccounts } from '../context/AccountContext'
import type { AccountStatusMeta } from '../lib/accountDisplay'

const DOT: Record<AccountStatusMeta['tone'], string> = {
  ready: 'bg-success',
  connecting: 'bg-warning animate-pulse',
  offline: 'bg-danger',
  unknown: 'bg-slate-400',
}

function StatusChip({ meta }: { meta: AccountStatusMeta }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium ${ACCOUNT_STATUS_STYLES[meta.tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[meta.tone]}`} />
      {meta.label}
    </span>
  )
}

export function SidebarAccountSwitch({ onNavigate }: { onNavigate?: () => void }) {
  const {
    accounts,
    selectedAccountId,
    selectAccount,
    selectedAccount,
    selectedLiveStatus,
  } = useAccounts()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  if (accounts.length === 0) {
    return (
      <div className="border-b border-border px-4 py-4">
        <p className="mb-2 text-[13px] font-medium text-muted">الحساب النشط</p>
        <Link
          to="/accounts"
          onClick={onNavigate}
          className="flex min-h-[72px] items-center gap-3 rounded-[16px] bg-slate-50 px-3 py-3 transition-colors hover:bg-primary-50"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white text-muted shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-text">لا يوجد حساب</p>
            <p className="text-[13px] text-muted">أضف رقماً واربطه بمسح QR</p>
          </div>
        </Link>
      </div>
    )
  }

  const selectedMeta = liveStatusDisplayMeta(
    selectedLiveStatus,
    selectedAccount ?? undefined,
  )
  const offline = selectedMeta.tone === 'offline' || selectedMeta.tone === 'unknown'

  return (
    <div className="border-b border-border px-4 py-4" ref={wrapRef}>
      <p className="mb-2 text-[13px] font-medium text-muted">الحساب النشط</p>

      <div className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 rounded-[16px] bg-slate-50 p-3 text-start transition-colors hover:bg-slate-100 focus-visible:outline-none"
        >
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white text-primary-700 shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
            <Smartphone className="h-5 w-5" />
            <span
              className={`absolute -end-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${DOT[selectedMeta.tone]}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight text-text">
              {formatAccountLabel(selectedAccountId, selectedAccount?.note)}
            </p>
            <div className="mt-1.5">
              <StatusChip meta={selectedMeta} />
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <ul
            role="listbox"
            className="absolute inset-x-0 top-[calc(100%+8px)] z-20 max-h-64 overflow-y-auto rounded-[16px] bg-white p-1 shadow-[0px_4px_12px_rgba(15,23,42,0.12)]"
          >
            {accounts.map((acc) => {
              const active = acc.accountId === selectedAccountId
              const meta =
                acc.accountId === selectedAccountId
                  ? selectedMeta
                  : accountStatusLabel(acc)
              return (
                <li key={acc.accountId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      selectAccount(acc.accountId)
                      setOpen(false)
                    }}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3 py-2 text-start transition-colors ${
                      active
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-text hover:bg-slate-50'
                    }`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[meta.tone]}`} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                      {formatAccountLabel(acc.accountId, acc.note)}
                    </span>
                    <span className="shrink-0 text-[13px] text-muted">{meta.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {offline && (
        <Link
          to="/accounts"
          onClick={onNavigate}
          className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-[14px] bg-primary-50 px-3 text-[13px] font-semibold text-primary-700 transition-colors hover:bg-primary-100"
        >
          <QrCode className="h-4 w-4" />
          اربط الرقم بمسح QR
        </Link>
      )}
    </div>
  )
}
