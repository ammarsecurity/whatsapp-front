import { useCallback, useEffect, useState } from 'react'
import { Alert } from './ui/Alert'
import { Card } from './ui/Card'
import { api, ApiClientError } from '../lib/api'
import { formatDateTime, formatIqd } from '../lib/format'
import type { PaymentTransactionRow } from '../types/billing'

export function AdminPaymentTransactionsPanel() {
  const [rows, setRows] = useState<PaymentTransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await api.adminPaymentTransactions())
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر تحميل المعاملات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <Card title="معاملات الدفع">
      {error && (
        <div className="mb-4">
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}
      {loading ? (
        <p className="text-[15px] text-muted">جاري التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="text-[15px] text-muted">لا توجد معاملات بعد.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-start text-[15px]">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="px-3 py-3 font-semibold">المرجع</th>
                <th className="px-3 py-3 font-semibold">المستخدم</th>
                <th className="px-3 py-3 font-semibold">البوابة</th>
                <th className="px-3 py-3 font-semibold">الخطة</th>
                <th className="px-3 py-3 font-semibold">المبلغ</th>
                <th className="px-3 py-3 font-semibold">الحالة</th>
                <th className="px-3 py-3 font-semibold">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-3 py-3 font-mono text-[13px]">{row.referenceId}</td>
                  <td className="px-3 py-3">{row.username || row.userId || '—'}</td>
                  <td className="px-3 py-3">{row.gateway}</td>
                  <td className="px-3 py-3">{row.planName || '—'}</td>
                  <td className="px-3 py-3">
                    {row.amountIqd != null ? formatIqd(row.amountIqd) : '—'}
                  </td>
                  <td className="px-3 py-3">{row.paymentStatus || row.status || '—'}</td>
                  <td className="px-3 py-3">
                    {row.createdAt ? formatDateTime(row.createdAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
