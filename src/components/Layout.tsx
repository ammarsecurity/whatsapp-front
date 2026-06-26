import {
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Settings,
  Shield,
  Smartphone,
  Users,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { ApiHealthBanner } from './ApiHealthBanner'
import { formatAccountLabel, liveStatusDisplayMeta, ACCOUNT_STATUS_STYLES } from '../lib/accountDisplay'
import { useAccounts } from '../context/AccountContext'
import { useAuth } from '../context/AuthContext'

const baseNav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/accounts', label: 'Accounts', icon: Smartphone },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/templates', label: 'Templates', icon: FileText },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Layout() {
  const { logout, user, isSuperAdmin } = useAuth()
  const { selectedAccount, selectedAccountId, accounts, selectAccount, selectedLiveStatus } =
    useAccounts()

  const nav = isSuperAdmin
    ? [
        ...baseNav,
        { to: '/admin', label: 'Admin', icon: Shield, end: false },
      ]
    : baseNav

  const statusMeta = liveStatusDisplayMeta(
    selectedLiveStatus,
    selectedAccount ?? undefined,
  )

  return (
    <div className="bg-app-pattern flex h-full min-h-0">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-panel">
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-wa-green">
            <MessageCircle className="h-5 w-5 text-surface" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">WA Console</p>
            <p className="text-[11px] text-muted">
              {user?.username ?? 'Dashboard'}
            </p>
          </div>
        </div>

        {accounts.length > 0 && (
          <div className="border-b border-border px-3 py-3">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted">
              Active WhatsApp
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => selectAccount(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-xs font-medium text-text outline-none focus:border-wa-green"
            >
              {accounts.map((acc) => (
                <option key={acc.accountId} value={acc.accountId}>
                  {formatAccountLabel(acc.accountId)}
                </option>
              ))}
            </select>
            {statusMeta && selectedAccountId && (
              <span
                className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${ACCOUNT_STATUS_STYLES[statusMeta.tone]}`}
              >
                {statusMeta.label}
              </span>
            )}
          </div>
        )}

        <nav className="flex-1 space-y-0.5 p-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-wa-green/15 text-wa-green'
                    : 'text-muted hover:bg-card/60 hover:text-text'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 overflow-y-auto p-6 md:p-8">
        <ApiHealthBanner />
        <Outlet />
      </main>
    </div>
  )
}
