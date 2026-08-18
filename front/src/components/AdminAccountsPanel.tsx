import {
  Eraser,
  Pause,
  QrCode,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import { Pagination, DEFAULT_PAGE_SIZE } from './ui/Pagination'
import { useConfirm } from '../context/ConfirmContext'
import { api, ApiClientError } from '../lib/api'
import { paginateMeta, slicePage } from '../lib/pagination'
import { parseQrApiResponse } from '../lib/qr'
import { ACCOUNT_STATUS_STYLES, accountStatusLabel } from '../lib/accountDisplay'
import type { AdminWaAccount } from '../types/models'

function statusLabel(acc: AdminWaAccount): { text: string; className: string } {
  const meta = accountStatusLabel({
    ...acc,
    liveState: acc.liveState ?? undefined,
  })
  return { text: meta.label, className: ACCOUNT_STATUS_STYLES[meta.tone] }
}

export function AdminAccountsPanel() {
  const confirmDialog = useConfirm()
  const [accounts, setAccounts] = useState<AdminWaAccount[]>([])
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [qrModal, setQrModal] = useState<{
    account: AdminWaAccount
    imageSrc: string | null
    error: string | null
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setAccounts(await api.listAllAccountsAdmin())
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'تعذّر تحميل الحسابات',
      )
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [filter, pageSize])

  const filtered = accounts.filter((a) => {
    const q = filter.trim().toLowerCase()
    if (!q) return true
    return (
      a.accountId.toLowerCase().includes(q) ||
      String(a.userId).includes(q) ||
      (a.ownerUsername ?? '').toLowerCase().includes(q)
    )
  })

  const { totalPages } = paginateMeta(filtered.length, pageSize, (page - 1) * pageSize)
  const paged = slicePage(filtered, page, pageSize)

  async function runAction(
    key: string,
    fn: () => Promise<unknown>,
    okMessage: string,
  ) {
    setActionKey(key)
    setError(null)
    setSuccess(null)
    try {
      await fn()
      setSuccess(okMessage)
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'فشل الإجراء')
    } finally {
      setActionKey(null)
    }
  }

  async function handleClearAllStuck() {
    const ok = await confirmDialog({
      title: 'مسح كل الجلسات العالقة',
      message:
        'إيقاف ومسح كل جلسات واتساب غير الجاهزة على الخادم (لكل المستخدمين)؟ الحسابات الجاهزة لن تُمس.',
      confirmLabel: 'مسح العالقة',
      variant: 'danger',
    })
    if (!ok) return
    await runAction(
      'clear-all-stuck',
      () => api.adminClearStuckSessions(),
      'تم مسح الجلسات العالقة',
    )
  }

  async function handleDisconnect(acc: AdminWaAccount) {
    const ok = await confirmDialog({
      title: 'إيقاف الجلسة',
      message: `إيقاف واتساب للحساب "${acc.accountId}" (المستخدم ${acc.ownerUsername ?? acc.userId})؟ الحساب يبقى في قاعدة البيانات.`,
      confirmLabel: 'إيقاف',
      variant: 'danger',
    })
    if (!ok) return
    await runAction(
      `dc-${acc.userId}-${acc.accountId}`,
      () => api.adminDisconnectAccount(acc.userId, acc.accountId),
      `أُوقفت الجلسة لـ ${acc.accountId}`,
    )
  }

  async function handleReset(acc: AdminWaAccount) {
    const ok = await confirmDialog({
      title: 'إعادة تعيين الجلسة',
      message: `مسح ملفات الجلسة لـ "${acc.accountId}" وتجهيز رمز QR جديد؟`,
      confirmLabel: 'إعادة تعيين',
      variant: 'danger',
    })
    if (!ok) return
    await runAction(
      `rs-${acc.userId}-${acc.accountId}`,
      () => api.adminResetSession(acc.userId, acc.accountId),
      `أُعيد تعيين جلسة ${acc.accountId}`,
    )
  }

  async function handleDelete(acc: AdminWaAccount) {
    const ok = await confirmDialog({
      title: 'حذف الحساب',
      message: `حذف "${acc.accountId}" نهائياً للمستخدم ${acc.ownerUsername ?? acc.userId}؟`,
      confirmLabel: 'حذف',
      variant: 'danger',
    })
    if (!ok) return
    await runAction(
      `del-${acc.userId}-${acc.accountId}`,
      () => api.adminDeleteAccount(acc.userId, acc.accountId),
      `حُذف ${acc.accountId}`,
    )
  }

  async function handleQr(acc: AdminWaAccount, regenerate: boolean) {
    const key = `qr-${acc.userId}-${acc.accountId}`
    setActionKey(key)
    setError(null)
    try {
      const data = await api.adminGetQr(acc.userId, acc.accountId, regenerate)
      const parsed = await parseQrApiResponse(data as Record<string, unknown>)
      setQrModal({
        account: acc,
        imageSrc: parsed.imageSrc,
        error: parsed.error,
      })
      if (parsed.ok) await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر جلب رمز QR')
    } finally {
      setActionKey(null)
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

      <Card
        title="كل حسابات واتساب"
        description="إدارة جلسات كل المستخدمين من مكان واحد"
      >
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Input
              label="تصفية"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="الحساب، رقم المستخدم، اسم المستخدم…"
            />
          </div>
          <Button variant="secondary" loading={loading} onClick={load}>
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
          <Button
            variant="danger"
            loading={actionKey === 'clear-all-stuck'}
            onClick={handleClearAllStuck}
          >
            <Eraser className="h-4 w-4" />
            مسح الجلسات العالقة
          </Button>
        </div>

        {loading && accounts.length === 0 ? (
          <div className="space-y-2">
            <div className="skeleton h-12 rounded-[14px]" />
            <div className="skeleton h-12 rounded-[14px]" />
            <div className="skeleton h-12 rounded-[14px]" />
          </div>
        ) : filtered.length === 0 ? (
          <Alert variant="info" title="لا توجد حسابات">
            لا توجد حسابات واتساب تطابق التصفية.
          </Alert>
        ) : (
          <>
            <div className="overflow-x-auto rounded-[16px] bg-slate-50">
              <table className="w-full min-w-[900px] text-start text-[15px]">
                <thead>
                  <tr className="text-[13px] text-muted">
                    <th className="px-4 py-3 font-medium">المستخدم</th>
                    <th className="px-4 py-3 font-medium">الحساب</th>
                    <th className="px-4 py-3 font-medium">الحالة</th>
                    <th className="px-4 py-3 font-medium">الذاكرة</th>
                    <th className="px-4 py-3 font-medium">الحالة الحية</th>
                    <th className="px-4 py-3 text-end font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((acc) => {
                  const st = statusLabel(acc)
                  const base = `${acc.userId}-${acc.accountId}`
                  return (
                    <tr
                      key={base}
                      className="border-t border-white hover:bg-white/70"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-text">
                          {acc.ownerUsername ?? '—'}
                        </p>
                        <p className="text-[13px] text-muted">المعرّف {acc.userId}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px]" dir="ltr">
                        {acc.accountId}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[13px] font-medium ${st.className}`}
                        >
                          {st.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-muted">
                        {acc.inMemory ? 'محمّل' : '—'}
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-3 text-[13px] text-muted" dir="ltr">
                        {acc.liveState ?? acc.initError ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            variant="ghost"
                            loading={actionKey === `qr-${base}`}
                            onClick={() => handleQr(acc, false)}
                            title="جلب رمز QR"
                          >
                            <QrCode className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            loading={actionKey === `rs-${base}`}
                            onClick={() => handleReset(acc)}
                            title="إعادة تعيين الجلسة"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            loading={actionKey === `dc-${base}`}
                            onClick={() => handleDisconnect(acc)}
                            title="إيقاف الجلسة"
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="danger"
                            loading={actionKey === `del-${base}`}
                            onClick={() => handleDelete(acc)}
                            title="حذف"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={filtered.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
          </>
        )}
      </Card>

      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-w-md rounded-[16px] bg-white p-6 shadow-[0px_8px_24px_rgba(15,23,42,0.16)]">
            <h3 className="mb-1 text-lg font-semibold">رمز QR — {qrModal.account.accountId}</h3>
            <p className="mb-4 text-[15px] text-muted">
              المستخدم: {qrModal.account.ownerUsername ?? qrModal.account.userId}
            </p>
            {qrModal.imageSrc ? (
              <div className="mb-4 flex justify-center rounded-[16px] bg-slate-50 p-4">
                <img
                  src={qrModal.imageSrc}
                  alt="رمز QR لواتساب"
                  className="h-56 w-56 object-contain"
                />
              </div>
            ) : (
              <Alert variant="error" title="رمز QR غير متاح" className="mb-4">
                {qrModal.error ?? 'لا يوجد رمز في الاستجابة'}
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                loading={actionKey === `qr-${qrModal.account.userId}-${qrModal.account.accountId}`}
                onClick={() => handleQr(qrModal.account, true)}
              >
                QR جديد (إعادة تعيين)
              </Button>
              <Button variant="ghost" onClick={() => setQrModal(null)}>
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
