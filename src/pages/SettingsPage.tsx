import { BookOpen, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { ApiDocs } from '../components/docs/ApiDocs'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import {
  DEFAULT_API_URL,
  getApiUrl,
  setApiUrl,
} from '../lib/storage'

const PRESETS = [
  { label: 'Primary server', url: 'http://74.50.65.142:8489' },
]

type Tab = 'docs' | 'config'

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('docs')
  const [apiUrl, setApiUrlState] = useState(getApiUrl)
  const [saved, setSaved] = useState(false)

  function save() {
    setApiUrl(apiUrl.trim() || DEFAULT_API_URL)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          API configuration and developer documentation
        </p>
      </header>

      <div className="flex rounded-xl border border-border bg-panel p-1">
        <button
          type="button"
          onClick={() => setTab('docs')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors ${
            tab === 'docs'
              ? 'bg-card text-text shadow-sm'
              : 'text-muted hover:text-text'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          API Documentation
        </button>
        <button
          type="button"
          onClick={() => setTab('config')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors ${
            tab === 'config'
              ? 'bg-card text-text shadow-sm'
              : 'text-muted hover:text-text'
          }`}
        >
          <Settings2 className="h-4 w-4" />
          Configuration
        </button>
      </div>

      {tab === 'config' && (
        <>
          {saved && (
            <Alert
              variant="success"
              title="Saved"
              onDismiss={() => setSaved(false)}
            >
              API URL saved. Documentation examples will use the new base URL.
            </Alert>
          )}

          <Card title="API base URL">
            <div className="space-y-4">
              <Input
                label="Base URL"
                value={apiUrl}
                onChange={(e) => setApiUrlState(e.target.value)}
                placeholder={DEFAULT_API_URL}
                hint="No trailing slash. Used for all console requests and cURL examples in docs."
              />

              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.url}
                    type="button"
                    onClick={() => setApiUrlState(p.url)}
                    className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-wa-green/50 hover:text-text"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <Button onClick={save}>Save settings</Button>
            </div>
          </Card>
        </>
      )}

      {tab === 'docs' && <ApiDocs />}
    </div>
  )
}
