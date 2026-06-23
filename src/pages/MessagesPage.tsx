import {
  History,
  Image,
  Phone,
  Send,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { JsonBlock } from '../components/JsonBlock'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { api, ApiClientError } from '../lib/api'
import { getAccountId } from '../lib/storage'
import type { MessageRecord, MessageStatistics } from '../types/messages'

type Tab = 'compose' | 'media' | 'history'
type LoadingKey = 'check' | 'send' | 'media' | 'history' | null

export function MessagesPage() {
  const [tab, setTab] = useState<Tab>('compose')
  const [accountId] = useState(getAccountId)
  const [phoneNumber, setPhoneNumber] = useState('9647807110011')
  const [message, setMessage] = useState('hello!')
  const [phoneList, setPhoneList] = useState('9647807110011')
  const [mediaPhones, setMediaPhones] = useState('9647807110011')
  const [caption, setCaption] = useState('')
  const [mediaType, setMediaType] = useState<'image' | 'document' | 'audio' | 'video'>('document')
  const [mediaFile, setMediaFile] = useState<File | null>(null)

  const [historyStatus, setHistoryStatus] = useState<'all' | 'sent' | 'failed' | 'pending'>('all')
  const [history, setHistory] = useState<MessageRecord[]>([])
  const [stats, setStats] = useState<MessageStatistics | null>(null)

  const [checkResult, setCheckResult] = useState<unknown>(null)
  const [sendResult, setSendResult] = useState<unknown>(null)
  const [mediaResult, setMediaResult] = useState<unknown>(null)
  const [loading, setLoading] = useState<LoadingKey>(null)
  const [error, setError] = useState<string | null>(null)

  function parsePhones(raw: string): string[] {
    return raw
      .split(/[\n,;]+/)
      .map((p) => p.trim())
      .filter(Boolean)
  }

  async function checkNumber() {
    setLoading('check')
    setError(null)
    try {
      const data = await api.checkNumber({ accountId, phoneNumber })
      setCheckResult(data)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Check failed')
      setCheckResult(err instanceof ApiClientError ? err.body : null)
    } finally {
      setLoading(null)
    }
  }

  async function sendMessage() {
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
      setError(err instanceof ApiClientError ? err.message : 'Send failed')
      setSendResult(err instanceof ApiClientError ? err.body : null)
    } finally {
      setLoading(null)
    }
  }

  async function sendMedia() {
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
    setLoading('history')
    setError(null)
    try {
      const [messages, statistics] = await Promise.all([
        api.messageHistory({
          accountId,
          status: historyStatus === 'all' ? undefined : historyStatus,
          limit: 50,
        }),
        api.messageStatistics(accountId),
      ])
      setHistory(messages)
      setStats(statistics)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load history')
      setHistory([])
      setStats(null)
    } finally {
      setLoading(null)
    }
  }, [accountId, historyStatus])

  useEffect(() => {
    if (tab === 'history') loadHistory()
  }, [tab, loadHistory])

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
          Send, attach media, and view history for account{' '}
          <code className="rounded bg-card px-1.5 py-0.5 text-wa-green">{accountId}</code>
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
            {label}
          </button>
        ))}
      </div>

      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {tab === 'compose' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Check number"
            description="POST /api/messages/check-number"
            action={<Phone className="h-4 w-4 text-muted" />}
          >
            <div className="space-y-3">
              <Input
                label="Phone number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="9647807110011"
                hint="Include country code, no + sign. Account must be loaded in server memory."
              />
              <Button loading={loading === 'check'} onClick={checkNumber}>
                Check on WhatsApp
              </Button>
              {checkResult !== null && <JsonBlock data={checkResult} />}
            </div>
          </Card>

          <Card
            title="Send message"
            description="POST /api/messages/send"
            action={<Send className="h-4 w-4 text-muted" />}
          >
            <div className="space-y-3">
              <Textarea
                label="Message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
              />
              <Textarea
                label="Recipients"
                value={phoneList}
                onChange={(e) => setPhoneList(e.target.value)}
                rows={3}
                hint="One per line, or comma-separated"
              />
              <Button loading={loading === 'send'} onClick={sendMessage}>
                Send message
              </Button>
              {sendResult !== null && <JsonBlock data={sendResult} />}
            </div>
          </Card>
        </div>
      )}

      {tab === 'media' && (
        <Card
          title="Send media"
          description="POST /api/messages/send-media (multipart)"
          action={<Image className="h-4 w-4 text-muted" />}
        >
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-muted">File</span>
              <input
                type="file"
                onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-wa-green/15 file:px-3 file:py-2 file:text-sm file:font-medium file:text-wa-green"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-muted">Media type</span>
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
              hint="One per line, or comma-separated"
            />
            <Button loading={loading === 'media'} onClick={sendMedia}>
              Send media
            </Button>
            {mediaResult !== null && <JsonBlock data={mediaResult} />}
          </div>
        </Card>
      )}

      {tab === 'history' && (
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
            description="GET /api/messages · GET /api/messages/statistics"
          >
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-muted">Status filter</span>
                <select
                  value={historyStatus}
                  onChange={(e) =>
                    setHistoryStatus(e.target.value as typeof historyStatus)
                  }
                  className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text"
                >
                  <option value="all">All</option>
                  <option value="sent">Sent</option>
                  <option value="failed">Failed</option>
                  <option value="pending">Pending</option>
                </select>
              </label>
              <Button loading={loading === 'history'} onClick={loadHistory}>
                Refresh
              </Button>
            </div>

            {loading === 'history' && history.length === 0 ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : history.length === 0 ? (
              <Alert variant="info" title="No messages">
                No message records for this account yet.
              </Alert>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-panel text-xs text-muted">
                      <th className="px-3 py-2 font-medium">ID</th>
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
                        <td className="px-3 py-2 text-muted">{row.id}</td>
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
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
