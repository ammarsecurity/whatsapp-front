import { BookOpen, Key, Settings2, ShieldBan, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiDocs } from '../components/docs/ApiDocs'
import { IntegrationsPanel, OptOutPanel } from '../components/IntegrationsPanel'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { useAuth } from '../context/AuthContext'
import { ApiClientError } from '../lib/api'
import {
  DEFAULT_API_URL,
  getApiUrl,
  setApiUrl,
} from '../lib/storage'

const PRESETS = [{ label: 'From .env', url: DEFAULT_API_URL }]

type Tab = 'account' | 'integrations' | 'optout' | 'docs' | 'config'

export function SettingsPage() {
  const { user, updateProfile } = useAuth()
  const [tab, setTab] = useState<Tab>('account')
  const [apiUrl, setApiUrlState] = useState(getApiUrl)
  const [saved, setSaved] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newUsername, setNewUsername] = useState(user?.username ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)

  useEffect(() => {
    setNewUsername(user?.username ?? '')
  }, [user?.username])

  function save() {
    setApiUrl(apiUrl.trim() || DEFAULT_API_URL)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function saveProfile() {
    setProfileError(null)
    setProfileSuccess(null)

    if (!currentPassword) {
      setProfileError('Current password is required')
      return
    }

    const usernameChanged =
      newUsername.trim().length > 0 && newUsername.trim() !== user?.username
    const passwordChanged = newPassword.length > 0

    if (!usernameChanged && !passwordChanged) {
      setProfileError('Change username and/or enter a new password')
      return
    }

    if (passwordChanged && newPassword.length < 6) {
      setProfileError('New password must be at least 6 characters')
      return
    }

    if (passwordChanged && newPassword !== confirmPassword) {
      setProfileError('New passwords do not match')
      return
    }

    setProfileLoading(true)
    try {
      await updateProfile({
        currentPassword,
        ...(usernameChanged ? { username: newUsername.trim() } : {}),
        ...(passwordChanged ? { password: newPassword } : {}),
      })
      setProfileSuccess('Profile updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setProfileError(
        err instanceof ApiClientError ? err.message : 'Failed to update profile',
      )
    } finally {
      setProfileLoading(false)
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof User }[] = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'integrations', label: 'API & Webhooks', icon: Key },
    { id: 'optout', label: 'Opt-out', icon: ShieldBan },
    { id: 'docs', label: 'API Documentation', icon: BookOpen },
    { id: 'config', label: 'Configuration', icon: Settings2 },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Account, API configuration and developer documentation
        </p>
      </header>

      <div className="flex rounded-xl border border-border bg-panel p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-card text-text shadow-sm'
                : 'text-muted hover:text-text'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {tab === 'account' && (
        <Card
          title="Your account"
          description="PATCH /api/auth/profile — change username or password"
        >
          <div className="space-y-4">
            {profileError && (
              <Alert variant="error" title="Error" onDismiss={() => setProfileError(null)}>
                {profileError}
              </Alert>
            )}
            {profileSuccess && (
              <Alert
                variant="success"
                title="Saved"
                onDismiss={() => setProfileSuccess(null)}
              >
                {profileSuccess}
              </Alert>
            )}

            <Input
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Input
              label="Username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              autoComplete="username"
              hint={`Signed in as ${user?.username ?? '—'}`}
            />
            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              hint="Leave blank to keep current password"
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />

            <Button loading={profileLoading} onClick={saveProfile}>
              Save changes
            </Button>
          </div>
        </Card>
      )}

      {tab === 'integrations' && <IntegrationsPanel />}

      {tab === 'optout' && <OptOutPanel />}

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
