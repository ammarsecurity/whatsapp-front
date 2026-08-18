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

function roleLabel(user: AdminUser) {
  return user.role === 'admin' || user.isAdmin ? 'مدير' : 'مستخدم'
}

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
        err instanceof ApiClientError ? err.message : 'تعذّر تحميل المستخدمين',
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
      setError('اسم المستخدم وكلمة المرور مطلوبان')
      return
    }
    setActionLoading('create')
    setError(null)
    setSuccess(null)
    try {
      await api.createUser({ username: username.trim(), password })
      setSuccess(`أُنشئ المستخدم "${username}"`)
      setUsername('')
      setPassword('')
      await loadUsers()
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'تعذّر إنشاء المستخدم',
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
      setError('غيّر اسم المستخدم أو أدخل كلمة مرور جديدة')
      return
    }
    if (passwordChanged && editPassword.length < 6) {
      setError('كلمة المرور يجب ألا تقل عن 6 أحرف')
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
      setSuccess(`تم تحديث ${trimmed || user.username}`)
      cancelEdit()
      await loadUsers()
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'تعذّر تحديث المستخدم',
      )
    } finally {
      setActionLoading(null)
    }
  }

  async function removeUser(user: AdminUser) {
    if (!user.userId) {
      setError('معرّف المستخدم غير متاح')
      return
    }
    const ok = await confirmDialog({
      title: 'حذف المستخدم',
      message: `حذف "${user.username}" وكل حساباته ورسائله؟`,
      confirmLabel: 'حذف',
      variant: 'danger',
    })
    if (!ok) return
    setActionLoading(`del-${user.userId}`)
    setError(null)
    setSuccess(null)
    try {
      await api.deleteUser(user.userId)
      setSuccess(`حُذف ${user.username}`)
      await loadUsers()
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'تعذّر حذف المستخدم',
      )
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
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

      <Card
        title="مستخدم جديد"
        description="إنشاء حساب دخول للوحة التحكم"
        action={<UserPlus className="h-4 w-4 text-muted" />}
      >
        <div className="grid max-w-[700px] gap-4 sm:grid-cols-2">
          <Input
            label="اسم المستخدم"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
          />
          <Input
            label="كلمة المرور"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            loading={actionLoading === 'create'}
            onClick={createUser}
          >
            إضافة مستخدم
          </Button>
        </div>
      </Card>

      <Card title="المستخدمون" description="تعديل الأسماء وكلمات المرور أو الحذف">
        <ListToolbar
          search={userSearch}
          onSearchChange={setUserSearch}
          searchPlaceholder="ابحث باسم المستخدم أو المعرّف…"
        />
        <div className="mb-3 flex justify-end">
          <Button variant="secondary" loading={loading} onClick={loadUsers}>
            تحديث
          </Button>
        </div>
        {loading && users.length === 0 ? (
          <div className="space-y-2">
            <div className="skeleton h-12 rounded-[14px]" />
            <div className="skeleton h-12 rounded-[14px]" />
          </div>
        ) : users.length === 0 ? (
          <Alert variant="info" title="لا يوجد مستخدمون">
            لم تُرجع الواجهة أي مستخدمين.
          </Alert>
        ) : filteredUsers.length === 0 ? (
          <Alert variant="info" title="لا توجد نتائج">
            لا يوجد مستخدمون يطابقون البحث.
          </Alert>
        ) : (
          <>
          <div className="overflow-x-auto rounded-[16px] bg-slate-50">
            <table className="w-full min-w-[640px] text-start text-[15px]">
              <thead>
                <tr className="text-[13px] text-muted">
                  <th className="px-4 py-3 font-medium">المعرّف</th>
                  <th className="px-4 py-3 font-medium">اسم المستخدم</th>
                  <th className="px-4 py-3 font-medium">الدور</th>
                  <th className="px-4 py-3 text-end font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((u) => {
                  const isEditing = editingId === u.userId
                  return (
                    <tr
                      key={u.userId ?? u.username}
                      className="border-t border-white hover:bg-white/70"
                    >
                      <td className="px-4 py-3 text-muted">{u.userId ?? '—'}</td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="space-y-2">
                            <Input
                              value={editUsername}
                              onChange={(e) => setEditUsername(e.target.value)}
                              aria-label="تعديل اسم المستخدم"
                            />
                            <Input
                              type="password"
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                              placeholder="كلمة مرور جديدة (اختياري)"
                              aria-label="كلمة المرور الجديدة"
                            />
                          </div>
                        ) : (
                          <span className="font-medium text-text">{u.username}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[13px] font-medium ${
                            u.role === 'admin' || u.isAdmin
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {roleLabel(u)}
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
                                حفظ
                              </Button>
                              <Button variant="secondary" onClick={cancelEdit}>
                                إلغاء
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="secondary"
                                onClick={() => startEdit(u)}
                                disabled={!u.userId}
                                title="تعديل"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="danger"
                                loading={actionLoading === `del-${u.userId}`}
                                onClick={() => removeUser(u)}
                                disabled={!u.userId}
                                title="حذف"
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
