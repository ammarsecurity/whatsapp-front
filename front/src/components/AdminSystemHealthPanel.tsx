import {
  Activity,
  Cpu,
  HardDrive,
  RefreshCw,
  Server,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { JsonBlock } from './JsonBlock'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { api, ApiClientError } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { formatMb, percentBarColor } from '../lib/formatBytes'
import type { SystemHealthCheck, SystemHealthResponse } from '../types/systemHealth'

const POLL_MS = 15000

const CHECK_LABELS: Record<string, string> = {
  systemReady: 'جسر واتساب جاهز',
  chromeBinary: 'ملف Chrome',
  chromeHeadless: 'تشغيل Chrome بدون واجهة',
  memoryPressure: 'استخدام ذاكرة الخادم',
}

const CHECK_DETAILS: Record<string, { ok: string; fail: string }> = {
  systemReady: {
    ok: 'حساب واحد على الأقل جاهز',
    fail: 'لا يوجد حساب جاهز بعد',
  },
}

function healthCheckLabel(check: SystemHealthCheck) {
  return CHECK_LABELS[check.id] ?? check.label
}

function healthCheckDetail(check: SystemHealthCheck) {
  const mapped = CHECK_DETAILS[check.id]
  if (mapped) return check.ok ? mapped.ok : mapped.fail
  return check.detail
}

function formatStamp(value?: string) {
  if (!value) return '—'
  return formatDateTime(value)
}

function MetricBar({
  label,
  used,
  total,
  percent,
}: {
  label: string
  used: number
  total: number
  percent: number
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="font-medium text-text" dir="ltr">
          {formatMb(used)} / {formatMb(total)} ({percent}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${percentBarColor(percent)}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string | number
  sub?: string
  tone?: 'default' | 'ok' | 'warn' | 'bad'
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-success'
      : tone === 'warn'
        ? 'text-amber-700'
        : tone === 'bad'
          ? 'text-danger'
          : 'text-text'
  return (
    <div className="rounded-[16px] bg-white px-4 py-4 shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${toneClass}`} dir="ltr">
        {value}
      </p>
      {sub && <p className="mt-1 text-[13px] text-muted">{sub}</p>}
    </div>
  )
}

export function AdminSystemHealthPanel() {
  const [data, setData] = useState<SystemHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await api.adminSystemHealth()
      setData(res)
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'تعذّر تحميل حالة النظام',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [autoRefresh, load])

  const overall = data?.overall
  const mem = data?.memory
  const sys = data?.system
  const wa = data?.whatsapp as Record<string, unknown> | undefined
  const chrome = data?.chrome as Record<string, unknown> | undefined

  const chromeOk = chrome?.headlessLaunch === true

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {overall && (
            <span
              className={`rounded-full px-3 py-1 text-[15px] font-semibold ${
                overall.ok
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {overall.ok ? 'سليم' : 'متدهور'}
            </span>
          )}
          {data?.apiBuild && (
            <span className="text-[13px] text-muted">الإصدار {data.apiBuild}</span>
          )}
          {data?.timestamp && (
            <span className="text-[13px] text-muted">{formatStamp(data.timestamp)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex min-h-11 items-center gap-2 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            تحديث تلقائي كل 15 ثانية
          </label>
          <Button variant="secondary" loading={loading} onClick={load}>
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="error" title="خطأ" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {data?.checks && data.checks.some((c) => !c.ok) && (
        <Alert variant="warning" title="مشاكل مكتشفة">
          {data.checks
            .filter((c) => !c.ok)
            .map((c) => healthCheckLabel(c))
            .join(' · ')}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="واتساب المتصل"
          value={String(wa?.connected ?? '—')}
          sub={`من ${wa?.accountsTotal ?? '—'} حساباً`}
          tone={(wa?.connected as number) > 0 ? 'ok' : 'warn'}
        />
        <StatTile
          label="الجلسات في الذاكرة"
          value={String(wa?.inMemory ?? '—')}
          sub={`${wa?.initLocks ?? 0} قفل تهيئة`}
        />
        <StatTile
          label="ذاكرة Chrome"
          value={formatMb(mem?.chromeMb as number | null)}
          sub={
            mem?.chromeProcessCount != null
              ? `${mem.chromeProcessCount} عملية`
              : undefined
          }
          tone={chromeOk ? 'ok' : 'bad'}
        />
        <StatTile
          label="ذاكرة عملية Node"
          value={formatMb(mem?.nodeProcessMb?.rss)}
          sub={`الكومة ${formatMb(mem?.nodeProcessMb?.heapUsed)}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="الذاكرة" description="استخدام رام الخادم">
          <div className="space-y-4">
            {mem?.systemMb && (
              <MetricBar
                label="رام النظام"
                used={mem.systemMb.used}
                total={mem.systemMb.total}
                percent={mem.systemMb.usedPercent}
              />
            )}
            {mem?.nodeProcessMb && mem.systemMb && (
              <MetricBar
                label="Node.js (RSS)"
                used={mem.nodeProcessMb.rss}
                total={mem.systemMb.total}
                percent={Math.round((mem.nodeProcessMb.rss / mem.systemMb.total) * 1000) / 10}
              />
            )}
            {mem?.chromeMb != null && mem.systemMb && (
              <MetricBar
                label="Chrome (كل العمليات)"
                used={mem.chromeMb}
                total={mem.systemMb.total}
                percent={Math.round((mem.chromeMb / mem.systemMb.total) * 1000) / 10}
              />
            )}
            <p className="text-[13px] text-muted">
              تقدير Node + Chrome:{' '}
              <strong className="text-text">
                {formatMb(mem?.estimatedTotalMb)}
              </strong>
            </p>
          </div>
        </Card>

        <Card title="Chrome" description="صحة المتصفح بدون واجهة">
          <ul className="space-y-3 text-[15px]">
            <li className="flex justify-between gap-2">
              <span className="text-muted">الحالة</span>
              <span className={chromeOk ? 'text-success' : 'text-danger'}>
                {chromeOk ? 'سليم' : 'فشل'}
              </span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted">المسار</span>
              <code className="max-w-[220px] truncate text-[13px]" dir="ltr">
                {String(chrome?.executablePath ?? '—')}
              </code>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted">الإصدار</span>
              <span className="text-start text-[13px]" dir="ltr">
                {String(chrome?.version ?? '—')}
              </span>
            </li>
            {!chromeOk && chrome?.launchError != null && (
              <li className="rounded-[14px] bg-red-50 p-3 text-[13px] text-red-700">
                {String(chrome.launchError)}
              </li>
            )}
            {chrome?.ubuntuHint != null && !chromeOk && (
              <li className="text-[13px] text-muted">{String(chrome.ubuntuHint)}</li>
            )}
          </ul>
        </Card>

        <Card title="الخادم" description="العملية ونظام التشغيل">
          <div className="grid gap-3 text-[15px]">
            <div className="flex items-center gap-2 text-muted">
              <Server className="h-4 w-4" />
              <span>
                الجسر:{' '}
                <strong className={sys?.bridgeReady ? 'text-success' : 'text-amber-700'}>
                  {sys?.bridgeReady ? 'جاهز' : 'قيد الإقلاع'}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted">
              <Activity className="h-4 w-4" />
              <span>
                مدة التشغيل: {String(sys?.uptimeHuman ?? '—')} (النظام:{' '}
                {String(sys?.osUptimeHuman ?? '—')})
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted">
              <Cpu className="h-4 w-4" />
              <span>
                {String(sys?.cpuCores ?? '—')} أنوية · الحمل{' '}
                {Array.isArray(sys?.loadAverage)
                  ? (sys.loadAverage as number[]).join(', ')
                  : '—'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted">
              <HardDrive className="h-4 w-4" />
              <span>
                {String(sys?.platform ?? '—')} · Node {String(sys?.nodeVersion ?? '—')}
              </span>
            </div>
          </div>
        </Card>

        <Card title="جلسات واتساب" description="ملخص الاتصال">
          <div className="mb-4 grid grid-cols-2 gap-3 text-[15px]">
            <div className="rounded-[14px] bg-slate-50 px-4 py-3">
              <span className="text-[13px] text-muted">غير متصل</span>
              <p className="font-bold text-text">{String(wa?.offline ?? 0)}</p>
            </div>
            <div className="rounded-[14px] bg-slate-50 px-4 py-3">
              <span className="text-[13px] text-muted">بانتظار QR</span>
              <p className="font-bold text-text">{String(wa?.awaitingQr ?? 0)}</p>
            </div>
            <div className="rounded-[14px] bg-slate-50 px-4 py-3">
              <span className="text-[13px] text-muted">أخطاء</span>
              <p className="font-bold text-danger">{String(wa?.withErrors ?? 0)}</p>
            </div>
            <div className="rounded-[14px] bg-slate-50 px-4 py-3">
              <span className="text-[13px] text-muted">مؤقتات إعادة الربط</span>
              <p className="font-bold text-text">{String(wa?.reconnectTimers ?? 0)}</p>
            </div>
          </div>
          {Array.isArray(wa?.sessions) && (wa.sessions as unknown[]).length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-[16px] bg-slate-50">
              <table className="w-full text-start text-[13px]">
                <thead>
                  <tr className="text-muted">
                    <th className="px-3 py-2 font-medium">الحساب</th>
                    <th className="px-3 py-2 font-medium">الحالة</th>
                    <th className="px-3 py-2 font-medium">مرتبط</th>
                  </tr>
                </thead>
                <tbody>
                  {(wa.sessions as Record<string, unknown>[]).map((s) => (
                    <tr key={String(s.accountKey)} className="border-t border-white">
                      <td className="px-3 py-2 font-mono" dir="ltr">
                        {String(s.userId)}:{String(s.accountId)}
                      </td>
                      <td className="px-3 py-2 text-muted" dir="ltr">
                        {String(s.lastState ?? '—')}
                      </td>
                      <td className="px-3 py-2">
                        {s.isConnected ? (
                          <span className="text-success">نعم</span>
                        ) : (
                          <span className="text-muted">لا</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {data?.checks && (
        <Card title="فحوصات الصحة">
          <ul className="space-y-2">
            {data.checks.map((c) => (
              <li
                key={c.id}
                className="flex items-start gap-3 rounded-[14px] bg-slate-50 px-4 py-3 text-[15px]"
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    c.ok ? 'bg-success' : 'bg-danger'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text">{healthCheckLabel(c)}</p>
                  {healthCheckDetail(c) && (
                    <p className="truncate text-[13px] text-muted" dir="ltr">
                      {healthCheckDetail(c)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <details className="rounded-[16px] bg-white shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
        <summary className="cursor-pointer px-4 py-3 text-[15px] font-medium text-muted hover:text-text">
          JSON الخام — GET /api/admin/system-health
        </summary>
        <div className="p-4">
          <JsonBlock data={data ?? { loading: true }} />
        </div>
      </details>
    </div>
  )
}
