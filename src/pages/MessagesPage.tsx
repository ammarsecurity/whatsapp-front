import {
  History,
  Image,
  Phone,
  Send,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountPicker, SelectedAccountStatus } from '../components/AccountPicker'
import { JsonBlock } from '../components/JsonBlock'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FilterSelect, ListToolbar } from '../components/ui/ListToolbar'
import { Input } from '../components/ui/Input'
import { Pagination, DEFAULT_PAGE_SIZE } from '../components/ui/Pagination'
import { Textarea } from '../components/ui/Textarea'
import { useAccounts } from '../context/AccountContext'
import { api, ApiClientError } from '../lib/api'
import { formatAccountLabel } from '../lib/accountDisplay'
import { isAccountReady } from '../lib/accountStatus'
import type { MessageRecord, MessageStatistics } from '../types/messages'

type Tab = 'compose' | 'media' | 'history'
type LoadingKey = 'check' | 'send' | 'media' | 'history' | null

function formatMessageActionError(err: unknown, fallback: string): string {
  if (!(err instanceof ApiClientError)) {
    return fallback
  }
  if (err.status === 408 || err.status === 504) {
    return `${err.message} Go to Accounts → Clear stuck sessions, then scan QR again.`
  }
  if (err.status === 503) {
    return `${err.message} Wait until the account shows Ready to send.`
  }
  return err.message
}

