import { Key, Link2, ShieldBan, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { CopyRow } from './ui/CopyRow'
import { Input } from './ui/Input'
import { ListToolbar } from './ui/ListToolbar'
import { Pagination, DEFAULT_PAGE_SIZE } from './ui/Pagination'
import { api, ApiClientError } from '../lib/api'
import { getApiUrl } from '../lib/storage'
import { formatAccountLabel, sameAccountId } from '../lib/accountDisplay'
import { useAccounts } from '../context/AccountContext'
import type { ApiKeyRecord, OptOutEntry, UserQuota, WebhookRecord } from '../types/features'
import { WEBHOOK_EVENTS } from '../types/features'

const WEBHOOK_EVENT_LABELS: Record<string, string> = {
  'message.received': 'استلام رسالة',
  'message.sent': 'إرسال رسالة',
  'campaign.completed': 'اكتمال حملة',
  'campaign.failed': 'فشل حملة',
  'account.ready': 'الحساب جاهز',
  'account.disconnected': 'انفصال الحساب',
}

function AccountNoteEditor({
  accountId,
  note,
  onSaved,
}: {
  accountId: string
  note: string
  onSaved: () => Promise<unknown> | unknown
}) {
  const [value, setValue] = useState(note)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue(note)
  }, [accountId, note])

  async function save() {
    const next = value.trim()
    if (next === note.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.updateAccountNote(accountId, next)
      await onSaved()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر حفظ الملاحظة')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Input
            label="ملاحظة"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => void save()}
            placeholder="مثال: حساب شركة الأفق"
            maxLength={160}
            id={`account-note-${accountId}`}
          />
        </div>
        <Button variant="secondary" loading={saving} onClick={() => void save()}>
          حفظ
        </Button>
      </div>
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </div>
  )
}

