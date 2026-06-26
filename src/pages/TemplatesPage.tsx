import { FileText, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { ListToolbar } from '../components/ui/ListToolbar'
import { Pagination, DEFAULT_PAGE_SIZE } from '../components/ui/Pagination'
import { Textarea } from '../components/ui/Textarea'
import { api, ApiClientError } from '../lib/api'
import type { MessageTemplate } from '../types/features'

export function TemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

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
      setError(err instanceof ApiClientError ? err.message : 'Failed to load')
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

  async function create() {
    if (!name.trim() || !body.trim()) {
      setError('Name and body are required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.createTemplate({ name: name.trim(), body })
      setName('')
      setBody('')
      setSuccess('Template created')
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number) {
    try {
      await api.deleteTemplate(id)
      setSuccess('Template deleted')
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Delete failed')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Message templates</h1>
        <p className="mt-1 text-sm text-muted">
          Reusable messages with variables like {'{{OTP_CODE}}'} or {'{name}'}
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

      <Card title="New template" action={<Plus className="h-4 w-4 text-muted" />}>
        <div className="space-y-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Welcome offer" />
          <Textarea
            label="Body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Hello {{OTP_CODE}} — valid {{EXPIRE_MINUTES}} min"
          />
          <Button loading={saving} onClick={create}>
            Save template
          </Button>
        </div>
      </Card>

      <Card title="Saved templates" action={<FileText className="h-4 w-4 text-muted" />}>
        <ListToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search templates…" />
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted">No templates yet.</p>
        ) : (
          <>
            <div className="space-y-3">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border border-border bg-panel/40 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{t.name}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{t.body}</p>
                    </div>
                    <Button variant="danger" onClick={() => remove(t.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
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
          </>
        )}
      </Card>
    </div>
  )
}
