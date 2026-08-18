import { CreditCard, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { api, ApiClientError } from '../lib/api'
import { formatDate, formatIqd } from '../lib/format'
import type {
  AccountLicense,
  BillingPlan,
  PaymentGatewayId,
  PaymentMethod,
} from '../types/billing'

function cycleLabel(cycle: string) {
  return cycle === 'yearly' ? 'سنوي' : 'شهري'
}

function licenseStatusLabel(status: string) {
  if (status === 'active') return 'فعّال'
  if (status === 'expired') return 'منتهٍ'
  return 'ملغى'
}

export function BillingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [licenses, setLicenses] = useState<AccountLicense[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [gateway, setGateway] = useState<PaymentGatewayId | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextPlans, nextMethods, nextLicenses] = await Promise.all([
        api.billingPlans(),
        api.billingMethods(),
        api.billingLicenses(),
      ])
      setPlans(nextPlans)
      setMethods(nextMethods)
      setLicenses(nextLicenses)
      setSelectedPlanId((current) => current ?? nextPlans[0]?.id ?? null)
      setGateway((current) => current ?? nextMethods[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر تحميل خطط الاشتراك')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const orderId = Number(searchParams.get('orderId') || 0)
    const returning = searchParams.get('waylReturn') || searchParams.get('fynexpayReturn')
    if (!returning || !orderId) return

    let cancelled = false
    ;(async () => {
      try {
        const result = await api.reconcileOrder(orderId)
        if (cancelled) return
        if (result.paid) {
          setSuccess('تم تأكيد الدفع. يمكنك الآن إضافة حساب واتساب.')
          await load()
        } else if (searchParams.get('failed') === '1') {
          setError('لم يكتمل الدفع. يمكنك المحاولة مرة أخرى.')
        } else {
          setError('لم يُؤكَّد الدفع بعد. إن دفعت للتو انتظر لحظات ثم حدّث الصفحة.')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'تعذّر التحقق من الدفع')
        }
      } finally {
        if (!cancelled) {
          const next = new URLSearchParams(searchParams)
          next.delete('waylReturn')
          next.delete('fynexpayReturn')
          next.delete('failed')
          next.delete('orderId')
          next.delete('referenceId')
          setSearchParams(next, { replace: true })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load, searchParams, setSearchParams])

  const unusedCount = useMemo(
    () => licenses.filter((l) => l.status === 'active' && !l.accountId).length,
    [licenses],
  )

  async function pay() {
    if (!selectedPlanId || !gateway) {
      setError('اختر خطة وبوابة دفع')
      return
    }
    setPaying(true)
    setError(null)
    try {
      const result = await api.checkout({ planId: selectedPlanId, gateway })
      window.location.href = result.paymentUrl
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر إنشاء رابط الدفع')
      setPaying(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="الاشتراك والدفع"
        description="كل دفعة تفعّل حساب واتساب واحد. بعد تأكيد الدفع يمكنك إضافته مباشرة."
      />

      {error && (
        <Alert variant="error" title="تعذّر إتمام العملية" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" title="تم الدفع" onDismiss={() => setSuccess(null)}>
          {success}{' '}
          <Link to="/accounts#add-account" className="font-semibold text-primary-700 underline">
            إضافة حساب الآن
          </Link>
        </Alert>
      )}

      {unusedCount > 0 && (
        <Alert variant="info" title="اشتراك جاهز للاستخدام">
          لديك {unusedCount} ترخيص مدفوع غير مرتبط بحساب.{' '}
          <Link to="/accounts#add-account" className="font-semibold text-primary-700 underline">
            أضف حساب واتساب
          </Link>
        </Alert>
      )}

      <Card title="اختر الخطة">
        {loading ? (
          <p className="text-[15px] text-muted">جاري التحميل…</p>
        ) : plans.length === 0 ? (
          <p className="text-[15px] text-muted">لا توجد خطط نشطة حالياً. تواصل مع الإدارة.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => {
              const selected = selectedPlanId === plan.id
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`rounded-[16px] border p-5 text-start transition-colors ${
                    selected
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-border bg-white hover:bg-slate-50'
                  }`}
                >
                  <p className="text-[13px] font-semibold text-primary-700">
                    {cycleLabel(plan.billingCycle)}
                  </p>
                  <p className="mt-2 text-lg font-bold text-text">{plan.name}</p>
                  <p className="mt-1 text-2xl font-semibold text-text">{formatIqd(plan.priceIqd)}</p>
                  {plan.description && (
                    <p className="mt-2 text-[13px] leading-relaxed text-muted">{plan.description}</p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </Card>

      <Card title="بوابة الدفع">
        {methods.length === 0 ? (
          <p className="text-[15px] text-muted">
            لم تُفعَّل بوابات الدفع بعد. الأدمن يضبط Wayl أو FynexPay من لوحة الإدارة.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {methods.map((method) => {
              const selected = gateway === method.id
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setGateway(method.id)}
                  className={`min-h-11 rounded-[14px] border px-4 py-2.5 text-[15px] font-semibold ${
                    selected
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-border bg-white text-text hover:bg-slate-50'
                  }`}
                >
                  {method.name}
                </button>
              )
            })}
          </div>
        )}

        <div className="mt-6">
          <Button loading={paying} disabled={!selectedPlanId || !gateway} onClick={pay}>
            <CreditCard className="h-4 w-4" />
            ادفع وفعّل حساباً
          </Button>
        </div>
      </Card>

      <Card title="اشتراكاتك">
        {licenses.length === 0 ? (
          <p className="text-[15px] text-muted">لا توجد اشتراكات بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-start text-[15px]">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="px-3 py-3 font-semibold">الخطة</th>
                  <th className="px-3 py-3 font-semibold">الحالة</th>
                  <th className="px-3 py-3 font-semibold">الحساب</th>
                  <th className="px-3 py-3 font-semibold">ينتهي</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((license) => (
                  <tr key={license.id} className="border-b border-slate-100">
                    <td className="px-3 py-3">
                      {license.planName || 'ترخيص حساب'}
                      {license.billingCycle ? ` · ${cycleLabel(license.billingCycle)}` : ''}
                    </td>
                    <td className="px-3 py-3">{licenseStatusLabel(license.status)}</td>
                    <td className="px-3 py-3">
                      {license.accountId ? (
                        <span className="inline-flex items-center gap-1">
                          <Smartphone className="h-4 w-4" />
                          {license.accountId}
                        </span>
                      ) : (
                        <span className="text-primary-700">جاهز للإضافة</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {license.expiresAt ? formatDate(license.expiresAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
