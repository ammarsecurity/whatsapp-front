import { Image as ImageIcon, Phone, Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountPicker, SelectedAccountStatus } from '../components/AccountPicker'
import { JsonBlock } from '../components/JsonBlock'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FilterSelect, ListToolbar } from '../components/ui/ListToolbar'
import { Input } from '../components/ui/Input'
import { KpiCard, PageHeader } from '../components/ui/PageHeader'
import { Pagination, DEFAULT_PAGE_SIZE } from '../components/ui/Pagination'
import { Textarea } from '../components/ui/Textarea'
import { useAccounts } from '../context/AccountContext'
import { api, ApiClientError } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { formatAccountLabel } from '../lib/accountDisplay'
import { isAccountReady } from '../lib/accountStatus'
import type { MessageRecord, MessageStatistics } from '../types/messages'

type Tab = 'send' | 'history'
type SendMode = 'text' | 'file'
type LoadingKey = 'check' | 'send' | 'media' | 'history' | null

function formatMessageActionError(err: unknown, fallback: string): string {
  if (!(err instanceof ApiClientError)) {
    return fallback
  }
  if (err.status === 408 || err.status === 504) {
    return `${err.message} افتح الحسابات ← امسح الجلسات العالقة، ثم امسح رمز QR من جديد.`
  }
  if (err.status === 503) {
    return `${err.message} انتظر حتى يظهر الحساب جاهزاً للإرسال.`
  }
  return err.message
}

function messageStatusLabel(status: string): string {
  const map: Record<string, string> = {
    sent: 'مرسلة',
    failed: 'فاشلة',
    pending: 'قيد الانتظار',
  }
  return map[status] ?? status
}

function messageTypeLabel(type: string): string {
  const map: Record<string, string> = {
    text: 'نص',
    image: 'صورة',
    document: 'مستند',
    audio: 'صوت',
    video: 'فيديو',
    media: 'وسائط',
  }
  return map[type] ?? type
}

