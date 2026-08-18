import { Copy, FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { KpiCard, PageHeader } from '../components/ui/PageHeader'
import { Pagination, DEFAULT_PAGE_SIZE } from '../components/ui/Pagination'
import { Textarea } from '../components/ui/Textarea'
import { useConfirm } from '../context/ConfirmContext'
import { api, ApiClientError } from '../lib/api'
import type { MessageTemplate } from '../types/features'

const VARIABLE_CHIPS = [
  { token: '{{name}}', label: 'الاسم' },
  { token: '{{OTP_CODE}}', label: 'رمز OTP' },
  { token: '{{EXPIRE_MINUTES}}', label: 'دقائق الصلاحية' },
  { token: '{{phone}}', label: 'الهاتف' },
  { token: '{{date}}', label: 'التاريخ' },
] as const

const PREVIEW_SAMPLES: Record<string, string> = {
  name: 'أحمد',
  OTP_CODE: '482913',
  EXPIRE_MINUTES: '5',
  phone: '07807110011',
  date: '18/08/2026',
}

function extractVariables(text: string): string[] {
  const found = text.match(/\{\{?[A-Za-z0-9_]+\}?\}/g) ?? []
  return [...new Set(found)]
}

function previewBody(text: string): string {
  if (!text.trim()) return 'سيظهر نص الرسالة هنا بعد الكتابة.'
  return text.replace(/\{\{?([A-Za-z0-9_]+)\}?\}/g, (_, key: string) => {
    return PREVIEW_SAMPLES[key] ?? `[${key}]`
  })
}

export function TemplatesPage() {
  const confirmDialog = useConfirm()
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const variables = useMemo(() => extractVariables(body), [body])
  const preview = useMemo(() => previewBody(body), [body])
  const isEditing = editingId != null

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.listTemplates({
        search: search.trim() || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      })
      setTemplates(r.items)
      setTotal(r.total)
      setTotalPages(r.totalPages)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر تحميل القوالب')
    } finally {
      setLoading(false)
    }
  }, [search, page, pageSize])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  function startCreate() {
    setEditingId(null)
    setName('')
    setBody('')
    setError(null)
  }

  function startEdit(template: MessageTemplate) {
    setEditingId(template.id)
    setName(template.name)
    setBody(template.body)
    setError(null)
    setSuccess(null)
  }

  function insertToken(token: string) {
    const el = bodyRef.current
    if (!el) {
      setBody((prev) => `${prev}${prev ? ' ' : ''}${token}`)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    const next = body.slice(0, start) + token + body.slice(end)
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }

  async function save() {
    if (!name.trim() || !body.trim()) {
      setError('الاسم ونص الرسالة مطلوبان')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      if (isEditing) {
        await api.updateTemplate(editingId, { name: name.trim(), body })
        setSuccess('تم تحديث القالب')
      } else {
        const created = await api.createTemplate({ name: name.trim(), body })
        const id = Number((created as { template?: { id?: number } }).template?.id)
        if (id) setEditingId(id)
        setSuccess('أُنشئ القالب')
      }
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر حفظ القالب')
    } finally {
      setSaving(false)
    }
  }

  async function duplicate(template: MessageTemplate) {
    setSaving(true)
    setError(null)
    try {
      await api.createTemplate({
        name: `${template.name} (نسخة)`,
        body: template.body,
      })
      setSuccess('أُنشئت نسخة من القالب')
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر النسخ')
    } finally {
      setSaving(false)
    }
  }

  async function copyBody(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setSuccess('نُسخ النص إلى الحافظة')
    } catch {
      setError('تعذّر النسخ')
    }
  }

  async function remove(template: MessageTemplate) {
    const ok = await confirmDialog({
      title: 'حذف القالب',
      message: `حذف «${template.name}»؟ لن يظهر في الحملات بعد الآن.`,
      confirmLabel: 'حذف',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await api.deleteTemplate(template.id)
      if (editingId === template.id) startCreate()
      setSuccess('حُذف القالب')
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر الحذف')
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="قوالب الرسائل"
        description="أنشئ نصوصاً جاهزة، أدرج المتغيرات بنقرة، وعاين الرسالة قبل استخدامها في الحملات."
        action={
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4" />
            قالب جديد
          </Button>
        }
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="إجمالي القوالب" value={String(total)} />
        <KpiCard
          label="المتغيرات في المحرر"
          value={String(variables.length)}
          hint={variables.length ? variables.join(' · ') : 'لا يوجد بعد'}
        />
        <KpiCard label="طول النص" value={String(body.length)} hint="حرفاً" />
      </div>

      {error && (
        <Alert variant="error" title="خطأ" className="mb-6" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" title="تم" className="mb-6" onDismiss={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <Card
          title="قوالبك"
          description="اختر قالباً لتعديله أو أنشئ واحداً جديداً"
          className="lg:col-span-5"
        >
          <Input
            label="بحث"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="اسم القالب أو جزء من النص…"
          />

          <div className="mt-4 space-y-2">
            {loading ? (
              <>
                <div className="skeleton h-20 rounded-[16px]" />
                <div className="skeleton h-20 rounded-[16px]" />
                <div className="skeleton h-20 rounded-[16px]" />
              </>
            ) : templates.length === 0 ? (
              <div className="rounded-[16px] bg-slate-50 px-4 py-10 text-center">
                <FileText className="mx-auto h-8 w-8 text-muted" />
                <p className="mt-3 text-[15px] font-semibold text-text">لا توجد قوالب بعد</p>
                <p className="mt-1 text-[13px] text-muted">
                  ابدأ بقالب ترحيب أو رمز تحقق ثم أعد استخدامه في الحملات.
                </p>
              </div>
            ) : (
              templates.map((t) => {
                const active = t.id === editingId
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => startEdit(t)}
                    className={`w-full rounded-[16px] p-4 text-start transition-colors ${
                      active
                        ? 'bg-primary-50 ring-2 ring-primary-500'
                        : 'bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-text">{t.name}</p>
                        <p className="mt-1 line-clamp-2 text-[13px] text-muted">{t.body}</p>
                      </div>
                      <span className="mt-0.5 shrink-0 text-muted">
                        <Pencil className="h-4 w-4" />
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>

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

        <div className="space-y-6 lg:col-span-7">
          <Card
            title={isEditing ? 'تعديل القالب' : 'قالب جديد'}
            description="أدرج متغيراً من الأزرار أدناه ليُستبدل عند الإرسال"
          >
            <div className="max-w-[700px] space-y-4">
              <Input
                label="اسم القالب"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ترحيب، رمز تحقق، تذكير موعد…"
              />

              <div>
                <p className="mb-2 text-[15px] font-medium text-text">المتغيرات</p>
                <div className="flex flex-wrap gap-2">
                  {VARIABLE_CHIPS.map((chip) => (
                    <button
                      key={chip.token}
                      type="button"
                      onClick={() => insertToken(chip.token)}
                      className="min-h-11 rounded-[14px] bg-primary-50 px-3 text-[13px] font-semibold text-primary-700 hover:bg-primary-100"
                    >
                      {chip.label}
                      <span className="ms-2 font-mono font-normal text-muted" dir="ltr">
                        {chip.token}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <Textarea
                ref={bodyRef}
                label="نص الرسالة"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={7}
                placeholder="مرحباً {{name}}، رمزك هو {{OTP_CODE}} وصالح لمدة {{EXPIRE_MINUTES}} دقيقة."
              />

              <div className="flex flex-wrap justify-end gap-2">
                {isEditing && (
                  <Button variant="secondary" onClick={startCreate}>
                    إلغاء التعديل
                  </Button>
                )}
                <Button loading={saving} onClick={save}>
                  {isEditing ? 'حفظ التعديلات' : 'إنشاء القالب'}
                </Button>
              </div>
            </div>
          </Card>

          <Card title="معاينة حية" description="كيف ستبدو الرسالة بعد استبدال المتغيرات">
            <div className="rounded-[16px] bg-slate-50 p-6">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-text">{preview}</p>
            </div>
            {variables.length > 0 && (
              <p className="mt-3 text-[13px] text-muted">
                المتغيرات المستخدمة: {variables.join(' · ')}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => copyBody(body)} disabled={!body.trim()}>
                <Copy className="h-4 w-4" />
                نسخ النص
              </Button>
              {isEditing && (
                <>
                  <Button
                    variant="secondary"
                    loading={saving}
                    onClick={() => {
                      const current = templates.find((t) => t.id === editingId)
                      if (current) void duplicate(current)
                    }}
                  >
                    نسخ القالب
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      const current = templates.find((t) => t.id === editingId)
                      if (current) void remove(current)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف
                  </Button>
                </>
              )}
              <Link to="/campaigns" className="ms-auto">
                <Button variant="ghost">استخدام في حملة</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
