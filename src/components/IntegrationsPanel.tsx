import { Key, Link2, ShieldBan } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import { ListToolbar } from './ui/ListToolbar'
import { Pagination, DEFAULT_PAGE_SIZE } from './ui/Pagination'
import { api, ApiClientError } from '../lib/api'
import type { ApiKeyRecord, OptOutEntry, UserQuota, WebhookRecord } from '../types/features'
import { WEBHOOK_EVENTS } from '../types/features'

export function IntegrationsPanel() {
  const [quota, setQuota] = useState<UserQuota | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([])
  const [webhooks, setWebhooks] = useState<WebhookRecord[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [whUrl, setWhUrl] = useState('')
  const [whEvents, setWhEvents] = useState<string[]>(['message.received', 'campaign.completed'])
  const [msgLimit, setMsgLimit] = useState('')
  const [checkLimit, setCheckLimit] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [q, keys, wh] = await Promise.all([
        api.getQuota(),
        api.listApiKeys(),
        api.listWebhooks(),
      ])
      setQuota(q)
      setMsgLimit(String(q.dailyMessageLimit))
      setCheckLimit(String(q.dailyCheckLimit))
      setApiKeys(keys)
      setWebhooks(wh.webhooks)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function createKey() {
    if (!newKeyName.trim()) return
    try {
      const r = await api.createApiKey(newKeyName.trim())
      setCreatedSecret(r.key.secret)
      setNewKeyName('')
      setSuccess('API key created — copy the secret now')
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed')
    }
  }

  async function createWebhook() {
    if (!whUrl.trim()) return
    try {
      await api.createWebhook({ url: whUrl.trim(), events: whEvents })
      setWhUrl('')
      setSuccess('Webhook created')
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed')
    }
  }

  async function saveQuota() {
    try {
      await api.updateQuota({
        dailyMessageLimit: parseInt(msgLimit, 10),
        dailyCheckLimit: parseInt(checkLimit, 10),
      })
      setSuccess('Rate limits updated')
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed')
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" title="Done" onDismiss={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Card title="Rate limits" description="Daily sending & check quotas">
        {quota && (
          <p className="mb-3 text-sm text-muted">
            Today: {quota.messagesSentToday}/{quota.dailyMessageLimit} messages ·{' '}
            {quota.checksToday}/{quota.dailyCheckLimit} checks
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Daily message limit" value={msgLimit} onChange={(e) => setMsgLimit(e.target.value)} />
          <Input label="Daily check limit" value={checkLimit} onChange={(e) => setCheckLimit(e.target.value)} />
        </div>
        <Button className="mt-3" onClick={saveQuota}>
          Save limits
        </Button>
      </Card>

      <Card title="API keys" description="Use X-API-Key header instead of JWT" action={<Key className="h-4 w-4 text-muted" />}>
        {createdSecret && (
          <Alert variant="info" title="Copy your key now" className="mb-3">
            <code className="break-all text-xs">{createdSecret}</code>
          </Alert>
        )}
        <div className="mb-4 flex gap-2">
          <Input
            label="Key name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="CRM integration"
            className="flex-1"
          />
          <Button className="self-end" onClick={createKey}>
            Create key
          </Button>
        </div>
        <ul className="space-y-2 text-sm">
          {apiKeys.map((k) => (
            <li key={k.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="font-medium">{k.name}</p>
                <p className="font-mono text-xs text-muted">{k.keyPrefix}…</p>
              </div>
              <Button variant="danger" onClick={() => api.deleteApiKey(k.id).then(load)}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Webhooks" action={<Link2 className="h-4 w-4 text-muted" />}>
        <Input label="URL" value={whUrl} onChange={(e) => setWhUrl(e.target.value)} placeholder="https://…" />
        <div className="mt-3">
          <p className="mb-2 text-sm font-medium text-muted">Events</p>
          <div className="flex flex-wrap gap-2">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={whEvents.includes(ev)}
                  onChange={(e) => {
                    setWhEvents((prev) =>
                      e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev),
                    )
                  }}
                />
                {ev}
              </label>
            ))}
          </div>
        </div>
        <Button className="mt-3" onClick={createWebhook}>
          Add webhook
        </Button>
        <ul className="mt-4 space-y-2 text-sm">
          {webhooks.map((w) => (
            <li key={w.id} className="rounded-lg border border-border p-3">
              <p className="truncate font-medium">{w.url}</p>
              <p className="text-xs text-muted">{w.events.join(', ')}</p>
              <Button
                variant="danger"
                className="mt-2"
                onClick={() => api.deleteWebhook(w.id).then(load)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

export function OptOutPanel() {
  const [items, setItems] = useState<OptOutEntry[]>([])
  const [search, setSearch] = useState('')
  const [phone, setPhone] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await api.listOptOuts({
        search: search.trim() || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      })
      setItems(r.items)
      setTotal(r.total)
      setTotalPages(r.totalPages)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed')
    }
  }, [search, page, pageSize])

  useEffect(() => {
    load()
  }, [load])

  return (
    <Card title="Opt-out list" description="Numbers excluded from campaigns" action={<ShieldBan className="h-4 w-4 text-muted" />}>
      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      <div className="mb-4 flex gap-2">
        <Input
          label="Add number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="9647…"
          className="flex-1"
        />
        <Button
          className="self-end"
          onClick={() =>
            api.addOptOut(phone).then(() => {
              setPhone('')
              load()
            })
          }
        >
          Add
        </Button>
      </div>
      <ListToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search phone…" />
      <ul className="divide-y divide-border text-sm">
        {items.map((o) => (
          <li key={o.id} className="flex items-center justify-between py-2">
            <span className="font-mono">{o.phoneNumber}</span>
            <Button variant="ghost" onClick={() => api.removeOptOut(o.phoneNumber).then(load)}>
              Remove
            </Button>
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
    </Card>
  )
}
