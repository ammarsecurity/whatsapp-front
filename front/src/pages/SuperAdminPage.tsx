import { useState } from 'react'
import { AdminAccountsPanel } from '../components/AdminAccountsPanel'
import { AdminBillingPlansPanel } from '../components/AdminBillingPlansPanel'
import { AdminFynexPaySettingsPanel } from '../components/AdminFynexPaySettingsPanel'
import { AdminPaymentTransactionsPanel } from '../components/AdminPaymentTransactionsPanel'
import { AdminSystemHealthPanel } from '../components/AdminSystemHealthPanel'
import { AdminUsersPanel } from '../components/AdminUsersPanel'
import { AdminWaylSettingsPanel } from '../components/AdminWaylSettingsPanel'
import { PageHeader, SegmentedTabs } from '../components/ui/PageHeader'

type AdminTab =
  | 'health'
  | 'accounts'
  | 'users'
  | 'plans'
  | 'wayl'
  | 'fynexpay'
  | 'payments'

export function SuperAdminPage() {
  const [tab, setTab] = useState<AdminTab>('health')

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'health', label: 'صحة النظام' },
    { id: 'accounts', label: 'حسابات واتساب' },
    { id: 'users', label: 'المستخدمون' },
    { id: 'plans', label: 'الخطط' },
    { id: 'wayl', label: 'Wayl' },
    { id: 'fynexpay', label: 'FynexPay' },
    { id: 'payments', label: 'المدفوعات' },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="لوحة الإدارة"
        description="صحة الخادم، جلسات واتساب، الخطط، بوابات الدفع، وإدارة المستخدمين."
      />

      <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'health' && <AdminSystemHealthPanel />}
      {tab === 'accounts' && <AdminAccountsPanel />}
      {tab === 'users' && <AdminUsersPanel />}
      {tab === 'plans' && <AdminBillingPlansPanel />}
      {tab === 'wayl' && <AdminWaylSettingsPanel />}
      {tab === 'fynexpay' && <AdminFynexPaySettingsPanel />}
      {tab === 'payments' && <AdminPaymentTransactionsPanel />}
    </div>
  )
}
