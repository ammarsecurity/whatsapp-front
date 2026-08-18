import { useState } from 'react'
import { AdminAccountsPanel } from '../components/AdminAccountsPanel'
import { AdminSystemHealthPanel } from '../components/AdminSystemHealthPanel'
import { AdminUsersPanel } from '../components/AdminUsersPanel'
import { PageHeader, SegmentedTabs } from '../components/ui/PageHeader'

type AdminTab = 'health' | 'accounts' | 'users'

export function SuperAdminPage() {
  const [tab, setTab] = useState<AdminTab>('health')

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'health', label: 'صحة النظام' },
    { id: 'accounts', label: 'حسابات واتساب' },
    { id: 'users', label: 'المستخدمون' },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="لوحة الإدارة"
        description="صحة الخادم، جلسات واتساب، وإدارة مستخدمي النظام."
      />

      <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'health' && <AdminSystemHealthPanel />}
      {tab === 'accounts' && <AdminAccountsPanel />}
      {tab === 'users' && <AdminUsersPanel />}
    </div>
  )
}
