import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAccountStatusPoll } from '../hooks/useAccountStatusPoll'
import { api, ApiClientError } from '../lib/api'
import { isAccountReady } from '../lib/accountStatus'
import { getAccountId, setAccountId as persistAccountId } from '../lib/storage'
import type { WaAccount } from '../types/models'
import { useAuth } from './AuthContext'

interface AccountContextValue {
  accounts: WaAccount[]
  selectedAccountId: string
  selectedAccount: WaAccount | null
  selectedLiveStatus: ReturnType<typeof useAccountStatusPoll>['status']
  liveStatusPolling: boolean
  liveStatusError: string | null
  refreshSelectedLiveStatus: ReturnType<typeof useAccountStatusPoll>['refresh']
  loading: boolean
  error: string | null
  selectAccount: (accountId: string) => void
  refreshAccounts: () => Promise<WaAccount[]>
}

const AccountContext = createContext<AccountContextValue | null>(null)

function pickDefaultAccount(
  list: WaAccount[],
  stored: string,
): string {
  if (stored && list.some((a) => a.accountId === stored)) {
    return stored
  }
  const ready = list.find(
    (a) =>
      a.status === 'ready' ||
      a.isReady === true ||
      a.ready === true,
  )
  if (ready) return ready.accountId
  return list[0]?.accountId ?? ''
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [accounts, setAccounts] = useState<WaAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState(getAccountId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshAccounts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await api.listAccounts()
      setAccounts(list)
      setSelectedAccountId((current) => {
        const next = pickDefaultAccount(list, current || getAccountId())
        if (next) persistAccountId(next)
        else persistAccountId('')
        return next
      })
      return list
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Failed to load accounts',
      )
      setAccounts([])
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setAccounts([])
      setLoading(false)
      return
    }
    refreshAccounts()
  }, [isAuthenticated, refreshAccounts])

  const selectAccount = useCallback((accountId: string) => {
    setSelectedAccountId(accountId)
    persistAccountId(accountId)
  }, [])

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.accountId === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  )

  const {
    status: selectedLiveStatus,
    polling: liveStatusPolling,
    error: liveStatusError,
    refresh: refreshSelectedLiveStatus,
  } = useAccountStatusPoll(
    selectedAccountId,
    isAuthenticated && !!selectedAccountId,
  )

  useEffect(() => {
    if (!selectedAccountId || !selectedLiveStatus) return
    const raw = selectedLiveStatus.raw
    const ready = isAccountReady(raw)
    setAccounts((prev) =>
      prev.map((a) =>
        a.accountId === selectedAccountId
          ? {
              ...a,
              status: String(raw.status ?? a.status ?? ''),
              isReady: ready,
              ready,
              isConnected:
                ready ||
                raw.connected === true ||
                raw.isConnected === true,
              liveState:
                typeof raw.liveState === 'string' ? raw.liveState : a.liveState,
            }
          : a,
      ),
    )
  }, [selectedLiveStatus, selectedAccountId])

  const value = useMemo(
    () => ({
      accounts,
      selectedAccountId,
      selectedAccount,
      selectedLiveStatus,
      liveStatusPolling,
      liveStatusError,
      refreshSelectedLiveStatus,
      loading,
      error,
      selectAccount,
      refreshAccounts,
    }),
    [
      accounts,
      selectedAccountId,
      selectedAccount,
      selectedLiveStatus,
      liveStatusPolling,
      liveStatusError,
      refreshSelectedLiveStatus,
      loading,
      error,
      selectAccount,
      refreshAccounts,
    ],
  )

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  )
}

export function useAccounts() {
  const ctx = useContext(AccountContext)
  if (!ctx) {
    throw new Error('useAccounts must be used within AccountProvider')
  }
  return ctx
}
