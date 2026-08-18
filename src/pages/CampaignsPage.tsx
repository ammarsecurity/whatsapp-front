import { CheckCircle2, Clock, Megaphone, Send, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountPicker, SelectedAccountStatus } from '../components/AccountPicker'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FilterSelect, ListToolbar } from '../components/ui/ListToolbar'
import { Input } from '../components/ui/Input'
import { KpiCard, PageHeader } from '../components/ui/PageHeader'
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

type PageTab = 'compose' | 'history'

function campaignStatusLabel(status: string): string {
  const map: Record<string, string> = {
    scheduled: 'مجدولة',
    completed: 'مكتملة',
    failed: 'فاشلة',
    pending: 'قيد الانتظار',
    sending: 'جارٍ الإرسال',
    running: 'جارٍ الإرسال',
  }
  return map[status] ?? status
}

function campaignStatusClass(status: string): string {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700'
  if (status === 'failed') return 'bg-red-50 text-red-700'
  return 'bg-amber-50 text-amber-700'
}

const selectClass =
  'min-h-11 w-full rounded-[14px] border border-border bg-white px-4 text-[15px] text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

export function CampaignsPage() {
  const {
    selectedAccountId,
    selectedLiveStatus,
    liveStatusPolling,
    refreshSelectedLiveStatus,
  } = useAccounts()
  const [tab, setTab] = useState<PageTab>('compose')
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
  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null
  const previewText = selectedTemplate?.body || message.trim()
  const canSend = Boolean(
    groupId &&
      selectedGroup?.numberCount &&
      (templateId || message.trim()) &&
      (scheduleLater ? scheduledAt : accountReady),
  )

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
      setError(err instanceof ApiClientError ? err.message : 'تعذّر تحميل المجموعات')
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
      setError(err instanceof ApiClientError ? err.message : 'تعذّر تحميل الحملات')
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
      setError('اختر حساب واتساب')
      return
    }
    if (!groupId) {
      setError('اختر مجموعة جهات اتصال')
      return
    }
    if (!templateId && !message.trim()) {
      setError('اكتب رسالة أو اختر قالباً')
      return
    }
    if (scheduleLater && !scheduledAt) {
      setError('حدّد تاريخ ووقت الإرسال')
      return
    }
    if (!selectedGroup?.numberCount) {
      setError('هذه المجموعة بلا أرقام — أضف جهات اتصال أولاً')
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
        setSuccess(
          `جُدولت الحملة لـ ${new Date(result.scheduledAt || scheduledAt).toLocaleString('ar-IQ')}`,
        )
      } else if (result.started) {
        setSuccess(
          `بدأت الحملة — جارٍ الإرسال إلى ${result.total} جهة اتصال. يظهر التقدم في السجل.`,
        )
      } else {
        setLastResult(result)
        setSuccess(
          `أُرسلت الحملة: وصل ${result.successCount} من ${result.total}` +
            (result.skippedOptOut ? ` (${result.skippedOptOut} ألغوا الاشتراك)` : ''),
        )
      }
      await loadCampaignHistory()
      setTab('history')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'فشلت الحملة')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="الحملات"
        description="أرسل رسالة واحدة إلى مجموعة جهات اتصال، ثم تابع النتيجة من السجل."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-6">
        <KpiCard label="إجمالي الحملات" value={String(historyTotal)} />
        <KpiCard
          label="الحساب"
          value={selectedAccountId ? formatAccountLabel(selectedAccountId) : '—'}
          hint={accountReady ? 'جاهز للإرسال' : selectedAccountId ? 'يحتاج ربط' : 'اختر حساباً'}
          tone={accountReady ? 'success' : 'warning'}
        />
        <KpiCard
          label="المستلمون"
          value={selectedGroup ? String(selectedGroup.numberCount) : '—'}
          hint={selectedGroup ? selectedGroup.name : 'اختر مجموعة'}
        />
      </div>

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

      <div className="flex gap-1 rounded-[16px] bg-white p-1 shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
        {(
          [
            { id: 'compose' as const, label: 'حملة جديدة' },
            { id: 'history' as const, label: 'السجل' },
          ]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`min-h-11 flex-1 rounded-[14px] px-4 text-[15px] font-semibold transition-colors ${
              tab === item.id
                ? 'bg-primary-50 text-primary-700'
                : 'text-muted hover:bg-slate-50 hover:text-text'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'compose' && (
        <div className="grid items-start gap-6 lg:grid-cols-12">
          <Card
            title="إعداد الحملة"
            description="اختر الحساب والمجموعة والنص ثم راجع الملخص قبل الإرسال"
            className="lg:col-span-7"
          >
            {groups.length === 0 ? (
              <div className="rounded-[16px] bg-slate-50 p-6">
                <Users className="h-8 w-8 text-muted" />
                <p className="mt-3 text-[15px] font-semibold text-text">لا توجد مجموعات بعد</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  أنشئ مجموعة واستورد الأرقام أولاً، ثم عد إلى هنا للإرسال.
                </p>
                <Link to="/contacts" className="mt-4 inline-flex">
                  <Button>
                    <Users className="h-4 w-4" />
                    فتح جهات الاتصال
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <AccountPicker compact showStatus={false} />
                  {selectedAccountId && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <SelectedAccountStatus statusData={accountStatus} polling={polling} />
                      {!accountReady && (
                        <p className="text-[13px] text-amber-700">
                          الحساب غير جاهز.{' '}
                          <Link to="/accounts" className="font-semibold underline">
                            ربط بمسح QR
                          </Link>
                        </p>
                      )}
                      <Button variant="ghost" onClick={() => refreshSelectedLiveStatus()}>
                        تحديث الحالة
                      </Button>
                    </div>
                  )}
                </div>

                <label className="block space-y-2">
                  <span className="block text-[15px] font-medium text-text">مجموعة المستلمين</span>
                  <select
                    value={groupId}
                    onChange={(e) =>
                      setGroupId(e.target.value ? Number(e.target.value) : '')
                    }
                    className={selectClass}
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({formatPhoneCount(g.numberCount)})
                      </option>
                    ))}
                  </select>
                  {selectedGroup && !selectedGroup.numberCount && (
                    <p className="text-[13px] text-amber-700">
                      هذه المجموعة فارغة.{' '}
                      <Link to="/contacts" className="font-semibold underline">
                        أضف أرقاماً
                      </Link>
                    </p>
                  )}
                </label>

                <Input
                  label="اسم الحملة (اختياري)"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="عرض الصيف 2026"
                />

                <label className="block space-y-2">
                  <span className="block text-[15px] font-medium text-text">القالب</span>
                  <select
                    value={templateId}
                    onChange={(e) =>
                      setTemplateId(e.target.value ? Number(e.target.value) : '')
                    }
                    className={selectClass}
                  >
                    <option value="">رسالة مخصصة</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>

                {!templateId ? (
                  <Textarea
                    label="نص الرسالة"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    placeholder="اكتب نص الحملة…"
                  />
                ) : (
                  <div className="rounded-[16px] bg-slate-50 px-4 py-4">
                    <p className="text-[13px] text-muted">معاينة القالب</p>
                    <p className="mt-2 whitespace-pre-wrap text-[15px] text-text">
                      {selectedTemplate?.body || '—'}
                    </p>
                    <Link to="/templates" className="mt-3 inline-block text-[13px] font-semibold text-primary-700">
                      تعديل القوالب
                    </Link>
                  </div>
                )}

                <label className="flex items-center gap-2 text-[15px]">
                  <input
                    type="checkbox"
                    checked={scheduleLater}
                    onChange={(e) => setScheduleLater(e.target.checked)}
                    className="rounded border-border"
                  />
                  جدولة الإرسال لاحقاً
                </label>
                {scheduleLater && (
                  <Input
                    label="وقت الإرسال"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                )}

                <label className="block space-y-2">
                  <span className="block text-[15px] font-medium text-text">
                    الفاصل بين الرسائل: {delaySec} ث
                  </span>
                  <input
                    type="range"
                    min={2}
                    max={15}
                    step={1}
                    value={delaySec}
                    onChange={(e) => setDelaySec(Number(e.target.value))}
                    className="w-full accent-primary-500"
                  />
                  <p className="text-[13px] text-muted">
                    يُفضَّل 3–5 ثوانٍ لتقليل خطر الحظر من واتساب.
                  </p>
                </label>
              </div>
            )}
          </Card>

          <Card title="ملخص قبل الإرسال" className="lg:col-span-5">
            <ul className="space-y-4">
              <li className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-primary-50 text-primary-700">
                  <Megaphone className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] text-muted">الحساب</p>
                  <p className="mt-0.5 text-[15px] font-semibold text-text">
                    {selectedAccountId ? formatAccountLabel(selectedAccountId) : 'غير محدد'}
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-primary-50 text-primary-700">
                  <Users className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] text-muted">المستلمون</p>
                  <p className="mt-0.5 text-[15px] font-semibold text-text">
                    {selectedGroup
                      ? `${selectedGroup.name} · ${formatPhoneCount(selectedGroup.numberCount)}`
                      : 'اختر مجموعة'}
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-primary-50 text-primary-700">
                  {scheduleLater ? <Clock className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] text-muted">موعد الإرسال</p>
                  <p className="mt-0.5 text-[15px] font-semibold text-text">
                    {scheduleLater
                      ? scheduledAt
                        ? new Date(scheduledAt).toLocaleString('ar-IQ')
                        : 'حدّد التاريخ والوقت'
                      : 'الآن'}
                  </p>
                </div>
              </li>
            </ul>

            <div className="mt-6 rounded-[16px] bg-slate-50 px-4 py-4">
              <p className="text-[13px] text-muted">نص الرسالة</p>
              <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-[15px] text-text">
                {previewText || 'لم يُكتب نص بعد'}
              </p>
              <p className="mt-3 text-[13px] text-muted">فاصل {delaySec} ث بين كل رسالة</p>
            </div>

            <Button
              className="mt-6 w-full"
              loading={loading}
              disabled={!canSend}
              onClick={sendCampaign}
            >
              <Send className="h-4 w-4" />
              {scheduleLater ? 'جدولة الحملة' : 'إرسال الحملة'}
            </Button>
            {!accountReady && !scheduleLater && (
              <p className="mt-3 text-center text-[13px] text-muted">
                اربط الحساب أولاً، أو فعّل الجدولة لوقت لاحق.
              </p>
            )}
          </Card>
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-6">
          {lastResult && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-6">
              <KpiCard label="آخر إرسال — الإجمالي" value={String(lastResult.total)} />
              <KpiCard label="وصلت" value={String(lastResult.successCount)} tone="success" />
              <KpiCard label="فشلت" value={String(lastResult.failureCount)} tone="danger" />
            </div>
          )}

          <Card title="سجل الحملات" description="اضغط اسم الحملة لفتح تقرير التسليم">
            <ListToolbar
              search={historySearch}
              onSearchChange={setHistorySearch}
              searchPlaceholder="ابحث بالاسم أو المجموعة…"
            >
              <FilterSelect
                label="الحالة"
                value={historyStatus}
                onChange={setHistoryStatus}
                options={[
                  { value: 'all', label: 'كل الحالات' },
                  { value: 'scheduled', label: 'مجدولة' },
                  { value: 'completed', label: 'مكتملة' },
                  { value: 'failed', label: 'فاشلة' },
                  { value: 'pending', label: 'قيد الانتظار' },
                  { value: 'sending', label: 'جارٍ الإرسال' },
                ]}
              />
            </ListToolbar>

            {loadingHistory ? (
              <div className="space-y-2">
                <div className="skeleton h-16 rounded-[16px]" />
                <div className="skeleton h-16 rounded-[16px]" />
                <div className="skeleton h-16 rounded-[16px]" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="rounded-[16px] bg-slate-50 px-4 py-10 text-center">
                <Megaphone className="mx-auto h-8 w-8 text-muted" />
                <p className="mt-3 text-[15px] font-medium text-text">
                  {historySearch || historyStatus !== 'all'
                    ? 'لا حملات تطابق عوامل التصفية'
                    : 'لا حملات بعد'}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  أنشئ حملة من التبويب الأول لإرسال رسالة إلى مجموعة.
                </p>
                <Button className="mt-4" onClick={() => setTab('compose')}>
                  حملة جديدة
                </Button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-[16px] bg-slate-50">
                  <table className="w-full min-w-[640px] text-start text-[15px]">
                    <thead>
                      <tr className="text-[13px] text-muted">
                        <th className="px-4 py-3 font-medium">الاسم</th>
                        <th className="px-4 py-3 font-medium">المجموعة</th>
                        <th className="px-4 py-3 font-medium">الحالة</th>
                        <th className="px-4 py-3 font-medium">النتيجة</th>
                        <th className="px-4 py-3 font-medium">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((c) => (
                        <tr key={c.id} className="border-t border-white last:border-0">
                          <td className="px-4 py-3 font-medium">
                            <Link
                              to={`/campaigns/${c.id}`}
                              className="text-primary-700 hover:underline"
                            >
                              {c.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-muted">{c.groupName ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[13px] font-medium ${campaignStatusClass(c.status)}`}
                            >
                              {campaignStatusLabel(c.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[13px] text-muted">
                            أُرسل {c.successCount} من {c.totalRecipients}
                          </td>
                          <td className="px-4 py-3 text-[13px] text-muted">
                            {c.createdAt
                              ? new Date(c.createdAt).toLocaleString('ar-IQ')
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
    </div>
  )
}
