import {
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  MessageSquare,
  Settings,
  Shield,
  Smartphone,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ApiHealthBanner } from './ApiHealthBanner'
import { SidebarAccountSwitch } from './SidebarAccountSwitch'
import { useAccounts } from '../context/AccountContext'
import { useAuth } from '../context/AuthContext'
import {
  formatAccountLabel,
  liveStatusDisplayMeta,
} from '../lib/accountDisplay'

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}

const opsNav: NavItem[] = [
  { to: '/', label: 'نظرة عامة', icon: LayoutDashboard, end: true },
  { to: '/accounts', label: 'الحسابات', icon: Smartphone },
  { to: '/messages', label: 'الرسائل', icon: MessageSquare },
]

const marketingNav: NavItem[] = [
  { to: '/contacts', label: 'جهات الاتصال', icon: Users },
  { to: '/templates', label: 'القوالب', icon: FileText },
  { to: '/campaigns', label: 'الحملات', icon: Megaphone },
]

const systemNav: NavItem[] = [
  { to: '/billing', label: 'الاشتراك', icon: CreditCard },
  { to: '/settings', label: 'الإعدادات', icon: Settings },
]

const PAGE_TITLES: { prefix: string; title: string }[] = [
  { prefix: '/admin', title: 'لوحة الإدارة' },
  { prefix: '/billing', title: 'الاشتراك والدفع' },
  { prefix: '/accounts', title: 'حسابات واتساب' },
  { prefix: '/messages', title: 'الرسائل' },
  { prefix: '/contacts', title: 'جهات الاتصال' },
  { prefix: '/templates', title: 'قوالب الرسائل' },
  { prefix: '/campaigns', title: 'الحملات' },
  { prefix: '/settings', title: 'الإعدادات' },
  { prefix: '/', title: 'نظرة عامة' },
]

function pageTitle(pathname: string) {
  return PAGE_TITLES.find((p) =>
    p.prefix === '/' ? pathname === '/' : pathname.startsWith(p.prefix),
  )?.title
}

function NavGroup({
  title,
  items,
  onNavigate,
}: {
  title: string
  items: NavItem[]
  onNavigate: () => void
}) {
  return (
    <div className="mb-6">
      <p className="mb-2 px-3 text-[13px] font-semibold text-muted">{title}</p>
      <div className="space-y-1">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `relative flex min-h-11 items-center gap-3 rounded-[14px] px-3 text-[15px] font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-muted hover:bg-slate-50 hover:text-text'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-primary-500" />
                )}
                <Icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { logout, user, isSuperAdmin } = useAuth()

  const adminNav: NavItem[] = isSuperAdmin
    ? [{ to: '/admin', label: 'لوحة الإدارة', icon: Shield }]
    : []

  return (
    <>
      <div className="flex h-[72px] items-center gap-3 border-b border-border px-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-primary-500">
          <MessageCircle className="h-5 w-5 text-white" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-tight text-text">
            وحدة واتساب
          </p>
          <p className="truncate text-[13px] text-muted">
            {user?.username ?? 'لوحة التحكم'}
          </p>
        </div>
      </div>

      <SidebarAccountSwitch onNavigate={onNavigate} />

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavGroup title="العمل اليومي" items={opsNav} onNavigate={onNavigate} />
        <NavGroup title="التسويق" items={marketingNav} onNavigate={onNavigate} />
        <NavGroup
          title="النظام"
          items={[...systemNav, ...adminNav]}
          onNavigate={onNavigate}
        />
      </nav>

      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={logout}
          className="flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3 text-[15px] font-medium text-muted transition-colors hover:bg-red-50 hover:text-danger"
        >
          <LogOut className="h-5 w-5" />
          تسجيل الخروج
        </button>
      </div>
    </>
  )
}

export function Layout() {
  const location = useLocation()
  const { user, isSuperAdmin } = useAuth()
  const { selectedAccountId, selectedAccount, selectedLiveStatus } = useAccounts()
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  const title = useMemo(() => pageTitle(location.pathname), [location.pathname])
  const statusMeta = liveStatusDisplayMeta(
    selectedLiveStatus,
    selectedAccount ?? undefined,
  )

  return (
    <div className="flex h-full min-h-0 bg-surface">
      {drawerOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden"
          aria-label="إغلاق القائمة"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 start-0 z-50 flex w-[280px] flex-col bg-white shadow-[0px_0px_24px_rgba(15,23,42,0.20)] transition-transform duration-200 lg:static lg:z-0 lg:shadow-[0px_1px_3px_rgba(15,23,42,0.08)] ${
          drawerOpen ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full lg:!translate-x-0'
        }`}
      >
        <SidebarContent onNavigate={() => setDrawerOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 bg-white px-4 shadow-[0px_1px_3px_rgba(15,23,42,0.08)] lg:h-[72px] lg:px-8">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-[14px] text-muted hover:bg-slate-50 lg:hidden"
            onClick={() => setDrawerOpen((open) => !open)}
            aria-label={drawerOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
          >
            {drawerOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-text">{title}</p>
            {selectedAccountId && statusMeta && (
              <p className="hidden truncate text-[13px] text-muted sm:block">
                {formatAccountLabel(selectedAccountId, selectedAccount?.note)} · {statusMeta.label}
              </p>
            )}
          </div>

          <div className="hidden items-center gap-3 sm:flex">
            <div className="text-end">
              <p className="text-[15px] font-semibold leading-tight text-text">
                {user?.username}
              </p>
              <p className="text-[13px] text-muted">
                {isSuperAdmin ? 'مدير النظام' : 'مشغّل'}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-50 text-[15px] font-bold text-primary-700">
              {(user?.username ?? 'U').slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="relative min-h-0 flex-1 overflow-y-auto p-4 lg:p-8">
          <ApiHealthBanner />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