export function MessagesPage() {
  const {
    selectedAccountId,
    selectedLiveStatus,
    liveStatusPolling,
    refreshSelectedLiveStatus,
  } = useAccounts()
  const accountId = selectedAccountId

  const [tab, setTab] = useState<Tab>('compose')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [message, setMessage] = useState('')
  const [phoneList, setPhoneList] = useState('')
  const [mediaPhones, setMediaPhones] = useState('')
  const [caption, setCaption] = useState('')
  const [mediaType, setMediaType] = useState<'image' | 'document' | 'audio' | 'video'>('document')
  const [mediaFile, setMediaFile] = useState<File | null>(null)

  const [historyStatus, setHistoryStatus] = useState<'all' | 'sent' | 'failed' | 'pending'>('all')
  const [historySearch, setHistorySearch] = useState('')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [history, setHistory] = useState<MessageRecord[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyTotalPages, setHistoryTotalPages] = useState(1)
  const [stats, setStats] = useState<MessageStatistics | null>(null)

  const [checkResult, setCheckResult] = useState<unknown>(null)
  const [sendResult, setSendResult] = useState<unknown>(null)
  const [mediaResult, setMediaResult] = useState<unknown>(null)
  const [loading, setLoading] = useState<LoadingKey>(null)
  const [error, setError] = useState<string | null>(null)
  const [showApiDetails, setShowApiDetails] = useState(false)

  const accountStatus = selectedLiveStatus
  const polling = liveStatusPolling
  const accountReady = isAccountReady(accountStatus?.raw)
  const displayName = accountId ? formatAccountLabel(accountId) : ''

  function parsePhones(raw: string): string[] {
    return raw
      .split(/[\n,;]+/)
      .map((p) => p.trim())
      .filter(Boolean)
  }

  async function checkNumber() {
    if (!accountId) return
    setLoading('check')
    setError(null)
    try {
      const data = await api.checkNumber({ accountId, phoneNumber })
      setCheckResult(data)
    } catch (err) {
      setError(formatMessageActionError(err, 'Check failed'))
      setCheckResult(err instanceof ApiClientError ? err.body : null)
    } finally {
      setLoading(null)
    }
  }

  async function sendMessage() {
    if (!accountId) return
    setLoading('send')
    setError(null)
    const phoneNumbers = parsePhones(phoneList)
    if (!phoneNumbers.length) {
      setError('Add at least one phone number')
      setLoading(null)
      return
    }
    try {
      const data = await api.sendMessage({ accountId, message, phoneNumbers })
      setSendResult(data)
    } catch (err) {
      setError(formatMessageActionError(err, 'Send failed'))
      setSendResult(err instanceof ApiClientError ? err.body : null)
    } finally {
      setLoading(null)
    }
  }

  async function sendMedia() {
    if (!accountId) return
    setLoading('media')
    setError(null)
    const phoneNumbers = parsePhones(mediaPhones)
    if (!mediaFile) {
      setError('Choose a file to send')
      setLoading(null)
      return
    }
    if (!phoneNumbers.length) {
      setError('Add at least one phone number')
      setLoading(null)
      return
    }
    try {
      const data = await api.sendMedia({
        accountId,
        phoneNumbers,
        file: mediaFile,
        mediaType,
        caption: caption.trim() || undefined,
      })
      setMediaResult(data)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Media send failed')
      setMediaResult(err instanceof ApiClientError ? err.body : null)
    } finally {
      setLoading(null)
    }
  }

  const loadHistory = useCallback(async () => {
    if (!accountId) return
    setLoading('history')
    setError(null)
    try {
      const offset = (historyPage - 1) * historyPageSize
      const [page, statistics] = await Promise.all([
        api.messageHistory({
          accountId,
          search: historySearch.trim() || undefined,
          status: historyStatus === 'all' ? undefined : historyStatus,
          limit: historyPageSize,
          offset,
        }),
        api.messageStatistics(accountId),
      ])
      setHistory(page.items)
      setHistoryTotal(page.total)
      setHistoryTotalPages(page.totalPages)
      setStats(statistics)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load history')
      setHistory([])
      setHistoryTotal(0)
      setHistoryTotalPages(1)
      setStats(null)
    } finally {
      setLoading(null)
    }
  }, [accountId, historyStatus, historySearch, historyPage, historyPageSize])

  useEffect(() => {
    setHistoryPage(1)
  }, [accountId, historyStatus, historySearch, historyPageSize])

  useEffect(() => {
    if (tab === 'history' && accountId) loadHistory()
  }, [tab, loadHistory, accountId])

  const tabs: { id: Tab; label: string; icon: typeof Send }[] = [
    { id: 'compose', label: 'Compose', icon: Send },
    { id: 'media', label: 'Send media', icon: Image },
    { id: 'history', label: 'History', icon: History },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-muted">
          Send and track messages from your linked WhatsApp numbers
        </p>
      </header>

      <Card title="Send from">
        <AccountPicker compact showStatus={false} />
        {accountId && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <SelectedAccountStatus statusData={accountStatus} polling={polling} />
            {!accountReady && (
              <p className="text-sm text-amber-600">
                {displayName} is not ready yet.{' '}
                <Link to="/accounts" className="underline">
                  Link it with QR
                </Link>
              </p>
            )}
            <Button variant="ghost" onClick={() => refreshSelectedLiveStatus()}>
              Refresh status
            </Button>
          </div>
        )}
      </Card>

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
            {label}
          </button>
        ))}
      </div>

      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
          {(error.includes('timed out') || error.includes('stuck')) && (
            <span>
              {' '}
              <Link to="/accounts" className="underline">
                Open Accounts
              </Link>
            </span>
          )}
        </Alert>
      )}

      {!accountId && (
        <Alert variant="info" title="Choose an account">
          Select a WhatsApp account above, or{' '}
          <Link to="/accounts" className="text-wa-green underline">
            add one first
          </Link>
          .
        </Alert>
      )}

      {tab === 'compose' && accountId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Check a number"
            description="See if a phone number has WhatsApp"
            action={<Phone className="h-4 w-4 text-muted" />}
          >
            <div className="space-y-3">
              <Input
                label="Phone number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="9647807110011"
                hint="Country code without + (e.g. 964 for Iraq)"
              />
              <Button
                loading={loading === 'check'}
                disabled={!accountReady}
                onClick={checkNumber}
              >
                Check on WhatsApp
              </Button>
              {checkResult !== null && showApiDetails && (
                <JsonBlock data={checkResult} />
              )}
              {checkResult !== null && !showApiDetails && typeof checkResult === 'object' && checkResult && 'exists' in (checkResult as object) && (
                <p className="text-sm text-text">
                  {(checkResult as { exists?: boolean }).exists
                    ? '✓ This number is on WhatsApp'
                    : '✗ Not found on WhatsApp'}
                </p>
              )}
            </div>
          </Card>

          <Card
            title="Send a message"
            description={`From ${displayName}`}
            action={<Send className="h-4 w-4 text-muted" />}
          >
            <div className="space-y-3">
              <Textarea
                label="Message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Write your message…"
              />
              <Textarea
                label="Recipients"
                value={phoneList}
                onChange={(e) => setPhoneList(e.target.value)}
                rows={3}
                hint="One number per line, or separated by commas"
                placeholder="9647807110011"
              />
              <Button
                loading={loading === 'send'}
                disabled={!accountReady}
                onClick={sendMessage}
              >
                Send message
              </Button>
              {sendResult !== null && showApiDetails && (
                <JsonBlock data={sendResult} />
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === 'media' && accountId && (
        <Card
          title="Send a file"
          description={`Photos, documents, audio or video from ${displayName}`}
          action={<Image className="h-4 w-4 text-muted" />}
        >
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-muted">Choose file</span>
              <input
                type="file"
                onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-wa-green/15 file:px-3 file:py-2 file:text-sm file:font-medium file:text-wa-green"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-muted">File type</span>
              <select
                value={mediaType}
                onChange={(e) =>
                  setMediaType(e.target.value as typeof mediaType)
                }
                className="w-full rounded-lg border border-border bg-panel px-3.5 py-2.5 text-sm text-text outline-none focus:border-wa-green"
              >
                <option value="document">Document</option>
                <option value="image">Image</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
              </select>
            </label>
            <Textarea
              label="Caption (optional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
            />
            <Textarea
              label="Recipients"
              value={mediaPhones}
              onChange={(e) => setMediaPhones(e.target.value)}
              rows={3}
              hint="One number per line, or separated by commas"
            />
            <Button
              loading={loading === 'media'}
              disabled={!accountReady}
              onClick={sendMedia}
            >
              Send file
            </Button>
            {mediaResult !== null && showApiDetails && (
              <JsonBlock data={mediaResult} />
            )}
          </div>
        </Card>
      )}

      {tab === 'history' && accountId && (
        <div className="space-y-4">
          {stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ['Total', stats.total],
                  ['Sent', stats.sent],
                  ['Failed', stats.failed],
                  ['Pending', stats.pending],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-border bg-panel px-4 py-3 text-center"
                >
                  <p className="text-xs text-muted">{label}</p>
                  <p className="text-xl font-bold text-text">{value}</p>
                </div>
              ))}
            </div>
          )}

          <Card
            title="Message history"
            description={displayName}
          >
            <ListToolbar
              search={historySearch}
              onSearchChange={setHistorySearch}
              searchPlaceholder="Search by phone number…"
            >
              <FilterSelect
                label="Status"
                value={historyStatus}
                onChange={(v) => setHistoryStatus(v as typeof historyStatus)}
                options={[
                  { value: 'all', label: 'All messages' },
                  { value: 'sent', label: 'Sent' },
                  { value: 'failed', label: 'Failed' },
                  { value: 'pending', label: 'Pending' },
                ]}
              />
              <Button loading={loading === 'history'} onClick={loadHistory}>
                Refresh
              </Button>
            </ListToolbar>

            {loading === 'history' && history.length === 0 ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : history.length === 0 ? (
              <Alert variant="info" title="No messages yet">
                Messages sent from {displayName} will appear here.
              </Alert>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-panel text-xs text-muted">
                        <th className="px-3 py-2 font-medium">Phone</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Preview</th>
                        <th className="px-3 py-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-border/60 last:border-0 hover:bg-panel/40"
                        >
                          <td className="px-3 py-2 font-mono text-xs">{row.phoneNumber}</td>
                          <td className="px-3 py-2">{row.messageType}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                row.status === 'sent'
                                  ? 'bg-wa-green/15 text-wa-green'
                                  : row.status === 'failed'
                                    ? 'bg-red-500/15 text-red-300'
                                    : 'bg-amber-500/15 text-amber-300'
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="max-w-[200px] truncate px-3 py-2 text-muted">
                            {row.mediaFileName ?? row.messageText}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted">
                            {row.createdAt
                              ? new Date(row.createdAt).toLocaleString()
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
      )}

      {accountId && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={showApiDetails}
            onChange={(e) => setShowApiDetails(e.target.checked)}
            className="rounded border-border"
          />
          Show API response details (developers)
        </label>
      )}
    </div>
  )
}
