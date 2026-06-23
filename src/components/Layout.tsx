import {
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MessageSquare,
  Settings,
  Shield,
  Smartphone,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const baseNav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/accounts', label: 'Accounts', icon: Smartphone },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Layout() {
  const { logout, user, isSuperAdmin } = useAuth()

  const nav = isSuperAdmin
    ? [
        ...baseNav,
        { to: '/admin', label: 'Admin', icon: Shield, end: false },
      ]
    : baseNav

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
              {user?.username ?? 'API Dashboard'}
            </p>
          </div>
        </div>

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
        <Outlet />
      </main>
    </div>
  )
}
