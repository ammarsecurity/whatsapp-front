import { ArrowLeft, Download } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FilterSelect } from '../components/ui/ListToolbar'
import { Pagination, DEFAULT_PAGE_SIZE } from '../components/ui/Pagination'
import { api, ApiClientError } from '../lib/api'
import type { CampaignRecord } from '../types/contacts'
import type { CampaignRecipient } from '../types/features'

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
      setError(err instanceof ApiClientError ? err.message : 'Failed to load')
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
    return <Alert variant="error" title="Invalid campaign">Missing campaign ID</Alert>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center gap-3">
        <Link to="/campaigns">
          <Button variant="ghost">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {campaign?.name ?? 'Campaign report'}
          </h1>
          <p className="text-sm text-muted">Delivery report & failures</p>
        </div>
      </header>

      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {campaign && (
        <Card title="Summary">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-muted">Status</p>
              <p className="font-medium capitalize">{campaign.status}</p>
            </div>
            <div>
              <p className="text-muted">Total</p>
              <p className="font-medium">{campaign.totalRecipients}</p>
            </div>
            <div>
              <p className="text-muted">Sent</p>
              <p className="font-medium text-wa-green">{campaign.successCount}</p>
            </div>
            <div>
              <p className="text-muted">Failed / skipped</p>
              <p className="font-medium text-red-300">{campaign.failureCount}</p>
            </div>
          </div>
          {campaign.scheduledAt && (
            <p className="mt-3 text-xs text-muted">
              Scheduled: {new Date(campaign.scheduledAt).toLocaleString()}
            </p>
          )}
        </Card>
      )}

      <Card title="Recipients">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'sent', label: 'Sent' },
              { value: 'failed', label: 'Failed' },
              { value: 'skipped_opt_out', label: 'Opt-out skipped' },
            ]}
          />
          <Button variant="secondary" onClick={exportCsv} disabled={!recipients.length}>
            <Download className="h-4 w-4" />
            Export CSV (page)
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : recipients.length === 0 ? (
          <p className="text-sm text-muted">
            No recipient records yet — available after campaign completes.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-panel text-xs text-muted">
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">{r.phoneNumber}</td>
                      <td className="px-3 py-2 capitalize">{r.status.replace(/_/g, ' ')}</td>
                      <td className="px-3 py-2 text-xs text-muted">{r.errorMessage || '—'}</td>
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
