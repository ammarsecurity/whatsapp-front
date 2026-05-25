import { parseJwtPayload } from './jwt'

export interface AuthUser {
  userId?: number
  username: string
  role?: string
  isAdmin?: boolean
}

export function isSuperAdmin(user: AuthUser | null): boolean {
  if (!user) return false
  if (user.isAdmin === true) return true
  const role = (user.role ?? '').toLowerCase()
  return ['admin', 'superadmin', 'super_admin', 'superadmin'].includes(role)
}

export function userFromLoginResponse(
  data: Record<string, unknown>,
  token: string,
): AuthUser {
  const jwt = parseJwtPayload(token)
  const nested =
    data.user && typeof data.user === 'object'
      ? (data.user as Record<string, unknown>)
      : null

  const username = String(
    nested?.username ??
      data.username ??
      jwt?.username ??
      '',
  )

  const role = String(
    nested?.role ?? data.role ?? jwt?.role ?? jwt?.userRole ?? '',
  ).trim() || undefined

  const isAdmin =
    nested?.isAdmin === true ||
    data.isAdmin === true ||
    jwt?.isAdmin === true ||
    isSuperAdmin({ username, role })

  const userIdRaw = nested?.userId ?? nested?.id ?? data.userId ?? jwt?.userId
  const userId =
    typeof userIdRaw === 'number'
      ? userIdRaw
      : typeof userIdRaw === 'string'
        ? Number(userIdRaw)
        : undefined

  return {
    userId: Number.isFinite(userId) ? userId : undefined,
    username,
    role,
    isAdmin: isAdmin || undefined,
  }
}
