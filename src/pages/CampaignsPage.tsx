import { Megaphone, Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountPicker, SelectedAccountStatus } from '../components/AccountPicker'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FilterSelect, ListToolbar } from '../components/ui/ListToolbar'
import { Input } from '../components/ui/Input'
import { Pagination, DEFAULT_PAGE_SIZE } from '../components/ui/Pagination'
import { Textarea } from '../components/ui/Textarea'
import { useAccounts } from '../context/AccountContext'
import { useWebSocket } from '../hooks/useWebSocket'
import { api, ApiClientError } from '../lib/api'
import { formatAccountLabel } from '../lib/accountDisplay'
import { isAccountReady } from '../lib/accountStatus'
import { formatPhoneCount } from '../lib/parsePhones'
import type { CampaignRecord, ContactGroup } from '../types/contacts'
import type { MessageTemplate } from '../types/features'

export function CampaignsPage() {
  const {
    selectedAccountId,
    selectedLiveStatus,
    liveStatusPolling,
    refreshSelectedLiveStatus,
  } = useAccounts()
  const [groups, setGroups] = useState<ContactGroup[]>([])
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([])
  const [groupId, setGroupId] = useState<number | ''>('')
  const [campaignName, setCampaignName] = useState('')
  const [message, setMessage] = useState('')
  const [templateId, setTemplateId] = useState<number | ''>('')
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [scheduleLater, setScheduleLater] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [delaySec, setDelaySec] = useState(3)
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{
    total: number
    successCount: number
    failureCount: number
  } | null>(null)

  const [historySearch, setHistorySearch] = useState('')
  const [historyStatus, setHistoryStatus] = useState('all')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyTotalPages, setHistoryTotalPages] = useState(1)

  const accountStatus = selectedLiveStatus
  const polling = liveStatusPolling
  const accountReady = isAccountReady(accountStatus?.raw)

  const selectedGroup = groups.find((g) => g.id === groupId) ?? null

  const loadGroups = useCallback(async () => {
    try {
      const [g, t] = await Promise.all([
        api.listContactGroups({ limit: 100 }),
        api.listTemplates({ limit: 100 }),
      ])
      setGroups(g.items)
      setTemplates(t.items)
      if (g.items.length && groupId === '') {
        setGroupId(g.items[0].id)
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load groups')
    }
  }, [groupId])

  const loadCampaignHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const result = await api.listCampaigns({
        search: historySearch.trim() || undefined,
        status: historyStatus === 'all' ? undefined : historyStatus,
        limit: historyPageSize,
        offset: (historyPage - 1) * historyPageSize,
      })
      setCampaigns(result.items)
      setHistoryTotal(result.total)
      setHistoryTotalPages(result.totalPages)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load campaigns')
    } finally {
      setLoadingHistory(false)
    }
  }, [historySearch, historyStatus, historyPage, historyPageSize])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  useEffect(() => {
    loadCampaignHistory()
  }, [loadCampaignHistory])

  useEffect(() => {
    setHistoryPage(1)
  }, [historySearch, historyStatus, historyPageSize])

  useWebSocket((event) => {
    if (event.startsWith('campaign.')) loadCampaignHistory()
  })

  async function sendCampaign() {
    if (!selectedAccountId) {
      setError('Choose a WhatsApp account')
      return
    }
    if (!groupId) {
      setError('Choose a contact group')
      return
    }
    if (!templateId && !message.trim()) {
      setError('Write a message or pick a template')
      return
    }
    if (scheduleLater && !scheduledAt) {
      setError('Pick a schedule date/time')
      return
    }
    if (!selectedGroup?.numberCount) {
      setError('This group has no numbers — add contacts first')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)
    setLastResult(null)
    try {
      const result = await api.sendCampaign({
        accountId: selectedAccountId,
        groupId: Number(groupId),
        name: campaignName.trim() || undefined,
        message: templateId ? undefined : message.trim(),
        templateId: templateId ? Number(templateId) : undefined,
        delayMs: delaySec * 1000,
        scheduledAt: scheduleLater ? new Date(scheduledAt).toISOString() : undefined,
      })
      if (result.scheduled) {
        setSuccess(`Campaign scheduled for ${new Date(result.scheduledAt || scheduledAt).toLocaleString()}`)
      } else if (result.started) {
        setSuccess(
          `Campaign started — sending to ${result.total} contact(s). Progress updates live below.`,
        )
      } else {
        setLastResult(result)
        setSuccess(
          `Campaign sent: ${result.successCount} of ${result.total} delivered` +
            (result.skippedOptOut ? ` (${result.skippedOptOut} opted out)` : ''),
        )
      }
      await loadCampaignHistory()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Campaign failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
        <p className="mt-1 text-sm text-muted">
          Send the same promotional message to everyone in a contact group
        </p>
      </header>

      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" title="Campaign complete" onDismiss={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Card title="Send from">
        <AccountPicker compact showStatus={false} />
        {selectedAccountId && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <SelectedAccountStatus statusData={accountStatus} polling={polling} />
            {!accountReady && (
              <span className="text-sm text-amber-600">
                Account must be ready.{' '}
                <Link to="/accounts" className="underline">
                  Link WhatsApp
                </Link>
              </span>
            )}
            <Button variant="ghost" onClick={() => refreshSelectedLiveStatus()}>
              Refresh
            </Button>
          </div>
        )}
      </Card>

      <Card
        title="New campaign"
        description="Broadcast one message to a saved contact group"
        action={<Megaphone className="h-4 w-4 text-muted" />}
      >
        <div className="space-y-4">
          {groups.length === 0 ? (
            <Alert variant="info" title="No contact groups">
              <Link to="/contacts" className="text-wa-green underline">
                Create a group and import numbers
              </Link>{' '}
              before sending a campaign.
            </Alert>
          ) : (
            <>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-muted">Contact group</span>
                <select
                  value={groupId}
                  onChange={(e) =>
                    setGroupId(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full rounded-lg border border-border bg-panel px-3.5 py-2.5 text-sm text-text outline-none focus:border-wa-green"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({formatPhoneCount(g.numberCount)})
                    </option>
                  ))}
                </select>
              </label>

              {selectedGroup && (
                <p className="text-sm text-muted">
                  Will send to{' '}
                  <strong className="text-text">
                    {formatPhoneCount(selectedGroup.numberCount)}
                  </strong>{' '}
                  from{' '}
                  <strong className="text-text">
                    {formatAccountLabel(selectedAccountId || '')}
                  </strong>
                </p>
              )}

              <Input
                label="Campaign name (optional)"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Summer sale 2026"
              />

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-muted">Template (optional)</span>
                <select
                  value={templateId}
                  onChange={(e) =>
                    setTemplateId(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full rounded-lg border border-border bg-panel px-3.5 py-2.5 text-sm text-text outline-none focus:border-wa-green"
                >
                  <option value="">Custom message</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              {!templateId && (
                <Textarea
                  label="Message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="Your promotional text…"
                />
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scheduleLater}
                  onChange={(e) => setScheduleLater(e.target.checked)}
                />
                Schedule for later (requires contact group)
              </label>
              {scheduleLater && (
                <Input
                  label="Send at"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              )}

              <label className="block space-y-2">
                <span className="text-sm font-medium text-muted">
                  Delay between messages: {delaySec}s
                </span>
                <input
                  type="range"
                  min={2}
                  max={15}
                  step={1}
                  value={delaySec}
                  onChange={(e) => setDelaySec(Number(e.target.value))}
                  className="w-full accent-wa-green"
                />
                <p className="text-xs text-muted">
                  Slower sending reduces the risk of WhatsApp blocking (recommended 3–5 seconds).
                </p>
              </label>

              <Button
                loading={loading}
                disabled={
                  !groupId ||
                  !selectedGroup?.numberCount ||
                  (!scheduleLater && !accountReady)
                }
                onClick={sendCampaign}
              >
                <Send className="h-4 w-4" />
                {scheduleLater ? 'Schedule campaign' : 'Send campaign'}
              </Button>
            </>
          )}
        </div>
      </Card>

      {lastResult && (
        <Card title="Last campaign result">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-panel p-3">
              <p className="text-xs text-muted">Total</p>
              <p className="text-xl font-bold">{lastResult.total}</p>
            </div>
            <div className="rounded-lg bg-panel p-3">
              <p className="text-xs text-muted">Sent</p>
              <p className="text-xl font-bold text-wa-green">{lastResult.successCount}</p>
            </div>
            <div className="rounded-lg bg-panel p-3">
              <p className="text-xs text-muted">Failed</p>
              <p className="text-xl font-bold text-red-300">{lastResult.failureCount}</p>
            </div>
          </div>
        </Card>
      )}

      <Card title="Campaign history">
        <ListToolbar
          search={historySearch}
          onSearchChange={setHistorySearch}
          searchPlaceholder="Search by name or group…"
        >
          <FilterSelect
            label="Status"
            value={historyStatus}
            onChange={setHistoryStatus}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'completed', label: 'Completed' },
              { value: 'failed', label: 'Failed' },
              { value: 'pending', label: 'Pending' },
              { value: 'sending', label: 'Sending' },
            ]}
          />
        </ListToolbar>

        {loadingHistory ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-muted">
            {historySearch || historyStatus !== 'all'
              ? 'No campaigns match your filters.'
              : 'No campaigns yet.'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-panel text-xs text-muted">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Group</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Results</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-medium">
                        <Link to={`/campaigns/${c.id}`} className="text-wa-green hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted">{c.groupName ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.status === 'completed'
                              ? 'bg-wa-green/15 text-wa-green'
                              : c.status === 'failed'
                                ? 'bg-red-500/15 text-red-300'
                                : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {c.successCount}/{c.totalRecipients} sent
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {c.createdAt
                          ? new Date(c.createdAt).toLocaleString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={historyPage}
              totalPages={historyTotalPages}
              total={historyTotal}
              pageSize={historyPageSize}
              onPageChange={setHistoryPage}
              onPageSizeChange={(size) => {
                setHistoryPageSize(size)
                setHistoryPage(1)
              }}
            />
          </>
        )}
      </Card>
    </div>
  )
}
