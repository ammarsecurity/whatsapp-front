import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import { useConfirm } from '../context/ConfirmContext'
import { api, ApiClientError } from '../lib/api'
import { formatIqd } from '../lib/format'
import type { BillingPlan } from '../types/billing'

const emptyForm = {
  name: '',
  billingCycle: 'monthly' as 'monthly' | 'yearly',
  priceIqd: '10000',
  description: '',
  isActive: true,
  sortOrder: '0',
}

export function AdminBillingPlansPanel() {
  const confirmDialog = useConfirm()
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPlans(await api.adminBillingPlans())
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر تحميل الخطط')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function startEdit(plan: BillingPlan) {
    setEditingId(plan.id)
    setForm({
      name: plan.name,
      billingCycle: plan.billingCycle,
      priceIqd: String(plan.priceIqd),
      description: plan.description || '',
      isActive: plan.isActive,
      sortOrder: String(plan.sortOrder),
    })
  }

  async function save() {
    if (!form.name.trim()) {
      setError('اسم الخطة مطلوب')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    const body = {
      name: form.name.trim(),
      billingCycle: form.billingCycle,
      priceIqd: parseInt(form.priceIqd, 10) || 0,
      description: form.description.trim(),
      isActive: form.isActive,
      sortOrder: parseInt(form.sortOrder, 10) || 0,
    }
    try {
      if (editingId) {
        await api.updateBillingPlan(editingId, body)
        setSuccess('تم تحديث الخطة')
      } else {
        await api.createBillingPlan(body)
        setSuccess('أُضيفت الخطة')
      }
      setEditingId(null)
      setForm(emptyForm)
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر حفظ الخطة')
    } finally {
      setSaving(false)
    }
  }

  async function remove(plan: BillingPlan) {
    const ok = await confirmDialog({
      title: 'حذف الخطة',
      message: `حذف «${plan.name}»؟`,
      confirmLabel: 'حذف',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await api.deleteBillingPlan(plan.id)
      setSuccess('حُذفت الخطة')
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر حذف الخطة')
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" onDismiss={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Card title={editingId ? 'تعديل الخطة' : 'خطة جديدة'}>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="الاسم"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="حساب واتساب شهري"
          />
          <label className="block space-y-2">
            <span className="block text-[15px] font-medium text-text">الدورة</span>
            <select
              className="min-h-11 w-full rounded-[14px] border border-border bg-white px-4 text-[15px]"
              value={form.billingCycle}
              onChange={(e) =>
                setForm((f) => ({ ...f, billingCycle: e.target.value as 'monthly' | 'yearly' }))
              }
            >
              <option value="monthly">شهري</option>
              <option value="yearly">سنوي</option>
            </select>
          </label>
          <Input
            label="السعر (د.ع)"
            type="number"
            min={0}
            value={form.priceIqd}
            onChange={(e) => setForm((f) => ({ ...f, priceIqd: e.target.value }))}
          />
          <Input
            label="ترتيب العرض"
            type="number"
            value={form.sortOrder}
            onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
          />
          <div className="md:col-span-2">
            <Input
              label="الوصف"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            نشطة في صفحة الدفع
          </label>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button loading={saving} onClick={save}>
            <Plus className="h-4 w-4" />
            {editingId ? 'حفظ التعديل' : 'إضافة الخطة'}
          </Button>
          {editingId && (
            <Button
              variant="secondary"
              onClick={() => {
                setEditingId(null)
                setForm(emptyForm)
              }}
            >
              إلغاء
            </Button>
          )}
        </div>
      </Card>

      <Card title="الخطط">
        {loading ? (
          <p className="text-[15px] text-muted">جاري التحميل…</p>
        ) : plans.length === 0 ? (
          <p className="text-[15px] text-muted">لا توجد خطط بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-start text-[15px]">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="px-3 py-3 font-semibold">الاسم</th>
                  <th className="px-3 py-3 font-semibold">الدورة</th>
                  <th className="px-3 py-3 font-semibold">السعر</th>
                  <th className="px-3 py-3 font-semibold">الحالة</th>
                  <th className="px-3 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id} className="border-b border-slate-100">
                    <td className="px-3 py-3 font-medium">{plan.name}</td>
                    <td className="px-3 py-3">{plan.billingCycle === 'yearly' ? 'سنوي' : 'شهري'}</td>
                    <td className="px-3 py-3">{formatIqd(plan.priceIqd)}</td>
                    <td className="px-3 py-3">{plan.isActive ? 'نشطة' : 'متوقفة'}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => startEdit(plan)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" onClick={() => remove(plan)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
