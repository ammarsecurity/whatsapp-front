import type { WaAccount } from '../types/models'
import type { AdminUser } from '../types/models'

function pickId(obj: Record<string, unknown>): string {
  return String(
    obj.accountId ?? obj.id ?? obj.name ?? obj.account_id ?? '',
  ).trim()
}

export function parseAccountList(data: unknown): WaAccount[] {
  if (!data) return []

  if (Array.isArray(data)) {
    return data
      .map((item) => normalizeAccount(item))
      .filter((a) => a.accountId)
  }

  if (typeof data === 'object') {
    const o = data as Record<string, unknown>
    for (const key of ['accounts', 'data', 'items', 'results', 'list']) {
      if (Array.isArray(o[key])) {
        return parseAccountList(o[key])
      }
    }
    const id = pickId(o)
    if (id) return [normalizeAccount(o)]
  }

  return []
}

function normalizeAccount(item: unknown): WaAccount {
  if (typeof item === 'string') {
    return { accountId: item.trim() }
  }
  const o =
    item && typeof item === 'object'
      ? (item as Record<string, unknown>)
      : {}
  return {
    accountId: pickId(o),
    status:
      typeof o.status === 'string'
        ? o.status
        : typeof o.state === 'string'
          ? o.state
          : undefined,
    phone:
      typeof o.phone === 'string'
        ? o.phone
        : typeof o.phoneNumber === 'string'
          ? o.phoneNumber
          : undefined,
  }
}

export function parseUserList(data: unknown): AdminUser[] {
  if (!data) return []

  if (Array.isArray(data)) {
    return data
      .map((item) => normalizeUser(item))
      .filter((u) => u.username || u.userId)
  }

  if (typeof data === 'object') {
    const o = data as Record<string, unknown>
    for (const key of ['users', 'data', 'items', 'results', 'list']) {
      if (Array.isArray(o[key])) {
        return parseUserList(o[key])
      }
    }
  }

  return []
}

function normalizeUser(item: unknown): AdminUser {
  const o =
    item && typeof item === 'object'
      ? (item as Record<string, unknown>)
      : {}
  const userIdRaw = o.userId ?? o.id ?? o.user_id
  return {
    userId:
      typeof userIdRaw === 'number'
        ? userIdRaw
        : typeof userIdRaw === 'string'
          ? Number(userIdRaw)
          : undefined,
    username: String(o.username ?? o.name ?? '').trim(),
    role: typeof o.role === 'string' ? o.role : undefined,
    isAdmin: o.isAdmin === true || o.is_admin === true,
    createdAt:
      typeof o.createdAt === 'string'
        ? o.createdAt
        : typeof o.created_at === 'string'
          ? o.created_at
          : undefined,
  }
}
