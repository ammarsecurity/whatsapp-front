import { Pencil, Trash2, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import { ListToolbar } from './ui/ListToolbar'
import { Pagination, DEFAULT_PAGE_SIZE } from './ui/Pagination'
import { useConfirm } from '../context/ConfirmContext'
import { api, ApiClientError } from '../lib/api'
import { filterBySearch, paginateMeta, slicePage } from '../lib/pagination'
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

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editPassword, setEditPassword] = useState('')

  const [userSearch, setUserSearch] = useState('')
  const [usersPage, setUsersPage] = useState(1)
  const [usersPageSize, setUsersPageSize] = useState(DEFAULT_PAGE_SIZE)

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

  useEffect(() => {
    setUsersPage(1)
  }, [userSearch, usersPageSize])

  const filteredUsers = filterBySearch(
    users,
    userSearch,
    (u) => `${u.username} ${u.role ?? ''} ${u.userId ?? ''}`,
  )
  const { totalPages: usersTotalPages } = paginateMeta(
    filteredUsers.length,
    usersPageSize,
    (usersPage - 1) * usersPageSize,
  )
  const pagedUsers = slicePage(filteredUsers, usersPage, usersPageSize)

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

  function startEdit(user: AdminUser) {
    if (!user.userId) return
    setEditingId(user.userId)
    setEditUsername(user.username)
    setEditPassword('')
    setError(null)
    setSuccess(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditUsername('')
    setEditPassword('')
  }

  async function saveEdit(user: AdminUser) {
    if (!user.userId) return

    const trimmed = editUsername.trim()
    const passwordChanged = editPassword.length > 0
    const usernameChanged = trimmed.length > 0 && trimmed !== user.username

    if (!usernameChanged && !passwordChanged) {
      setError('Change username and/or enter a new password')
      return
    }
    if (passwordChanged && editPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setActionLoading(`edit-${user.userId}`)
    setError(null)
    setSuccess(null)
    try {
      await api.updateUser(user.userId, {
        ...(usernameChanged ? { username: trimmed } : {}),
        ...(passwordChanged ? { password: editPassword } : {}),
      })
      setSuccess(`Updated ${trimmed || user.username}`)
      cancelEdit()
      await loadUsers()
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Failed to update user',
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

      <Card title="Users" description="GET /api/users · PATCH /api/users/:id">
        <ListToolbar
          search={userSearch}
          onSearchChange={setUserSearch}
          searchPlaceholder="Search username or ID…"
        />
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
        ) : filteredUsers.length === 0 ? (
          <Alert variant="info" title="No matches">
            No users match your search.
          </Alert>
        ) : (
          <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-panel text-xs text-muted">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((u) => {
                  const isEditing = editingId === u.userId
                  return (
                    <tr
                      key={u.userId ?? u.username}
                      className="border-b border-border/60 last:border-0 hover:bg-panel/50"
                    >
                      <td className="px-4 py-3 text-muted">{u.userId ?? '—'}</td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="space-y-2">
                            <Input
                              value={editUsername}
                              onChange={(e) => setEditUsername(e.target.value)}
                              aria-label="Edit username"
                            />
                            <Input
                              type="password"
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                              placeholder="New password (optional)"
                              aria-label="New password"
                            />
                          </div>
                        ) : (
                          <span className="font-medium text-text">{u.username}</span>
                        )}
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
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {isEditing ? (
                            <>
                              <Button
                                loading={actionLoading === `edit-${u.userId}`}
                                onClick={() => saveEdit(u)}
                              >
                                Save
                              </Button>
                              <Button variant="secondary" onClick={cancelEdit}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="secondary"
                                onClick={() => startEdit(u)}
                                disabled={!u.userId}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="danger"
                                loading={actionLoading === `del-${u.userId}`}
                                onClick={() => removeUser(u)}
                                disabled={!u.userId}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={usersPage}
            totalPages={usersTotalPages}
            total={filteredUsers.length}
            pageSize={usersPageSize}
            onPageChange={setUsersPage}
            onPageSizeChange={(size) => {
              setUsersPageSize(size)
              setUsersPage(1)
            }}
          />
          </>
        )}
      </Card>
    </div>
  )
}
