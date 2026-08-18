import {
  CheckCircle2,
  Eraser,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
  Unplug,
  UserPlus,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountPicker } from '../components/AccountPicker'
import { JsonBlock } from '../components/JsonBlock'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { CopyRow } from '../components/ui/CopyRow'
import { Input } from '../components/ui/Input'
import { PageHeader } from '../components/ui/PageHeader'
import { useConfirm } from '../context/ConfirmContext'
import { useAccounts } from '../context/AccountContext'
import { api, ApiClientError } from '../lib/api'
import { formatAccountLabel } from '../lib/accountDisplay'
import { isAccountReady } from '../lib/accountStatus'
import { parseQrApiResponse } from '../lib/qr'
import { getApiUrl } from '../lib/storage'

export function AccountsPage() {
  const confirmDialog = useConfirm()
  const {
    selectedAccountId,
    selectedAccount,
    selectAccount,
    refreshAccounts,
    selectedLiveStatus,
    liveStatusPolling,
    liveStatusError,
    refreshSelectedLiveStatus,
  } = useAccounts()

  const [createdCreds, setCreatedCreds] = useState<{
    accountId: string
    token: string | null
  } | null>(null)
  const [newNote, setNewNote] = useState('')
  const [accountNote, setAccountNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [qrData, setQrData] = useState<unknown>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [watchConnection, setWatchConnection] = useState(false)
  const [showTechnical, setShowTechnical] = useState(false)
  const [canAddAccount, setCanAddAccount] = useState(true)
  const [needsPayment, setNeedsPayment] = useState(false)
  const [adminBypass, setAdminBypass] = useState(false)

  const linkStatus = selectedLiveStatus
  const statusPolling = liveStatusPolling
  const statusError = liveStatusError
  const refreshLinkStatus = refreshSelectedLiveStatus

  const accountReady = isAccountReady(linkStatus?.raw)
  const isLinked = accountReady || linkStatus?.state === 'connected'
  const displayName = selectedAccount
    ? formatAccountLabel(selectedAccount.accountId, selectedAccount.note)
    : selectedAccountId
      ? formatAccountLabel(selectedAccountId)
      : ''

  useEffect(() => {
    setAccountNote(selectedAccount?.note || '')
  }, [selectedAccountId, selectedAccount?.note])

  useEffect(() => {
    setQrData(null)
    setQrImage(null)
    setWatchConnection(false)
  }, [selectedAccountId])

  useEffect(() => {
    let cancelled = false
    api
      .billingEligibility()
      .then((data) => {
        if (cancelled) return
        setCanAddAccount(data.canAddAccount)
        setNeedsPayment(data.needsPayment)
        setAdminBypass(data.adminBypass)
      })
      .catch(() => {
        if (!cancelled) {
          setCanAddAccount(true)
          setNeedsPayment(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [success])

  useEffect(() => {
    if (window.location.hash !== '#add-account') return
    document.getElementById('add-account')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => {
      document.getElementById('add-account-btn')?.focus()
    }, 300)
  }, [])

  async function applyQrResponse(data: unknown) {
    setQrData(data)
    setQrImage(null)
    if (!data || typeof data !== 'object') return
    const parsed = await parseQrApiResponse(data as Record<string, unknown>)
    if (parsed.ok) {
      setQrImage(parsed.imageSrc)
      setError(null)
    } else if (parsed.error) {
      setError(parsed.error)
    }
  }

  async function fetchQrForAccount(regenerate = false) {
    if (!selectedAccountId) return
    setWatchConnection(true)
    const action = regenerate ? 'reset' : 'qr'
    await run(action, () => api.getQr(selectedAccountId, regenerate), applyQrResponse)
  }

  async function addAccount() {
    await run(
      'add',
      () => api.addAccount({ note: newNote.trim() || undefined }),
      async (data) => {
      const payload = (data ?? {}) as {
        accountId?: string
        token?: string | null
      }
      const id = String(payload.accountId || '').trim()
      if (!id) {
        setError('أُنشئ الحساب لكن المعرّف لم يُرجع')
        return
      }
      selectAccount(id)
      setCreatedCreds({
        accountId: id,
        token: payload.token ? String(payload.token) : null,
      })
      setNewNote('')
      await refreshAccounts()
      try {
        const elig = await api.billingEligibility()
        setCanAddAccount(elig.canAddAccount)
        setNeedsPayment(elig.needsPayment)
        setAdminBypass(elig.adminBypass)
      } catch {
        /* keep previous eligibility */
      }
      setWatchConnection(true)
      try {
        const qr = await api.getQr(id, false)
        await applyQrResponse(qr)
      } catch (err) {
        setError(
          err instanceof ApiClientError ? err.message : 'تعذّر جلب رمز QR',
        )
      }
    })
  }

  async function disconnectSelectedAccount() {
    if (!selectedAccountId) return
    const ok = await confirmDialog({
      title: 'فصل واتساب',
      message: `فصل «${displayName}» عن الخادم؟ الحساب يبقى في قائمتك ويمكن ربطه لاحقاً بمسح QR.`,
      confirmLabel: 'فصل',
      variant: 'danger',
    })
    if (!ok) return
    const id = selectedAccountId
    await run('disconnect', () => api.disconnectAccount(id), async () => {
      setSuccess(`فُصل «${displayName}»`)
      setQrData(null)
      setQrImage(null)
      setWatchConnection(false)
      await refreshAccounts()
      await refreshLinkStatus()
    })
  }

  async function clearStuckSessions() {
    const ok = await confirmDialog({
      title: 'مسح الجلسات العالقة',
      message:
        'إيقاف وإزالة جلسات واتساب المعلقة (QR، الربط، غير المتصلة) التي ليست جاهزة للإرسال؟ الحسابات الجاهزة لن تتأثر. يمكن الربط لاحقاً بمسح QR.',
      confirmLabel: 'مسح العالقة',
      variant: 'danger',
    })
    if (!ok) return
    await run('clear-stuck', () => api.clearStuckSessions(), async (data) => {
      const result = data as { clearedCount?: number; message?: string }
      setSuccess(
        result.message ??
          (result.clearedCount
            ? `تم مسح ${result.clearedCount} جلسة عالقة.`
            : 'لا توجد جلسات عالقة.'),
      )
      setQrData(null)
      setQrImage(null)
      setWatchConnection(false)
      await refreshAccounts()
      await refreshLinkStatus()
    })
  }

  async function deleteSelectedAccount() {
    if (!selectedAccountId) return
    const ok = await confirmDialog({
      title: 'حذف الحساب',
      message: `حذف «${displayName}» من الخادم؟ ستحتاج إلى ربطه من جديد برمز QR.`,
      confirmLabel: 'حذف',
      variant: 'danger',
    })
    if (!ok) return
    const id = selectedAccountId
    await run(`delete-${id}`, () => api.deleteAccount(id), async () => {
      setSuccess(`حُذف «${displayName}»`)
      setQrData(null)
      setQrImage(null)
      await refreshAccounts()
    })
  }

  async function run(
    action: string,
    fn: () => Promise<unknown>,
    onSuccess?: (data: unknown) => void | Promise<void>,
  ) {
    setLoading(action)
    setError(null)
    setSuccess(null)
    try {
      const data = await fn()
      await onSuccess?.(data)
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'حدث خطأ غير متوقع',
      )
    } finally {
      setLoading(null)
    }
  }

  const statusLabel = accountReady
    ? 'جاهز للإرسال'
    : watchConnection && !linkStatus
      ? 'جارٍ التحقق من الاتصال…'
      : linkStatus?.label ?? 'غير مرتبط'

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="حسابات واتساب"
        description="أضف أرقامك، اربطها بمسح QR، وبدّل بينها في أي وقت."
      />

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

      <Card title="حساباتك">
        <AccountPicker
          showStatus={false}
          onAddAccount={() => {
            document.getElementById('add-account')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            window.setTimeout(() => {
            document.getElementById('add-account-btn')?.focus()
            }, 300)
          }}
        />
        <div className="mt-4 flex flex-wrap items-center gap-3 pt-4">
          <p className="min-w-[200px] flex-1 text-[13px] text-muted">
            إذا ظهرت حالة خاطئة أو علقت الإرسال/التحقق، امسح الجلسات العالقة على الخادم. الحسابات الجاهزة تبقى متصلة.
          </p>
          <Button
            variant="secondary"
            loading={loading === 'clear-stuck'}
            onClick={clearStuckSessions}
          >
            <Eraser className="h-4 w-4" />
            مسح الجلسات العالقة
          </Button>
        </div>
      </Card>

      <Card id="add-account" className="scroll-mt-24">
        <div className="grid items-start gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-primary-50 text-primary-700">
                <UserPlus className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-text">إضافة رقم واتساب</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  يُنشأ معرّف عشوائي وتوكن ثابت مرتبط به، ثم تربطه بمسح QR من هاتفك.
                </p>
              </div>
            </div>

            {needsPayment && !adminBypass && (
              <Alert variant="warning" title="اشتراك مطلوب">
                ادفع خطة شهرية أو سنوية أولاً. كل دفعة تفعّل حساب واتساب واحد.{' '}
                <Link to="/billing" className="font-semibold text-primary-700 underline">
                  اذهب للدفع
                </Link>
              </Alert>
            )}
            {canAddAccount && !adminBypass && (
              <Alert variant="info" title="ترخيص جاهز">
                لديك اشتراك مدفوع غير مرتبط. أضف الحساب الآن لربطه.
              </Alert>
            )}

            <div className="max-w-[700px]">
              <Input
                label="ملاحظة (اختياري)"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="مثال: حساب شركة الأفق"
                maxLength={160}
              />
            </div>

            <Button
              id="add-account-btn"
              loading={loading === 'add'}
              disabled={needsPayment && !adminBypass}
              onClick={addAccount}
            >
              <UserPlus className="h-4 w-4" />
              إضافة الحساب
            </Button>

            {createdCreds && (
              <Alert
                variant="info"
                title="بيانات الإرسال محفوظة ويمكن نسخها لاحقاً من الإعدادات"
                onDismiss={() => setCreatedCreds(null)}
              >
                <div className="mt-3 space-y-2">
                  <CopyRow label="عنوان الخادم" value={getApiUrl()} />
                  <CopyRow label="instance_id" value={createdCreds.accountId} />
                  {createdCreds.token ? (
                    <CopyRow label="token" value={createdCreds.token} />
                  ) : (
                    <p className="text-[13px] text-muted">
                      أُنشئ الحساب دون توكن. يمكنك إنشاء مفتاح من الإعدادات.
                    </p>
                  )}
                </div>
              </Alert>
            )}
          </div>

          <div className="rounded-[16px] bg-slate-50 p-5 lg:col-span-5">
            <p className="mb-4 text-[15px] font-semibold text-text">كيف يعمل؟</p>
            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-bold text-primary-700 shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
                  1
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-text">أضف الحساب</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">
                    يُولَّد معرّف فريد وتوكن للإرسال البرمجي.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-bold text-primary-700 shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
                  2
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-text">انسخ التوكن</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">
                    يظهر مع instance_id وعنوان الخادم، ويبقى ثابتاً في الإعدادات.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-bold text-primary-700 shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
                  3
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-text">امسح رمز QR</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">
                    من واتساب: الأجهزة المرتبطة ← ربط جهاز.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </Card>

      {selectedAccountId && (
        <Card title={`ربط ${displayName}`}>
          <div
            className={`mb-6 flex items-start gap-4 rounded-[16px] px-4 py-4 ${
              accountReady
                ? 'bg-emerald-50'
                : isLinked
                  ? 'bg-amber-50'
                  : 'bg-red-50'
            }`}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white">
              {accountReady ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : isLinked ? (
                <RefreshCw className="h-5 w-5 text-warning" />
              ) : (
                <WifiOff className="h-5 w-5 text-danger" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-text">{statusLabel}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {accountReady
                  ? 'الحساب متصل ويمكن الإرسال منه الآن.'
                  : isLinked
                    ? 'واتساب مرتبط وما زال يبدأ. انتظر قليلاً أو حدّث الحالة.'
                    : 'افتح واتساب على الهاتف ثم الأجهزة المرتبطة ثم ربط جهاز، وامسح الرمز الظاهر هنا.'}
              </p>
              {statusError && !accountReady && (
                <p className="mt-2 text-[13px] text-danger">{statusError}</p>
              )}
            </div>
          </div>

          <div className="mb-6 max-w-[700px]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Input
                  label="ملاحظة"
                  value={accountNote}
                  onChange={(e) => setAccountNote(e.target.value)}
                  placeholder="مثال: حساب شركة الأفق"
                  maxLength={160}
                />
              </div>
              <Button
                variant="secondary"
                loading={savingNote}
                onClick={async () => {
                  if (!selectedAccountId) return
                  setSavingNote(true)
                  try {
                    await api.updateAccountNote(selectedAccountId, accountNote.trim())
                    await refreshAccounts()
                    setSuccess('حُفظت الملاحظة')
                  } catch (err) {
                    setError(
                      err instanceof ApiClientError ? err.message : 'تعذّر حفظ الملاحظة',
                    )
                  } finally {
                    setSavingNote(false)
                  }
                }}
              >
                حفظ الملاحظة
              </Button>
            </div>
          </div>

          {accountReady ? (
            <div className="flex flex-wrap gap-2">
              <Link to="/messages">
                <Button>
                  <Smartphone className="h-4 w-4" />
                  إرسال رسالة
                </Button>
              </Link>
              <Button
                variant="secondary"
                loading={loading === 'disconnect'}
                onClick={disconnectSelectedAccount}
              >
                <Unplug className="h-4 w-4" />
                فصل الحساب
              </Button>
              <Button
                variant="danger"
                loading={loading === `delete-${selectedAccountId}`}
                onClick={deleteSelectedAccount}
              >
                <Trash2 className="h-4 w-4" />
                حذف الحساب
              </Button>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="space-y-6 lg:col-span-6">
                <ol className="space-y-4">
                  <li className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[13px] font-bold text-primary-700">
                      1
                    </span>
                    <p className="pt-1 text-[15px] text-muted">اضغط «إظهار رمز QR» إذا لم يظهر الرمز.</p>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[13px] font-bold text-primary-700">
                      2
                    </span>
                    <p className="pt-1 text-[15px] text-muted">
                      من الهاتف: واتساب ← الأجهزة المرتبطة ← ربط جهاز.
                    </p>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[13px] font-bold text-primary-700">
                      3
                    </span>
                    <p className="pt-1 text-[15px] text-muted">امسح الرمز وانتظر حتى تظهر «جاهز للإرسال».</p>
                  </li>
                </ol>

                <div className="space-y-3">
                  <Button
                    className="w-full"
                    loading={loading === 'qr'}
                    onClick={() => fetchQrForAccount(false)}
                  >
                    <QrCode className="h-4 w-4" />
                    إظهار رمز QR
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      className="w-full"
                      loading={loading === 'reset'}
                      onClick={() => fetchQrForAccount(true)}
                    >
                      <RefreshCw className="h-4 w-4" />
                      توليد جديد
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full"
                      disabled={watchConnection}
                      onClick={() => setWatchConnection(true)}
                    >
                      <Wifi className="h-4 w-4" />
                      {watchConnection ? 'جارٍ الفحص…' : 'فحص الاتصال'}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[16px] bg-slate-50 p-6">
                  {qrImage ? (
                    <>
                      <img
                        src={qrImage}
                        alt="رمز QR لواتساب"
                        className="h-56 w-56 rounded-[14px] bg-white object-contain p-3 shadow-[0px_1px_3px_rgba(15,23,42,0.08)]"
                      />
                      <p className="mt-4 text-center text-[13px] text-muted">
                        {statusPolling ? 'بانتظار المسح…' : 'امسح الرمز من هاتفك'}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex h-16 w-16 items-center justify-center rounded-[16px] bg-white text-muted shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
                        <QrCode className="h-8 w-8" />
                      </div>
                      <p className="mt-4 text-center text-[15px] font-medium text-text">
                        الرمز سيظهر هنا
                      </p>
                      <p className="mt-1 text-center text-[13px] text-muted">
                        اضغط إظهار رمز QR للبدء
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {!accountReady && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              {isLinked ? (
                <Button
                  variant="secondary"
                  loading={loading === 'disconnect'}
                  onClick={disconnectSelectedAccount}
                >
                  <Unplug className="h-4 w-4" />
                  فصل الحساب
                </Button>
              ) : (
                <span />
              )}
              <Button
                variant="danger"
                loading={loading === `delete-${selectedAccountId}`}
                onClick={deleteSelectedAccount}
              >
                <Trash2 className="h-4 w-4" />
                حذف الحساب
              </Button>
            </div>
          )}

          {(linkStatus || qrData !== null) && (
            <details
              className="mt-6"
              open={showTechnical}
              onToggle={(e) => setShowTechnical((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer text-[13px] font-medium text-muted hover:text-text">
                تفاصيل تقنية للمطورين
              </summary>
              <div className="mt-3 space-y-2">
                {linkStatus && <JsonBlock data={linkStatus.raw} />}
                {qrData !== null && !accountReady && <JsonBlock data={qrData} />}
              </div>
            </details>
          )}
        </Card>
      )}
    </div>
  )
}