export function IntegrationsPanel() {
  const { accounts, refreshAccounts } = useAccounts()
  const [quota, setQuota] = useState<UserQuota | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([])
  const [webhooks, setWebhooks] = useState<WebhookRecord[]>([])
  const [keysLoading, setKeysLoading] = useState(true)
  const [whUrl, setWhUrl] = useState('')
  const [whEvents, setWhEvents] = useState<string[]>(['message.received', 'campaign.completed'])
  const [msgLimit, setMsgLimit] = useState('')
  const [checkLimit, setCheckLimit] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setKeysLoading(true)
    const [quotaRes, keysRes, hooksRes] = await Promise.allSettled([
      api.getQuota(),
      api.listApiKeys(),
      api.listWebhooks(),
    ])
    if (quotaRes.status === 'fulfilled') {
      setQuota(quotaRes.value)
      setMsgLimit(String(quotaRes.value.dailyMessageLimit))
      setCheckLimit(String(quotaRes.value.dailyCheckLimit))
    }
    if (keysRes.status === 'fulfilled') {
      setApiKeys(keysRes.value)
    }
    if (hooksRes.status === 'fulfilled') {
      setWebhooks(hooksRes.value.webhooks)
    }
    if (keysRes.status === 'rejected') {
      const err = keysRes.reason
      setError(err instanceof ApiClientError ? err.message : 'تعذّر تحميل مفاتيح الإرسال')
    } else {
      setError(null)
    }
    setKeysLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const credentialRows = useMemo(() => {
    if (accounts.length > 0) {
      return accounts.map((account) => {
        const key = apiKeys.find(
          (k) =>
            sameAccountId(k.accountId, account.accountId) ||
            sameAccountId(k.name, account.accountId),
        )
        return {
          id: key?.id ?? account.accountId,
          accountId: account.accountId,
          note: account.note || '',
          token: account.token || key?.token || null,
        }
      })
    }
    return apiKeys
      .filter((k) => k.accountId)
      .map((k) => ({
        id: k.id,
        accountId: k.accountId as string,
        note: '',
        token: k.token ?? null,
      }))
  }, [accounts, apiKeys])

  async function createWebhook() {
    if (!whUrl.trim()) return
    try {
      await api.createWebhook({ url: whUrl.trim(), events: whEvents })
      setWhUrl('')
      setSuccess('أُضيف الويب هوك')
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'فشل الإنشاء')
    }
  }

  async function saveQuota() {
    try {
      await api.updateQuota({
        dailyMessageLimit: parseInt(msgLimit, 10),
        dailyCheckLimit: parseInt(checkLimit, 10),
      })
      setSuccess('تم تحديث الحدود اليومية')
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'فشل الحفظ')
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="error" title="خطأ" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" title="تم" onDismiss={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Card title="الحدود اليومية" description="حصة الإرسال والتحقق لكل يوم">
        {quota && (
          <p className="mb-4 text-[15px] text-muted">
            اليوم: {quota.messagesSentToday}/{quota.dailyMessageLimit} رسالة ·{' '}
            {quota.checksToday}/{quota.dailyCheckLimit} عملية تحقق
          </p>
        )}
        <div className="grid max-w-[700px] gap-4 sm:grid-cols-2">
          <Input
            label="حد الرسائل اليومي"
            value={msgLimit}
            onChange={(e) => setMsgLimit(e.target.value)}
          />
          <Input
            label="حد التحقق اليومي"
            value={checkLimit}
            onChange={(e) => setCheckLimit(e.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={saveQuota}>حفظ الحدود</Button>
        </div>
      </Card>

      <Card
        title="مفتاح الإرسال"
        description="بيانات الحسابات الحالية — عنوان الخادم وinstance_id وtoken للنسخ"
        action={<Key className="h-4 w-4 text-muted" />}
      >
        {credentialRows.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-[15px] text-muted">لا توجد حسابات بعد.</p>
            <Link
              to="/accounts#add-account"
              className="mt-3 inline-flex min-h-11 items-center text-[15px] font-semibold text-primary-700 underline"
            >
              إضافة حساب
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {credentialRows.map((row) => (
              <li key={String(row.id)} className="rounded-[16px] bg-slate-50 p-4 sm:p-5">
                <div className="mb-4 flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white text-primary-700">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-text">
                      {formatAccountLabel(row.accountId, row.note)}
                    </p>
                    <p className="mt-0.5 font-mono text-[13px] text-muted" dir="ltr">
                      {row.accountId}
                    </p>
                  </div>
                </div>
                <div className="mb-4">
                  <AccountNoteEditor
                    accountId={row.accountId}
                    note={row.note}
                    onSaved={refreshAccounts}
                  />
                </div>
                <div className="space-y-2">
                  <CopyRow label="عنوان الخادم" value={getApiUrl()} className="bg-white" />
                  <CopyRow label="instance_id" value={row.accountId} className="bg-white" />
                  {row.token ? (
                    <CopyRow label="token" value={row.token} className="bg-white" />
                  ) : keysLoading ? (
                    <div className="skeleton h-16 w-full rounded-[14px]" />
                  ) : (
                    <p className="rounded-[14px] bg-white px-4 py-3 text-[13px] text-muted">
                      لا يوجد رمز محفوظ لهذا الحساب.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="الويب هوك" action={<Link2 className="h-4 w-4 text-muted" />}>
        <div className="max-w-[700px]">
          <Input
            label="الرابط"
            value={whUrl}
            onChange={(e) => setWhUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="mt-4">
          <p className="mb-2 text-[15px] font-medium text-text">الأحداث</p>
          <div className="flex flex-wrap gap-2">
            {WEBHOOK_EVENTS.map((ev) => (
              <label
                key={ev}
                className="flex min-h-11 items-center gap-2 rounded-[14px] bg-slate-50 px-3 text-[13px]"
              >
                <input
                  type="checkbox"
                  checked={whEvents.includes(ev)}
                  onChange={(e) => {
                    setWhEvents((prev) =>
                      e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev),
                    )
                  }}
                />
                <span>{WEBHOOK_EVENT_LABELS[ev] ?? ev}</span>
                <span className="font-mono text-[11px] text-muted" dir="ltr">
                  {ev}
                </span>
              </label>
            ))}
          </div>
        </div>
        <Button className="mt-4" onClick={createWebhook}>
          إضافة ويب هوك
        </Button>
        {webhooks.length === 0 ? (
          <p className="mt-4 py-4 text-center text-[15px] text-muted">لا توجد روابط ويب هوك بعد.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {webhooks.map((w) => (
              <li key={w.id} className="rounded-[16px] bg-slate-50 p-4">
                <p className="truncate font-medium" dir="ltr">
                  {w.url}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {w.events.map((ev) => WEBHOOK_EVENT_LABELS[ev] ?? ev).join(' · ')}
                </p>
                <Button
                  variant="danger"
                  className="mt-3"
                  onClick={() => api.deleteWebhook(w.id).then(load)}
                >
                  حذف
                </Button>
              </li>
            ))}
          </ul>
        )}
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
      setError(err instanceof ApiClientError ? err.message : 'تعذّر التحميل')
    }
  }, [search, page, pageSize])

  useEffect(() => {
    load()
  }, [load])

  return (
    <Card
      title="قائمة إلغاء الاشتراك"
      description="أرقام مستثناة من الحملات"
      action={<ShieldBan className="h-4 w-4 text-muted" />}
    >
      {error && (
        <Alert variant="error" title="خطأ" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      <div className="mb-4 flex max-w-[700px] flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Input
            label="إضافة رقم"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9647…"
          />
        </div>
        <Button
          onClick={() =>
            api.addOptOut(phone).then(() => {
              setPhone('')
              load()
            })
          }
        >
          إضافة
        </Button>
      </div>
      <ListToolbar search={search} onSearchChange={setSearch} searchPlaceholder="بحث برقم الهاتف…" />
      {items.length === 0 ? (
        <p className="py-8 text-center text-[15px] text-muted">لا توجد أرقام مستثناة بعد.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between rounded-[14px] px-3 py-2 hover:bg-slate-50"
            >
              <span className="font-mono" dir="ltr">
                {o.phoneNumber}
              </span>
              <Button variant="ghost" onClick={() => api.removeOptOut(o.phoneNumber).then(load)}>
                إزالة
              </Button>
            </li>
          ))}
        </ul>
      )}
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
