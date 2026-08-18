import {
  CheckCircle2,
  FileText,
  Megaphone,
  MessageSquare,
  QrCode,
  RefreshCw,
  Smartphone,
  Users,
} from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { KpiCard, PageHeader } from '../components/ui/PageHeader'
import { useAccounts } from '../context/AccountContext'
import { ApiClientError } from '../lib/api'
import {
  ACCOUNT_STATUS_STYLES,
  accountStatusLabel,
  formatAccountLabel,
  liveStatusDisplayMeta,
  notReadySendHint,
} from '../lib/accountDisplay'
import { isAccountReady, type ParsedAccountStatus } from '../lib/accountStatus'
import type { WaAccount } from '../types/models'

function StatusPill({
  label,
  tone,
}: {
  label: string
  tone: keyof typeof ACCOUNT_STATUS_STYLES
}) {
  const dot =
    tone === 'ready'
      ? 'bg-success'
      : tone === 'connecting'
        ? 'bg-warning'
        : tone === 'offline'
          ? 'bg-danger'
          : 'bg-slate-400'
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium ${ACCOUNT_STATUS_STYLES[tone]}`}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  )
}

function metaForOverviewAccount(
  acc: WaAccount,
  selectedId: string,
  live: ParsedAccountStatus | null,
) {
  if (acc.accountId === selectedId) {
    return liveStatusDisplayMeta(live, acc)
  }
  return accountStatusLabel(acc)
}

function ShortcutCard({
  to,
  icon,
  title,
  hint,
}: {
  to: string
  icon: ReactNode
  title: string
  hint: string
}) {
  return (
    <Link
      to={to}
      className="flex min-h-[104px] items-center gap-4 rounded-[16px] bg-white p-5 shadow-[0px_1px_3px_rgba(15,23,42,0.08)] transition-colors hover:bg-primary-50"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-primary-50 text-primary-700">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-text">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{hint}</p>
      </div>
    </Link>
  )
}

export function OverviewPage() {
  const {
    accounts,
    selectedAccountId,
    selectedAccount,
    selectedLiveStatus,
    refreshSelectedLiveStatus,
    selectAccount,
    loading: accountsLoading,
  } = useAccounts()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accountReady = isAccountReady(selectedLiveStatus?.raw)
  const displayName = selectedAccount
    ? formatAccountLabel(selectedAccount.accountId, selectedAccount.note)
    : selectedAccountId
      ? formatAccountLabel(selectedAccountId)
      : ''

  const readyCount = useMemo(
    () =>
      accounts.filter((acc) => acc.status === 'ready').length,
    [accounts],
  )
  const needsLinkCount = Math.max(0, accounts.length - readyCount)

  const refreshStatus = useCallback(async () => {
    if (!selectedAccountId) return
    setLoading(true)
    setError(null)
    try {
      await refreshSelectedLiveStatus()
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'تعذّر تحديث الحالة',
      )
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId, refreshSelectedLiveStatus])

  const headerDescription = !accounts.length
    ? 'أضف أول رقم واتساب ثم اربطه بمسح QR للبدء.'
    : accountReady
      ? `${displayName} جاهز للإرسال. انتقل إلى الرسائل أو الحملات.`
      : notReadySendHint(selectedLiveStatus?.state).action === 'wait'
        ? `${displayName} ${notReadySendHint(selectedLiveStatus?.state).line}`
        : `اربط ${displayName} بمسح رمز QR حتى يصبح جاهزاً للإرسال.`

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader title="نظرة عامة" description={headerDescription} />

      {error && (
        <Alert variant="error" title="خطأ" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-6">
        <KpiCard label="إجمالي الحسابات" value={String(accounts.length)} />
        <KpiCard
          label="جاهزة للإرسال"
          value={String(readyCount)}
          tone={readyCount > 0 ? 'success' : 'warning'}
        />
        <KpiCard
          label="تحتاج ربط"
          value={String(needsLinkCount)}
          tone={needsLinkCount > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Card
          title="الحساب النشط"
          description="اختر رقماً واحداً للإرسال والحملات"
          className="lg:col-span-7"
          action={
            selectedAccountId ? (
              <Button
                variant="ghost"
                loading={loading}
                onClick={refreshStatus}
                aria-label="تحديث الحالة"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            ) : undefined
          }
        >
          {accountsLoading && accounts.length === 0 ? (
            <div className="space-y-3">
              <div className="skeleton h-[72px] w-full rounded-[16px]" />
              <div className="skeleton h-[72px] w-full rounded-[16px]" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-start gap-4 rounded-[16px] bg-slate-50 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-white text-muted shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
                <Smartphone className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-text">لا توجد حسابات بعد</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  أضف أول رقم ثم امسحه من هاتفك لربطه.
                </p>
              </div>
              <Link to="/accounts#add-account">
                <Button>
                  <Smartphone className="h-4 w-4" />
                  إضافة حساب
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <ul className="space-y-2">
                {accounts.map((acc) => {
                  const active = acc.accountId === selectedAccountId
                  const meta = metaForOverviewAccount(
                    acc,
                    selectedAccountId,
                    selectedLiveStatus,
                  )
                  return (
                    <li key={acc.accountId}>
                      <button
                        type="button"
                        onClick={() => selectAccount(acc.accountId)}
                        className={`flex min-h-[72px] w-full items-center gap-3 rounded-[16px] p-4 text-start transition-colors ${
                          active
                            ? 'bg-primary-50 ring-2 ring-primary-500'
                            : 'bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${
                            active ? 'bg-primary-500 text-white' : 'bg-white text-muted'
                          }`}
                        >
                          <Smartphone className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="truncate text-[15px] font-semibold text-text">
                            {formatAccountLabel(acc.accountId, acc.note)}
                          </p>
                          <StatusPill label={meta.label} tone={meta.tone} />
                        </div>
                        {active ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-primary-700" />
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Link to="/accounts">
                  <Button variant="secondary" className="w-full sm:w-auto">
                    إدارة الحسابات
                  </Button>
                </Link>
                {accountReady ? (
                  <Link to="/messages">
                    <Button className="w-full sm:w-auto">
                      <MessageSquare className="h-4 w-4" />
                      إرسال رسالة
                    </Button>
                  </Link>
                ) : (
                  <Link to="/accounts">
                    <Button className="w-full sm:w-auto">
                      <QrCode className="h-4 w-4" />
                      ربط بمسح QR
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </Card>

        {accounts.length === 0 || !accountReady ? (
          <Card
            title="الخطوات التالية"
            description="أكمل الربط ثم ابدأ الإرسال"
            className="lg:col-span-5"
          >
            <ol className="space-y-5">
              {[
                {
                  done: accounts.length > 0,
                  title: 'أضف حساباً',
                  hint: 'يُولَّد المعرّف والتوكن تلقائياً بدون تكرار.',
                },
                {
                  done: accountReady,
                  title: 'اربط بمسح QR',
                  hint: 'من واتساب: الأجهزة المرتبطة ← ربط جهاز.',
                },
                {
                  done: false,
                  title: 'أرسل أول رسالة',
                  hint: 'بعد الجاهزية استخدم الرسائل أو الحملات.',
                },
              ].map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                      step.done
                        ? 'bg-emerald-50 text-success'
                        : 'bg-primary-50 text-primary-700'
                    }`}
                  >
                    {step.done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold text-text">{step.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.hint}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        ) : (
          <Card
            title="جاهز للعمل"
            description={`${displayName} متصل`}
            className="lg:col-span-5"
          >
            <div className="flex h-full flex-col justify-between gap-6">
              <p className="text-[15px] leading-relaxed text-muted">
                يمكنك الإرسال فوراً، أو تشغيل حملة على مجموعة جهات اتصال، أو إدارة القوالب.
              </p>
              <Link to="/campaigns">
                <Button variant="secondary" className="w-full">
                  <Megaphone className="h-4 w-4" />
                  بدء حملة
                </Button>
              </Link>
            </div>
          </Card>
        )}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-text">اختصارات</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          <ShortcutCard
            to="/messages"
            icon={<MessageSquare className="h-5 w-5" />}
            title="الرسائل"
            hint="تحقق من رقم أو أرسل نصاً وملفاً"
          />
          <ShortcutCard
            to="/campaigns"
            icon={<Megaphone className="h-5 w-5" />}
            title="الحملات"
            hint="رسالة واحدة إلى مجموعة كاملة"
          />
          <ShortcutCard
            to="/contacts"
            icon={<Users className="h-5 w-5" />}
            title="جهات الاتصال"
            hint="أنشئ مجموعات واستورد الأرقام"
          />
          <ShortcutCard
            to="/templates"
            icon={<FileText className="h-5 w-5" />}
            title="القوالب"
            hint="نصوص جاهزة مع متغيرات"
          />
        </div>
      </div>
    </div>
  )
}
