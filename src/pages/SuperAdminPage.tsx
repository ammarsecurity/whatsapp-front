import { Activity, Shield, Smartphone, Users } from 'lucide-react'
import { useState } from 'react'
import { AdminAccountsPanel } from '../components/AdminAccountsPanel'
import { AdminSystemHealthPanel } from '../components/AdminSystemHealthPanel'
import { AdminUsersPanel } from '../components/AdminUsersPanel'

type AdminTab = 'health' | 'accounts' | 'users'

export function SuperAdminPage() {
  const [tab, setTab] = useState<AdminTab>('health')

  const tabs: { id: AdminTab; label: string; icon: typeof Users }[] = [
    { id: 'health', label: 'System health', icon: Activity },
    { id: 'accounts', label: 'WhatsApp accounts', icon: Smartphone },
    { id: 'users', label: 'System users', icon: Users },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2">
          <Shield className="h-6 w-6 text-wa-green" />
          <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        </div>
        <p className="text-sm text-muted">
          Server health, WhatsApp sessions, and user management
        </p>
      </header>

      <div className="flex rounded-xl border border-border bg-panel p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-card text-text shadow-sm'
                : 'text-muted hover:text-text'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {tab === 'health' && <AdminSystemHealthPanel />}
      {tab === 'accounts' && <AdminAccountsPanel />}
      {tab === 'users' && <AdminUsersPanel />}
    </div>
  )
}
