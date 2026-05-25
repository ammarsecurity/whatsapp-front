import { Shield, Trash2, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { useConfirm } from '../context/ConfirmContext'
import { api, ApiClientError } from '../lib/api'
import type { AdminUser } from '../types/models'

export function SuperAdminPage() {
  const confirmDialog = useConfirm()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setUsers(await api.listUsers())
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load users',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  async function createUser() {
    if (!username.trim() || !password) {
      setError('Username and password are required')
      return
    }
    setActionLoading('create')
    setError(null)
    setSuccess(null)
    try {
      await api.createUser({
        username: username.trim(),
        password,
        role: role === 'admin' ? 'admin' : 'user',
      })
      setSuccess(`User "${username}" created`)
      setUsername('')
      setPassword('')
      await loadUsers()
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Failed to create user',
      )
    } finally {
      setActionLoading(null)
    }
  }

  async function removeUser(user: AdminUser) {
    if (!user.userId) {
      setError('User ID not available in API response')
      return
    }
    const ok = await confirmDialog({
      title: 'Delete user',
      message: `Permanently remove "${user.username}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setActionLoading(`del-${user.userId}`)
    setError(null)
    setSuccess(null)
    try {
      await api.deleteUser(user.userId)
      setSuccess(`Deleted ${user.username}`)
      await loadUsers()
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Failed to delete user',
      )
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Shield className="h-6 w-6 text-wa-green" />
            <h1 className="text-2xl font-bold tracking-tight">Super Admin</h1>
          </div>
          <p className="text-sm text-muted">
            Manage system users — create, view, and delete
          </p>
        </div>
        <Button variant="secondary" loading={loading} onClick={loadUsers}>
          Refresh list
        </Button>
      </header>

      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert
          variant="success"
          title="Success"
          onDismiss={() => setSuccess(null)}
        >
          {success}
        </Alert>
      )}

      <Card
        title="New user"
        description="POST /api/users"
        action={<UserPlus className="h-4 w-4 text-muted" />}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium text-muted">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-border bg-panel px-3.5 py-2.5 text-sm text-text outline-none focus:border-wa-green focus:ring-1 focus:ring-wa-green/30"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <Button
          className="mt-4"
          loading={actionLoading === 'create'}
          onClick={createUser}
        >
          Add user
        </Button>
      </Card>

      <Card title="Users" description="GET /api/users">
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : users.length === 0 ? (
          <Alert variant="info" title="No users">
            The API returned no users, or the endpoint is not enabled on the
            server.
          </Alert>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-panel text-xs text-muted">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.userId ?? u.username}
                    className="border-b border-border/60 last:border-0 hover:bg-panel/50"
                  >
                    <td className="px-4 py-3 text-muted">{u.userId ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-text">
                      {u.username}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.role === 'admin' || u.isAdmin
                            ? 'bg-wa-green/15 text-wa-green'
                            : 'bg-border/40 text-muted'
                        }`}
                      >
                        {u.role ?? (u.isAdmin ? 'admin' : 'user')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="danger"
                        loading={actionLoading === `del-${u.userId}`}
                        onClick={() => removeUser(u)}
                        disabled={!u.userId}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
