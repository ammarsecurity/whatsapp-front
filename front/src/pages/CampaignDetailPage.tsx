import { ArrowRight, Download } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FilterSelect } from '../components/ui/ListToolbar'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination, DEFAULT_PAGE_SIZE } from '../components/ui/Pagination'
import { api, ApiClientError } from '../lib/api'
import { formatDateTime } from '../lib/format'
import type { CampaignRecord } from '../types/contacts'
import type { CampaignRecipient } from '../types/features'

function campaignStatusLabel(status: string): string {
  const map: Record<string, string> = {
    scheduled: 'مجدولة',
    completed: 'مكتملة',
    failed: 'فاشلة',
    pending: 'قيد الانتظار',
    sending: 'جارٍ الإرسال',
  }
  return map[status] ?? status
}

function recipientStatusLabel(status: string): string {
  const map: Record<string, string> = {
    sent: 'مرسلة',
    failed: 'فاشلة',
    pending: 'قيد الانتظار',
    skipped_opt_out: 'تُخطّيت (إلغاء اشتراك)',
  }
  return map[status] ?? status.replace(/_/g, ' ')
}

export function CampaignDetailPage() {
  const { id } = useParams()
  const campaignId = Number(id)

  const [campaign, setCampaign] = useState<CampaignRecord | null>(null)
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    try {
      const [c, r] = await Promise.all([
        api.getCampaign(campaignId),
        api.listCampaignRecipients(campaignId, {
          status: statusFilter === 'all' ? undefined : statusFilter,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
      ])
      setCampaign(c)
      setRecipients(r.items)
      setTotal(r.total)
      setTotalPages(r.totalPages)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر التحميل')
    } finally {
      setLoading(false)
    }
  }, [campaignId, statusFilter, page, pageSize])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [statusFilter, pageSize])

  function exportCsv() {
    const header = 'phone,status,error\n'
    const rows = recipients
      .map((r) => `${r.phoneNumber},${r.status},"${(r.errorMessage || '').replace(/"/g, '""')}"`)
      .join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campaign-${campaignId}-page-${page}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!campaignId) {
    return <Alert variant="error" title="حملة غير صالحة">معرّف الحملة مفقود</Alert>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title={campaign?.name ?? 'تقرير الحملة'}
        description="تقرير التسليم والإخفاقات"
        action={
          <Link to="/campaigns">
            <Button variant="secondary">
              <ArrowRight className="h-4 w-4" />
              العودة للحملات
            </Button>
          </Link>
        }
      />

      {error && (
        <Alert variant="error" title="خطأ" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {campaign && (
        <Card title="الملخص">
          <div className="grid grid-cols-2 gap-4 text-[15px] sm:grid-cols-4">
            <div>
              <p className="text-[13px] text-muted">الحالة</p>
              <p className="font-medium">{campaignStatusLabel(campaign.status)}</p>
            </div>
            <div>
              <p className="text-[13px] text-muted">الإجمالي</p>
              <p className="font-medium">{campaign.totalRecipients}</p>
            </div>
            <div>
              <p className="text-[13px] text-muted">أُرسلت</p>
              <p className="font-medium text-success">{campaign.successCount}</p>
            </div>
            <div>
              <p className="text-[13px] text-muted">فشلت / تُخطّيت</p>
              <p className="font-medium text-danger">{campaign.failureCount}</p>
            </div>
          </div>
          {campaign.scheduledAt && (
            <p className="mt-3 text-[13px] text-muted">
              مجدولة: {formatDateTime(campaign.scheduledAt)}
            </p>
          )}
        </Card>
      )}

      <Card title="المستلمون">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <FilterSelect
            label="الحالة"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'الكل' },
              { value: 'sent', label: 'مرسلة' },
              { value: 'failed', label: 'فاشلة' },
              { value: 'skipped_opt_out', label: 'تُخطّيت (إلغاء اشتراك)' },
            ]}
          />
          <Button variant="secondary" onClick={exportCsv} disabled={!recipients.length}>
            <Download className="h-4 w-4" />
            تصدير CSV (هذه الصفحة)
          </Button>
        </div>

        {loading ? (
          <p className="text-[15px] text-muted">جارٍ التحميل…</p>
        ) : recipients.length === 0 ? (
          <p className="text-[15px] text-muted">
            لا سجلات مستلمين بعد — تظهر بعد اكتمال الحملة.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-[16px] bg-slate-50">
              <table className="w-full text-start text-[15px]">
                <thead>
                  <tr className="text-[13px] text-muted">
                    <th className="px-4 py-3 font-medium">الهاتف</th>
                    <th className="px-4 py-3 font-medium">الحالة</th>
                    <th className="px-4 py-3 font-medium">الخطأ</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id} className="border-t border-white last:border-0">
                      <td className="px-4 py-3 font-mono text-[13px]" dir="ltr">
                        {r.phoneNumber}
                      </td>
                      <td className="px-4 py-3">{recipientStatusLabel(r.status)}</td>
                      <td className="px-4 py-3 text-[13px] text-muted">{r.errorMessage || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s)
                setPage(1)
              }}
            />
          </>
        )}
      </Card>
    </div>
  )
}
