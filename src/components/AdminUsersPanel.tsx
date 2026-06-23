import { Trash2, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import { useConfirm } from '../context/ConfirmContext'
import { api, ApiClientError } from '../lib/api'
import type { AdminUser } from '../types/models'

export function AdminUsersPanel() {
  const confirmDialog = useConfirm()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setUsers(await api.listUsers())
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Failed to load users',
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
      await api.createUser({ username: username.trim(), password })
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
      setError('User ID not available')
      return
    }
    const ok = await confirmDialog({
      title: 'Delete user',
      message: `Remove "${user.username}" and all their accounts/messages?`,
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
    <div className="space-y-4">
      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" title="Success" onDismiss={() => setSuccess(null)}>
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
        <div className="mb-3 flex justify-end">
          <Button variant="secondary" loading={loading} onClick={loadUsers}>
            Refresh
          </Button>
        </div>
        {loading && users.length === 0 ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : users.length === 0 ? (
          <Alert variant="info" title="No users">
            No users returned from the API.
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
