import { FileSpreadsheet, Megaphone, Plus, Trash2, Upload, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { ListToolbar } from '../components/ui/ListToolbar'
import { KpiCard, PageHeader } from '../components/ui/PageHeader'
import { Pagination, DEFAULT_PAGE_SIZE } from '../components/ui/Pagination'
import { useConfirm } from '../context/ConfirmContext'
import { api, ApiClientError } from '../lib/api'
import { formatPhoneCount, parsePhonesFromFile, parsePhonesFromText } from '../lib/parsePhones'
import type { ContactGroup, ContactGroupNumber } from '../types/contacts'

type ImportMode = 'manual' | 'file'
type DetailTab = 'import' | 'numbers'

export function ContactsPage() {
  const confirmDialog = useConfirm()
  const [groups, setGroups] = useState<ContactGroup[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [numbers, setNumbers] = useState<ContactGroupNumber[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [importMode, setImportMode] = useState<ImportMode>('manual')
  const [manualText, setManualText] = useState('')
  const [importPreview, setImportPreview] = useState<string[]>([])
  const [replaceOnImport, setReplaceOnImport] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('import')

  const [groupSearch, setGroupSearch] = useState('')
  const [groupsPage, setGroupsPage] = useState(1)
  const [groupsPageSize, setGroupsPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [groupsTotal, setGroupsTotal] = useState(0)
  const [groupsTotalPages, setGroupsTotalPages] = useState(1)

  const [numberSearch, setNumberSearch] = useState('')
  const [numbersPage, setNumbersPage] = useState(1)
  const [numbersPageSize, setNumbersPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [numbersTotal, setNumbersTotal] = useState(0)
  const [numbersTotalPages, setNumbersTotalPages] = useState(1)

  const selectedGroup = groups.find((g) => g.id === selectedId) ?? null

  const loadGroups = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const page = await api.listContactGroups({
        search: groupSearch.trim() || undefined,
        limit: groupsPageSize,
        offset: (groupsPage - 1) * groupsPageSize,
      })
      setGroups(page.items)
      setGroupsTotal(page.total)
      setGroupsTotalPages(page.totalPages)
      if (page.items.length && !page.items.some((g) => g.id === selectedId)) {
        setSelectedId(page.items[0].id)
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر تحميل المجموعات')
    } finally {
      setLoading(false)
    }
  }, [groupSearch, groupsPage, groupsPageSize, selectedId])

  const loadNumbers = useCallback(async (groupId: number) => {
    try {
      const data = await api.getContactGroup(groupId, {
        search: numberSearch.trim() || undefined,
        limit: numbersPageSize,
        offset: (numbersPage - 1) * numbersPageSize,
      })
      setNumbers(data?.numbers ?? [])
      setNumbersTotal(data?.total ?? 0)
      setNumbersTotalPages(data?.totalPages ?? 1)
    } catch {
      setNumbers([])
      setNumbersTotal(0)
      setNumbersTotalPages(1)
    }
  }, [numberSearch, numbersPage, numbersPageSize])

  useEffect(() => {
    setGroupsPage(1)
  }, [groupSearch, groupsPageSize])

  useEffect(() => {
    setNumbersPage(1)
  }, [selectedId, numberSearch, numbersPageSize])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  useEffect(() => {
    if (selectedId) loadNumbers(selectedId)
    else {
      setNumbers([])
      setNumbersTotal(0)
    }
  }, [selectedId, loadNumbers])

  function selectGroup(id: number, preferImport = false) {
    setSelectedId(id)
    const group = groups.find((g) => g.id === id)
    setDetailTab(preferImport || !group?.numberCount ? 'import' : 'numbers')
  }

  async function createGroup() {
    if (!newName.trim()) {
      setError('أدخل اسم المجموعة')
      return
    }
    setActionLoading('create')
    setError(null)
    try {
      const data = await api.createContactGroup({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      })
      const row = data as Record<string, unknown>
      const nested = row.group as Record<string, unknown> | undefined
      const createdId = Number(nested?.id ?? row.id ?? row.groupId)
      setNewName('')
      setNewDescription('')
      setSuccess('أُنشئت المجموعة — أضف إليها أرقاماً الآن')
      if (Number.isFinite(createdId) && createdId > 0) {
        setSelectedId(createdId)
        setDetailTab('import')
      }
      await loadGroups()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر إنشاء المجموعة')
    } finally {
      setActionLoading(null)
    }
  }

  async function removeGroup(group: ContactGroup) {
    const ok = await confirmDialog({
      title: 'حذف المجموعة',
      message: `حذف «${group.name}» وكل ${formatPhoneCount(group.numberCount)}؟`,
      confirmLabel: 'حذف',
      variant: 'danger',
    })
    if (!ok) return
    setActionLoading(`del-g-${group.id}`)
    try {
      await api.deleteContactGroup(group.id)
      if (selectedId === group.id) setSelectedId(null)
      setSuccess('حُذفت المجموعة')
      await loadGroups()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر الحذف')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleFileSelect(file: File | null) {
    if (!file) return
    setActionLoading('parse')
    try {
      const parsed = await parsePhonesFromFile(file)
      setImportPreview(parsed)
      setManualText(parsed.join('\n'))
      setSuccess(`وُجد ${formatPhoneCount(parsed.length)} في الملف`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر قراءة الملف')
      setImportPreview([])
    } finally {
      setActionLoading(null)
    }
  }

  function previewManual() {
    const parsed = parsePhonesFromText(manualText)
    setImportPreview(parsed)
    if (!parsed.length) setError('لم يُعثر على أرقام صالحة')
  }

  async function importNumbers() {
    if (!selectedId) return
    const list =
      importPreview.length > 0 ? importPreview : parsePhonesFromText(manualText)
    if (!list.length) {
      setError('لا توجد أرقام صالحة للاستيراد')
      return
    }
    setActionLoading('import')
    setError(null)
    try {
      const res = await api.importContactNumbers(selectedId, list, replaceOnImport)
      const added = Number((res as Record<string, unknown>).added ?? list.length)
      setSuccess(
        replaceOnImport
          ? `استُبدل بـ ${formatPhoneCount(list.length)}`
          : `أُضيف ${added} رقماً جديداً (${formatPhoneCount(list.length)} في الاستيراد)`,
      )
      setManualText('')
      setImportPreview([])
      setDetailTab('numbers')
      await loadGroups()
      await loadNumbers(selectedId)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'فشل الاستيراد')
    } finally {
      setActionLoading(null)
    }
  }

  async function removeNumber(num: ContactGroupNumber) {
    if (!selectedId) return
    setActionLoading(`del-n-${num.id}`)
    try {
      await api.deleteContactNumber(selectedId, num.id)
      await loadNumbers(selectedId)
      await loadGroups()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر الحذف')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="جهات الاتصال"
        description="أنشئ مجموعة، أضف الأرقام، ثم استخدمها في الحملات."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6">
        <KpiCard label="المجموعات" value={String(groupsTotal)} />
        <KpiCard
          label="أرقام المجموعة المحددة"
          value={selectedGroup ? String(selectedGroup.numberCount) : '—'}
          hint={selectedGroup ? selectedGroup.name : 'اختر مجموعة من القائمة'}
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

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Card title="مجموعاتك" description="اختر مجموعة للعمل عليها" className="lg:col-span-4">
          <div className="mb-6 space-y-3 rounded-[16px] bg-slate-50 p-4">
            <p className="text-[15px] font-semibold text-text">مجموعة جديدة</p>
            <Input
              label="اسم المجموعة"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="عملاء بغداد"
              onKeyDown={(e) => {
                if (e.key === 'Enter') createGroup()
              }}
            />
            <Input
              label="وصف (اختياري)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="قائمة للحملات الأسبوعية"
            />
            <Button
              className="w-full"
              loading={actionLoading === 'create'}
              onClick={createGroup}
            >
              <Plus className="h-4 w-4" />
              إنشاء المجموعة
            </Button>
          </div>

          <ListToolbar
            search={groupSearch}
            onSearchChange={setGroupSearch}
            searchPlaceholder="ابحث باسم المجموعة…"
            className="mb-3"
          />

          {loading && groups.length === 0 ? (
            <div className="space-y-2">
              <div className="skeleton h-[72px] rounded-[16px]" />
              <div className="skeleton h-[72px] rounded-[16px]" />
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-[16px] bg-slate-50 px-4 py-8 text-center">
              <Users className="mx-auto h-8 w-8 text-muted" />
              <p className="mt-3 text-[15px] font-medium text-text">لا مجموعات بعد</p>
              <p className="mt-1 text-[13px] text-muted">أنشئ أول مجموعة من النموذج أعلاه.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {groups.map((g) => {
                const active = selectedId === g.id
                return (
                  <li key={g.id}>
                    <div
                      className={`flex min-h-[72px] items-center gap-2 rounded-[16px] p-2 transition-colors ${
                        active ? 'bg-primary-50 ring-2 ring-primary-500' : 'bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 p-2 text-start"
                        onClick={() => selectGroup(g.id)}
                      >
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${
                            active ? 'bg-primary-500 text-white' : 'bg-white text-muted'
                          }`}
                        >
                          <Users className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-text">{g.name}</p>
                          <p className="mt-0.5 text-[13px] text-muted">
                            {formatPhoneCount(g.numberCount)}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-muted hover:bg-red-50 hover:text-danger"
                        onClick={() => removeGroup(g)}
                        disabled={actionLoading === `del-g-${g.id}`}
                        aria-label={`حذف ${g.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <Pagination
            page={groupsPage}
            totalPages={groupsTotalPages}
            total={groupsTotal}
            pageSize={groupsPageSize}
            onPageChange={setGroupsPage}
            onPageSizeChange={(size) => {
              setGroupsPageSize(size)
              setGroupsPage(1)
            }}
            pageSizeOptions={[10, 20, 50]}
          />
        </Card>

        {selectedGroup ? (
          <div className="space-y-6 lg:col-span-8">
            <Card
              title={selectedGroup.name}
              description={
                selectedGroup.description?.trim() ||
                `${formatPhoneCount(selectedGroup.numberCount)} في هذه المجموعة`
              }
              action={
                selectedGroup.numberCount > 0 ? (
                  <Link to="/campaigns">
                    <Button variant="secondary">
                      <Megaphone className="h-4 w-4" />
                      استخدام في حملة
                    </Button>
                  </Link>
                ) : undefined
              }
            >
              <div className="flex gap-1 rounded-[16px] bg-slate-50 p-1">
                {(
                  [
                    { id: 'import' as const, label: 'إضافة أرقام' },
                    { id: 'numbers' as const, label: `الأرقام (${selectedGroup.numberCount})` },
                  ]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDetailTab(tab.id)}
                    className={`min-h-11 flex-1 rounded-[14px] px-4 text-[15px] font-semibold transition-colors ${
                      detailTab === tab.id
                        ? 'bg-white text-primary-700 shadow-[0px_1px_3px_rgba(15,23,42,0.08)]'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {detailTab === 'import' ? (
                <div className="mt-6 space-y-4">
                  <p className="text-[13px] leading-relaxed text-muted">
                    الصق الأرقام أو ارفع ملف Excel/CSV. يُقبل رمز الدولة بدون +.
                  </p>

                  <div className="flex gap-1 rounded-[16px] bg-slate-50 p-1">
                    {([
                      { id: 'manual' as const, label: 'لصق الأرقام' },
                      { id: 'file' as const, label: 'ملف Excel / CSV' },
                    ]).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setImportMode(mode.id)}
                        className={`min-h-11 flex-1 rounded-[14px] px-4 text-[15px] font-semibold transition-colors ${
                          importMode === mode.id
                            ? 'bg-white text-primary-700 shadow-[0px_1px_3px_rgba(15,23,42,0.08)]'
                            : 'text-muted hover:text-text'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  {importMode === 'manual' ? (
                    <div className="space-y-3">
                      <Textarea
                        label="أرقام الهواتف"
                        value={manualText}
                        onChange={(e) => setManualText(e.target.value)}
                        rows={6}
                        placeholder={'9647807110011\n9647xxxxxxxx'}
                        hint="رقم في كل سطر، أو مفصولة بفواصل"
                      />
                      <Button variant="secondary" onClick={previewManual}>
                        معاينة العدد
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="block space-y-2">
                        <span className="block text-[15px] font-medium text-text">
                          ارفع ملفاً
                        </span>
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv,.txt"
                          onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                          className="block w-full text-[15px] text-muted file:me-3 file:rounded-[14px] file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-[15px] file:font-medium file:text-primary-700"
                        />
                      </label>
                      <p className="text-[13px] text-muted">
                        تُفحص كل الأعمدة — أي خلية برقم صالح تُستورد.
                      </p>
                    </div>
                  )}

                  {importPreview.length > 0 && (
                    <div className="rounded-[16px] bg-emerald-50 px-4 py-3 text-[15px] font-medium text-emerald-800">
                      جاهز للاستيراد: {formatPhoneCount(importPreview.length)}
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-[15px] text-muted">
                    <input
                      type="checkbox"
                      checked={replaceOnImport}
                      onChange={(e) => setReplaceOnImport(e.target.checked)}
                      className="rounded border-border"
                    />
                    استبدال الأرقام الحالية بدل الإضافة إليها
                  </label>

                  <Button
                    className="w-full sm:w-auto"
                    loading={actionLoading === 'import' || actionLoading === 'parse'}
                    onClick={importNumbers}
                  >
                    <Upload className="h-4 w-4" />
                    استيراد الأرقام
                  </Button>
                </div>
              ) : numbersTotal === 0 ? (
                <div className="mt-6 rounded-[16px] bg-slate-50 px-4 py-10 text-center">
                  <FileSpreadsheet className="mx-auto h-8 w-8 text-muted" />
                  <p className="mt-3 text-[15px] font-medium text-text">لا أرقام في هذه المجموعة</p>
                  <p className="mt-1 text-[13px] text-muted">انتقل إلى «إضافة أرقام» للصق قائمة أو رفع ملف.</p>
                  <Button className="mt-4" onClick={() => setDetailTab('import')}>
                    إضافة أرقام
                  </Button>
                </div>
              ) : (
                <div className="mt-6">
                  <ListToolbar
                    search={numberSearch}
                    onSearchChange={setNumberSearch}
                    searchPlaceholder="ابحث برقم الهاتف…"
                  />
                  <div className="overflow-x-auto rounded-[16px] bg-slate-50">
                    <table className="w-full text-start text-[15px]">
                      <thead>
                        <tr className="text-[13px] text-muted">
                          <th className="px-4 py-3 font-medium">الهاتف</th>
                          <th className="px-4 py-3 font-medium">إزالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {numbers.map((n) => (
                          <tr key={n.id} className="border-t border-white">
                            <td className="px-4 py-3 font-mono text-[13px]" dir="ltr">
                              {n.phoneNumber}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                className="flex h-11 w-11 items-center justify-center rounded-[14px] text-muted hover:bg-red-50 hover:text-danger"
                                disabled={actionLoading === `del-n-${n.id}`}
                                onClick={() => removeNumber(n)}
                                aria-label={`حذف ${n.phoneNumber}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={numbersPage}
                    totalPages={numbersTotalPages}
                    total={numbersTotal}
                    pageSize={numbersPageSize}
                    onPageChange={setNumbersPage}
                    onPageSizeChange={(size) => {
                      setNumbersPageSize(size)
                      setNumbersPage(1)
                    }}
                    pageSizeOptions={[20, 50, 100]}
                  />
                </div>
              )}
            </Card>
          </div>
        ) : (
          <Card title="ابدأ من هنا" className="lg:col-span-8">
            <div className="flex flex-col items-start gap-4 rounded-[16px] bg-slate-50 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-white text-muted shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-text">لا توجد مجموعة محددة</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  أنشئ مجموعة من العمود الجانبي، ثم أضف الأرقام لاستخدامها في الحملات.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
