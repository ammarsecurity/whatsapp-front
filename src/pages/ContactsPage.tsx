import { FileSpreadsheet, Plus, Trash2, Upload, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { ListToolbar } from '../components/ui/ListToolbar'
import { Pagination, DEFAULT_PAGE_SIZE } from '../components/ui/Pagination'
import { useConfirm } from '../context/ConfirmContext'
import { api, ApiClientError } from '../lib/api'
import { formatPhoneCount, parsePhonesFromFile, parsePhonesFromText } from '../lib/parsePhones'
import type { ContactGroup, ContactGroupNumber } from '../types/contacts'

type ImportMode = 'manual' | 'file'

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
      setError(err instanceof ApiClientError ? err.message : 'Failed to load groups')
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

  async function createGroup() {
    if (!newName.trim()) {
      setError('Enter a group name')
      return
    }
    setActionLoading('create')
    setError(null)
    try {
      await api.createContactGroup({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      })
      setNewName('')
      setNewDescription('')
      setSuccess('Group created')
      await loadGroups()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create group')
    } finally {
      setActionLoading(null)
    }
  }

  async function removeGroup(group: ContactGroup) {
    const ok = await confirmDialog({
      title: 'Delete group',
      message: `Delete "${group.name}" and all ${group.numberCount} numbers?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setActionLoading(`del-g-${group.id}`)
    try {
      await api.deleteContactGroup(group.id)
      if (selectedId === group.id) setSelectedId(null)
      setSuccess('Group deleted')
      await loadGroups()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Delete failed')
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
      setSuccess(`Found ${formatPhoneCount(parsed.length)} in file`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read file')
      setImportPreview([])
    } finally {
      setActionLoading(null)
    }
  }

  function previewManual() {
    const parsed = parsePhonesFromText(manualText)
    setImportPreview(parsed)
  }

  async function importNumbers() {
    if (!selectedId) return
    const list =
      importPreview.length > 0 ? importPreview : parsePhonesFromText(manualText)
    if (!list.length) {
      setError('No valid numbers to import')
      return
    }
    setActionLoading('import')
    setError(null)
    try {
      const res = await api.importContactNumbers(selectedId, list, replaceOnImport)
      const added = Number((res as Record<string, unknown>).added ?? list.length)
      setSuccess(
        replaceOnImport
          ? `Replaced with ${formatPhoneCount(list.length)}`
          : `Added ${added} new numbers (${formatPhoneCount(list.length)} in import)`,
      )
      setManualText('')
      setImportPreview([])
      await loadGroups()
      await loadNumbers(selectedId)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Import failed')
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
      setError(err instanceof ApiClientError ? err.message : 'Delete failed')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Contact groups</h1>
        <p className="mt-1 text-sm text-muted">
          Save lists of phone numbers — import from Excel or paste manually, then use them in campaigns
        </p>
      </header>

      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" title="Done" onDismiss={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Card
        title="New group"
        description="e.g. Customers, VIP, Baghdad region"
        action={<Plus className="h-4 w-4 text-muted" />}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Group name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="My customers"
          />
          <Input
            label="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Notes about this list"
          />
        </div>
        <Button className="mt-4" loading={actionLoading === 'create'} onClick={createGroup}>
          Create group
        </Button>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Your groups" className="lg:col-span-1">
          <ListToolbar
            search={groupSearch}
            onSearchChange={setGroupSearch}
            searchPlaceholder="Filter groups…"
            className="mb-2"
          />
          {loading && groups.length === 0 ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted">No groups yet — create one above.</p>
          ) : (
            <ul className="space-y-2">
              {groups.map((g) => (
                <li key={g.id}>
                  <div
                    className={`flex items-center gap-2 rounded-lg border p-3 transition-colors ${
                      selectedId === g.id
                        ? 'border-wa-green/50 bg-wa-green/10'
                        : 'border-border hover:border-wa-green/30'
                    }`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setSelectedId(g.id)}
                    >
                      <p className="truncate font-medium text-text">{g.name}</p>
                      <p className="text-xs text-muted">
                        {formatPhoneCount(g.numberCount)}
                      </p>
                    </button>
                    <button
                      type="button"
                      className="rounded-lg p-2 text-muted hover:bg-red-500/10 hover:text-red-400"
                      onClick={() => removeGroup(g)}
                      disabled={actionLoading === `del-g-${g.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
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
          <div className="space-y-4 lg:col-span-2">
            <Card
              title={selectedGroup.name}
              description={`${formatPhoneCount(selectedGroup.numberCount)} total in this group`}
              action={<Users className="h-4 w-4 text-muted" />}
            >
              <div className="mb-4 flex rounded-lg border border-border bg-panel p-1">
                {(['manual', 'file'] as ImportMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setImportMode(mode)}
                    className={`flex-1 rounded-md py-2 text-sm font-medium capitalize ${
                      importMode === mode
                        ? 'bg-card text-text shadow-sm'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    {mode === 'manual' ? 'Paste numbers' : 'Excel / CSV file'}
                  </button>
                ))}
              </div>

              {importMode === 'manual' ? (
                <div className="space-y-3">
                  <Textarea
                    label="Phone numbers"
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    rows={6}
                    placeholder={'9647807110011\n9647xxxxxxxx\n...'}
                    hint="One per line, or comma-separated. Country code without +"
                  />
                  <Button variant="secondary" onClick={previewManual}>
                    Preview count
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-muted">
                      Upload .xlsx, .xls or .csv
                    </span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv,.txt"
                      onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-wa-green/15 file:px-3 file:py-2 file:font-medium file:text-wa-green"
                    />
                  </label>
                  <p className="text-xs text-muted">
                    All columns are scanned — any cell with a valid phone number is imported.
                  </p>
                </div>
              )}

              {importPreview.length > 0 && (
                <p className="mt-2 text-sm text-wa-green">
                  Ready to import: {formatPhoneCount(importPreview.length)}
                </p>
              )}

              <label className="mt-3 flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={replaceOnImport}
                  onChange={(e) => setReplaceOnImport(e.target.checked)}
                  className="rounded border-border"
                />
                Replace existing numbers (instead of adding)
              </label>

              <Button
                className="mt-4"
                loading={actionLoading === 'import' || actionLoading === 'parse'}
                onClick={importNumbers}
              >
                <Upload className="h-4 w-4" />
                Import numbers
              </Button>
            </Card>

            {numbersTotal > 0 && (
              <Card title="Numbers in group">
                <ListToolbar
                  search={numberSearch}
                  onSearchChange={setNumberSearch}
                  searchPlaceholder="Filter phone numbers…"
                />
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-panel text-xs text-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">Phone</th>
                        <th className="px-3 py-2 text-right font-medium">Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {numbers.map((n) => (
                        <tr key={n.id} className="border-t border-border/60">
                          <td className="px-3 py-2 font-mono text-xs">{n.phoneNumber}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="text-muted hover:text-red-400"
                              disabled={actionLoading === `del-n-${n.id}`}
                              onClick={() => removeNumber(n)}
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
              </Card>
            )}
          </div>
        ) : (
          <Card title="Select a group" className="lg:col-span-2">
            <div className="flex flex-col items-center gap-3 py-8 text-center text-muted">
              <FileSpreadsheet className="h-10 w-10 opacity-50" />
              <p className="text-sm">Choose a group from the list to add or import numbers.</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
