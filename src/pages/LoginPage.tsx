import { MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useAuth } from '../context/AuthContext'
import { ApiClientError } from '../lib/api'

export function LoginPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(username, password)
      } else {
        await register(username, password)
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Something went wrong',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-app-pattern flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-wa-green shadow-lg shadow-wa-green/25">
            <MessageCircle className="h-8 w-8 text-surface" strokeWidth={2.2} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp Console</h1>
          <p className="mt-1 text-sm text-muted">
            Manage accounts, send messages, and monitor status
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-panel p-6 shadow-xl shadow-black/30">
          <div className="mb-6 flex rounded-lg bg-surface p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md py-2 text-sm font-medium capitalize transition-colors ${
                  mode === m
                    ? 'bg-card text-text shadow-sm'
                    : 'text-muted hover:text-text'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_username"
              required
              autoComplete="username"
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
            />

            {error && (
              <Alert variant="error" title="Sign in failed">
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full"
              loading={loading}
              variant="primary"
            >
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
