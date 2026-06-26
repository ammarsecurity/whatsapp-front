import { Inbox, MessageSquare, Send, Zap } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AccountPicker } from '../components/AccountPicker'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { ListToolbar } from '../components/ui/ListToolbar'
import { Pagination, DEFAULT_PAGE_SIZE } from '../components/ui/Pagination'
import { Textarea } from '../components/ui/Textarea'
import { useAccounts } from '../context/AccountContext'
import { useWebSocket } from '../hooks/useWebSocket'
import { api, ApiClientError } from '../lib/api'
import { formatAccountLabel } from '../lib/accountDisplay'
import type { AutoReplyRule, InboxMessage } from '../types/features'

type Tab = 'inbox' | 'auto-replies'

export function InboxPage() {
  const { selectedAccountId } = useAccounts()
  const [tab, setTab] = useState<Tab>('inbox')
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [unread, setUnread] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [conversation, setConversation] = useState<InboxMessage[]>([])
  const [replyText, setReplyText] = useState('')
  const [replyLoading, setReplyLoading] = useState(false)

  const [rules, setRules] = useState<AutoReplyRule[]>([])
  const [ruleKeyword, setRuleKeyword] = useState('')
  const [ruleReply, setRuleReply] = useState('')
  const [ruleMatch, setRuleMatch] = useState<'contains' | 'exact' | 'any'>('contains')

  const loadInbox = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.listInbox({
        accountId: selectedAccountId || undefined,
        search: search.trim() || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      })
      setMessages(r.items)
      setTotal(r.total)
      setTotalPages(r.totalPages)
      setUnread(r.unread)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load inbox')
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId, search, page, pageSize])

  const loadRules = useCallback(async () => {
    try {
      const list = await api.listAutoReplies(selectedAccountId || undefined)
      setRules(list)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load rules')
    }
  }, [selectedAccountId])

  useEffect(() => {
    if (tab === 'inbox') loadInbox()
    else loadRules()
  }, [tab, loadInbox, loadRules])

  useEffect(() => {
    setPage(1)
  }, [search, pageSize, selectedAccountId])

  useWebSocket((event) => {
    if (event === 'message.received' || event === 'message.sent') {
      loadInbox()
      if (selectedPhone && selectedAccountId) {
        openConversation(selectedPhone)
      }
    }
  })

  async function openConversation(phone: string) {
    if (!selectedAccountId) return
    setSelectedPhone(phone)
    try {
      const msgs = await api.getInboxConversation(selectedAccountId, phone)
      setConversation(msgs)
      const unreadIds = msgs.filter((m) => !m.isRead && m.direction === 'in').map((m) => m.id)
      if (unreadIds.length) {
        await api.markInboxRead(unreadIds)
        loadInbox()
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load conversation')
    }
  }

  async function sendReply() {
    if (!selectedAccountId || !selectedPhone || !replyText.trim()) return
    setReplyLoading(true)
    try {
      await api.replyInbox(selectedAccountId, selectedPhone, replyText.trim())
      setReplyText('')
      await openConversation(selectedPhone)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Reply failed')
    } finally {
      setReplyLoading(false)
    }
  }

  async function addRule() {
    if (!ruleReply.trim()) {
      setError('Reply text is required')
      return
    }
    try {
      await api.createAutoReply({
        accountId: selectedAccountId || undefined,
        keyword: ruleMatch === 'any' ? undefined : ruleKeyword,
        matchType: ruleMatch,
        replyText: ruleReply.trim(),
      })
      setRuleKeyword('')
      setRuleReply('')
      await loadRules()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create rule')
    }
  }

  async function toggleRule(rule: AutoReplyRule) {
    await api.updateAutoReply(rule.id, { enabled: !rule.enabled })
    await loadRules()
  }

  async function deleteRule(id: number) {
    await api.deleteAutoReply(id)
    await loadRules()
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-muted">
            Incoming messages & auto-replies
            {unread > 0 && (
              <span className="ml-2 rounded-full bg-wa-green/20 px-2 py-0.5 text-xs font-medium text-wa-green">
                {unread} unread
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={tab === 'inbox' ? 'primary' : 'secondary'}
            onClick={() => setTab('inbox')}
          >
            <Inbox className="h-4 w-4" />
            Inbox
          </Button>
          <Button
            variant={tab === 'auto-replies' ? 'primary' : 'secondary'}
            onClick={() => setTab('auto-replies')}
          >
            <Zap className="h-4 w-4" />
            Auto-replies
          </Button>
        </div>
      </header>

      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card title="Account">
        <AccountPicker compact showStatus={false} />
      </Card>

      {tab === 'inbox' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Messages">
            <ListToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search…" />
            {loading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted">No messages yet.</p>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {messages.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => openConversation(m.phoneNumber)}
                        className={`w-full px-3 py-3 text-left text-sm hover:bg-panel/60 ${
                          selectedPhone === m.phoneNumber ? 'bg-panel/80' : ''
                        } ${!m.isRead && m.direction === 'in' ? 'font-medium' : 'text-muted'}`}
                      >
                        <p className="text-text">
                          {m.contactName || m.phoneNumber}
                          <span className="ml-2 text-xs text-muted">
                            {formatAccountLabel(m.accountId)}
                          </span>
                        </p>
                        <p className="truncate text-xs">{m.body}</p>
                      </button>
                    </li>
                  ))}
                </ul>
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

          <Card title="Conversation" action={<MessageSquare className="h-4 w-4 text-muted" />}>
            {!selectedPhone ? (
              <p className="text-sm text-muted">Select a message to view the thread.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
                  {conversation.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        m.direction === 'out'
                          ? 'ml-8 bg-wa-green/15 text-text'
                          : 'mr-8 bg-panel text-muted'
                      }`}
                    >
                      {m.body}
                    </div>
                  ))}
                </div>
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={2}
                  placeholder="Type a reply…"
                />
                <Button loading={replyLoading} onClick={sendReply} disabled={!replyText.trim()}>
                  <Send className="h-4 w-4" />
                  Send reply
                </Button>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <>
          <Card title="New auto-reply rule">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-muted">Match type</span>
                <select
                  value={ruleMatch}
                  onChange={(e) => setRuleMatch(e.target.value as typeof ruleMatch)}
                  className="w-full rounded-lg border border-border bg-panel px-3 py-2.5 text-sm"
                >
                  <option value="contains">Contains keyword</option>
                  <option value="exact">Exact match</option>
                  <option value="any">Any message (catch-all)</option>
                </select>
              </label>
              {ruleMatch !== 'any' && (
                <Input
                  label="Keyword"
                  value={ruleKeyword}
                  onChange={(e) => setRuleKeyword(e.target.value)}
                  placeholder="hello, price, help…"
                />
              )}
            </div>
            <div className="mt-3">
              <Textarea
                label="Auto reply"
                value={ruleReply}
                onChange={(e) => setRuleReply(e.target.value)}
                rows={3}
                placeholder="Thanks for contacting us…"
              />
            </div>
            <Button className="mt-3" onClick={addRule}>
              Add rule
            </Button>
          </Card>

          <Card title="Active rules">
            {rules.length === 0 ? (
              <p className="text-sm text-muted">No auto-reply rules yet.</p>
            ) : (
              <ul className="space-y-2">
                {rules.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {r.matchType === 'any'
                          ? 'Any message'
                          : `${r.matchType}: "${r.keyword}"`}
                      </p>
                      <p className="text-muted">{r.replyText}</p>
                      <p className="text-xs text-muted">
                        {r.accountId ? formatAccountLabel(r.accountId) : 'All accounts'}
                        {' · '}
                        {r.enabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => toggleRule(r)}>
                        {r.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button variant="danger" onClick={() => deleteRule(r.id)}>
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