function parsePhones(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function MessagesPage() {
  const {
    selectedAccountId,
    selectedLiveStatus,
    liveStatusPolling,
    refreshSelectedLiveStatus,
  } = useAccounts()
  const accountId = selectedAccountId

  const [tab, setTab] = useState<Tab>('send')
  const [sendMode, setSendMode] = useState<SendMode>('text')
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
  const recipients = parsePhones(sendMode === 'text' ? phoneList : mediaPhones)
  const numberExists =
    checkResult !== null &&
    typeof checkResult === 'object' &&
    checkResult &&
    'exists' in (checkResult as object)
      ? Boolean((checkResult as { exists?: boolean }).exists)
      : null

  async function checkNumber() {
    if (!accountId) return
    setLoading('check')
    setError(null)
    try {
      const data = await api.checkNumber({ accountId, phoneNumber })
      setCheckResult(data)
    } catch (err) {
      setError(formatMessageActionError(err, 'فشل التحقق'))
      setCheckResult(err instanceof ApiClientError ? err.body : null)
    } finally {
      setLoading(null)
    }
  }

  async function sendMessage() {
    if (!accountId) return
    setLoading('send')
    setError(null)
    if (!recipients.length) {
      setError('أضف رقماً واحداً على الأقل')
      setLoading(null)
      return
    }
    try {
      const data = await api.sendMessage({ accountId, message, phoneNumbers: recipients })
      setSendResult(data)
      setTab('history')
    } catch (err) {
      setError(formatMessageActionError(err, 'فشل الإرسال'))
      setSendResult(err instanceof ApiClientError ? err.body : null)
    } finally {
      setLoading(null)
    }
  }

  async function sendMedia() {
    if (!accountId) return
    setLoading('media')
    setError(null)
    if (!mediaFile) {
      setError('اختر ملفاً للإرسال')
      setLoading(null)
      return
    }
    if (!recipients.length) {
      setError('أضف رقماً واحداً على الأقل')
      setLoading(null)
      return
    }
    try {
      const data = await api.sendMedia({
        accountId,
        phoneNumbers: recipients,
        file: mediaFile,
        mediaType,
        caption: caption.trim() || undefined,
      })
      setMediaResult(data)
      setTab('history')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'فشل إرسال الملف')
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
      setError(err instanceof ApiClientError ? err.message : 'تعذّر تحميل السجل')
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
    if (!accountId) {
      setStats(null)
      return
    }
    api.messageStatistics(accountId).then(setStats).catch(() => setStats(null))
  }, [accountId])

  useEffect(() => {
    if (tab === 'history' && accountId) loadHistory()
  }, [tab, loadHistory, accountId])

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="الرسائل"
        description="تحقق من رقم، أرسل نصاً أو ملفاً، ثم تابع النتيجة من السجل."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-6">
        <KpiCard label="الإجمالي" value={String(stats?.total ?? 0)} />
        <KpiCard label="مرسلة" value={String(stats?.sent ?? 0)} tone="success" />
        <KpiCard label="فاشلة" value={String(stats?.failed ?? 0)} tone="danger" />
        <KpiCard
          label="الحساب"
          value={displayName || '—'}
          hint={accountReady ? 'جاهز للإرسال' : accountId ? 'يحتاج ربط' : 'اختر حساباً'}
          tone={accountReady ? 'success' : 'warning'}
        />
      </div>

      {error && (
        <Alert variant="error" title="خطأ" onDismiss={() => setError(null)}>
          {error}
          {(error.includes('timed out') || error.includes('stuck')) && (
            <span>
              {' '}
              <Link to="/accounts" className="font-semibold underline">
                افتح الحسابات
              </Link>
            </span>
          )}
        </Alert>
      )}

      <div className="flex gap-1 rounded-[16px] bg-white p-1 shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
        {(
          [
            { id: 'send' as const, label: 'إرسال' },
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

      {tab === 'send' && (
        <div className="grid items-start gap-6 lg:grid-cols-12">
          <Card
            title="رسالة جديدة"
            description="اختر الحساب ثم أرسل نصاً أو ملفاً"
            className="lg:col-span-7"
          >
            {!accountId ? (
              <div className="rounded-[16px] bg-slate-50 p-6">
                <p className="text-[15px] font-semibold text-text">لا يوجد حساب محدد</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  أضف رقماً من صفحة الحسابات ثم اربطه بمسح QR.
                </p>
                <Link to="/accounts" className="mt-4 inline-flex">
                  <Button>فتح الحسابات</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <AccountPicker compact showStatus={false} />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <SelectedAccountStatus statusData={accountStatus} polling={polling} />
                    {!accountReady && (
                      <p className="text-[13px] text-amber-700">
                        {displayName} غير جاهز.{' '}
                        <Link to="/accounts" className="font-semibold underline">
                          ربط بمسح QR
                        </Link>
                      </p>
                    )}
                    <Button variant="ghost" onClick={() => refreshSelectedLiveStatus()}>
                      تحديث الحالة
                    </Button>
                  </div>
                </div>

                <div className="flex gap-1 rounded-[16px] bg-slate-50 p-1">
                  {(
                    [
                      { id: 'text' as const, label: 'نص' },
                      { id: 'file' as const, label: 'ملف' },
                    ]
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setSendMode(mode.id)}
                      className={`min-h-11 flex-1 rounded-[14px] px-4 text-[15px] font-semibold transition-colors ${
                        sendMode === mode.id
                          ? 'bg-white text-primary-700 shadow-[0px_1px_3px_rgba(15,23,42,0.08)]'
                          : 'text-muted hover:text-text'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {sendMode === 'text' ? (
                  <div className="space-y-4">
                    <Textarea
                      label="نص الرسالة"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={5}
                      placeholder="اكتب رسالتك…"
                    />
                    <Textarea
                      label="المستلمون"
                      value={phoneList}
                      onChange={(e) => setPhoneList(e.target.value)}
                      rows={4}
                      hint="رقم في كل سطر، أو مفصولة بفواصل — رمز الدولة بدون +"
                      placeholder="9647807110011"
                    />
                    {sendResult !== null && showApiDetails && <JsonBlock data={sendResult} />}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <label className="block space-y-2">
                      <span className="block text-[15px] font-medium text-text">اختر ملفاً</span>
                      <input
                        type="file"
                        onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)}
                        className="block w-full text-[15px] text-muted file:me-3 file:rounded-[14px] file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-[15px] file:font-medium file:text-primary-700"
                      />
                    </label>
                    {mediaFile && (
                      <p className="text-[13px] text-muted" dir="ltr">
                        {mediaFile.name}
                      </p>
                    )}
                    <label className="block space-y-2">
                      <span className="block text-[15px] font-medium text-text">نوع الملف</span>
                      <select
                        value={mediaType}
                        onChange={(e) => setMediaType(e.target.value as typeof mediaType)}
                        className="min-h-11 w-full rounded-[14px] border border-border bg-white px-4 text-[15px] text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                      >
                        <option value="document">مستند</option>
                        <option value="image">صورة</option>
                        <option value="audio">صوت</option>
                        <option value="video">فيديو</option>
                      </select>
                    </label>
                    <Textarea
                      label="تعليق (اختياري)"
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      rows={2}
                    />
                    <Textarea
                      label="المستلمون"
                      value={mediaPhones}
                      onChange={(e) => setMediaPhones(e.target.value)}
                      rows={4}
                      hint="رقم في كل سطر، أو مفصولة بفواصل"
                    />
                    {mediaResult !== null && showApiDetails && <JsonBlock data={mediaResult} />}
                  </div>
                )}
              </div>
            )}
          </Card>

          <div className="space-y-6 lg:col-span-5">
            <Card title="ملخص قبل الإرسال">
              <ul className="space-y-4">
                <li>
                  <p className="text-[13px] text-muted">من</p>
                  <p className="mt-0.5 text-[15px] font-semibold text-text">
                    {displayName || 'غير محدد'}
                  </p>
                </li>
                <li>
                  <p className="text-[13px] text-muted">النوع</p>
                  <p className="mt-0.5 text-[15px] font-semibold text-text">
                    {sendMode === 'text' ? 'رسالة نصية' : mediaFile ? mediaFile.name : 'ملف'}
                  </p>
                </li>
                <li>
                  <p className="text-[13px] text-muted">المستلمون</p>
                  <p className="mt-0.5 text-[15px] font-semibold text-text">
                    {recipients.length} رقم
                  </p>
                </li>
              </ul>

              {sendMode === 'text' && message.trim() && (
                <div className="mt-4 rounded-[16px] bg-slate-50 px-4 py-4">
                  <p className="text-[13px] text-muted">المعاينة</p>
                  <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-[15px] text-text">
                    {message.trim()}
                  </p>
                </div>
              )}

              <Button
                className="mt-6 w-full"
                loading={loading === 'send' || loading === 'media'}
                disabled={!accountReady || !accountId}
                onClick={sendMode === 'text' ? sendMessage : sendMedia}
              >
                {sendMode === 'text' ? (
                  <>
                    <Send className="h-4 w-4" />
                    إرسال الرسالة
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-4 w-4" />
                    إرسال الملف
                  </>
                )}
              </Button>
              {!accountReady && accountId && (
                <p className="mt-3 text-center text-[13px] text-muted">
                  اربط الحساب بمسح QR قبل الإرسال.
                </p>
              )}
            </Card>

            <Card
              title="التحقق من رقم"
              description="هل الرقم مسجّل على واتساب؟"
              action={<Phone className="h-4 w-4 text-muted" />}
            >
              <Input
                label="رقم الهاتف"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="9647807110011"
                hint="رمز الدولة بدون + (مثل 964 للعراق)"
              />
              <Button
                className="mt-4 w-full"
                variant="secondary"
                loading={loading === 'check'}
                disabled={!accountReady || !accountId}
                onClick={checkNumber}
              >
                تحقق في واتساب
              </Button>
              {numberExists !== null && (
                <div
                  className={`mt-4 rounded-[16px] px-4 py-3 text-[15px] font-medium ${
                    numberExists ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
                  }`}
                >
                  {numberExists ? 'هذا الرقم مسجّل على واتساب' : 'غير موجود على واتساب'}
                </div>
              )}
              {checkResult !== null && showApiDetails && (
                <div className="mt-4">
                  <JsonBlock data={checkResult} />
                </div>
              )}
            </Card>

            {accountId && (
              <label className="flex items-center gap-2 text-[13px] text-muted">
                <input
                  type="checkbox"
                  checked={showApiDetails}
                  onChange={(e) => setShowApiDetails(e.target.checked)}
                  className="rounded border-border"
                />
                إظهار تفاصيل استجابة API (للمطورين)
              </label>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && accountId && (
        <Card title="سجل الرسائل" description={displayName}>
          <ListToolbar
            search={historySearch}
            onSearchChange={setHistorySearch}
            searchPlaceholder="ابحث برقم الهاتف…"
          >
            <FilterSelect
              label="الحالة"
              value={historyStatus}
              onChange={(v) => setHistoryStatus(v as typeof historyStatus)}
              options={[
                { value: 'all', label: 'كل الرسائل' },
                { value: 'sent', label: 'مرسلة' },
                { value: 'failed', label: 'فاشلة' },
                { value: 'pending', label: 'قيد الانتظار' },
              ]}
            />
            <Button loading={loading === 'history'} onClick={loadHistory}>
              تحديث
            </Button>
          </ListToolbar>

          {loading === 'history' && history.length === 0 ? (
            <div className="space-y-2">
              <div className="skeleton h-16 rounded-[16px]" />
              <div className="skeleton h-16 rounded-[16px]" />
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-[16px] bg-slate-50 px-4 py-10 text-center">
              <Send className="mx-auto h-8 w-8 text-muted" />
              <p className="mt-3 text-[15px] font-medium text-text">لا رسائل بعد</p>
              <p className="mt-1 text-[13px] text-muted">
                الرسائل المرسلة من {displayName} ستظهر هنا.
              </p>
              <Button className="mt-4" onClick={() => setTab('send')}>
                إرسال رسالة
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-[16px] bg-slate-50">
                <table className="w-full min-w-[640px] text-start text-[15px]">
                  <thead>
                    <tr className="text-[13px] text-muted">
                      <th className="px-4 py-3 font-medium">الهاتف</th>
                      <th className="px-4 py-3 font-medium">النوع</th>
                      <th className="px-4 py-3 font-medium">الحالة</th>
                      <th className="px-4 py-3 font-medium">المعاينة</th>
                      <th className="px-4 py-3 font-medium">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id} className="border-t border-white last:border-0 hover:bg-white/60">
                        <td className="px-4 py-3 font-mono text-[13px]" dir="ltr">
                          {row.phoneNumber}
                        </td>
                        <td className="px-4 py-3">{messageTypeLabel(row.messageType)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[13px] font-medium ${
                              row.status === 'sent'
                                ? 'bg-emerald-50 text-emerald-700'
                                : row.status === 'failed'
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {messageStatusLabel(row.status)}
                          </span>
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-muted">
                          {row.mediaFileName ?? row.messageText}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-muted">
                          {row.createdAt ? formatDateTime(row.createdAt) : '—'}
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
      )}

      {tab === 'history' && !accountId && (
        <Alert variant="info" title="اختر حساباً">
          حدّد حساب واتساب من تبويب الإرسال، أو{' '}
          <Link to="/accounts" className="font-semibold text-primary-700 underline">
            أضف واحداً أولاً
          </Link>
          .
        </Alert>
      )}
    </div>
  )
}
