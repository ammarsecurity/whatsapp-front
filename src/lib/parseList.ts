import type { WaAccount, AdminWaAccount } from '../types/models'
import type { AdminUser } from '../types/models'
import type { MessageRecord, MessageStatistics } from '../types/messages'

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
    isReady:
      o.isReady === true ||
      o.is_ready === true ||
      o.is_ready === 1 ||
      o.ready === true ||
      o.ready === 1,
    isConnected:
      o.isConnected === true ||
      o.is_connected === true ||
      o.is_connected === 1 ||
      o.connected === true ||
      o.connected === 1,
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

export function parseMessageList(data: unknown): MessageRecord[] {
  if (!data) return []

  let items: unknown[] = []
  if (Array.isArray(data)) {
    items = data
  } else if (typeof data === 'object' && data !== null) {
    const o = data as Record<string, unknown>
    if (Array.isArray(o.messages)) items = o.messages
  }

  return items
    .map((item) => normalizeMessage(item))
    .filter((m) => m.id > 0 || m.phoneNumber)
}

function normalizeMessage(item: unknown): MessageRecord {
  const o =
    item && typeof item === 'object'
      ? (item as Record<string, unknown>)
      : {}

  const idRaw = o.id ?? o.messageId
  return {
    id: typeof idRaw === 'number' ? idRaw : Number(idRaw) || 0,
    accountId: String(o.accountId ?? o.account_id ?? '').trim(),
    phoneNumber: String(o.phoneNumber ?? o.phone_number ?? '').trim(),
    messageType: String(o.messageType ?? o.message_type ?? 'text'),
    messageText: String(o.messageText ?? o.message_text ?? ''),
    status: String(o.status ?? 'pending'),
    createdAt:
      typeof o.createdAt === 'string'
        ? o.createdAt
        : typeof o.created_at === 'string'
          ? o.created_at
          : undefined,
    sentAt:
      typeof o.sentAt === 'string'
        ? o.sentAt
        : typeof o.sent_at === 'string'
          ? o.sent_at
          : undefined,
    errorMessage:
      typeof o.errorMessage === 'string'
        ? o.errorMessage
        : typeof o.error_message === 'string'
          ? o.error_message
          : null,
    mediaFileName:
      typeof o.mediaFileName === 'string'
        ? o.mediaFileName
        : typeof o.media_file_name === 'string'
          ? o.media_file_name
          : null,
  }
}

export function parseMessageStatistics(data: unknown): MessageStatistics | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const stats =
    o.statistics && typeof o.statistics === 'object'
      ? (o.statistics as Record<string, unknown>)
      : o

  const num = (v: unknown) =>
    typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : 0

  return {
    total: num(stats.total),
    sent: num(stats.sent),
    failed: num(stats.failed),
    pending: num(stats.pending),
  }
}

export function parseAdminAccountList(data: unknown): AdminWaAccount[] {
  if (!data) return []
  let items: unknown[] = []
  if (Array.isArray(data)) {
    items = data
  } else if (typeof data === 'object' && data !== null) {
    const o = data as Record<string, unknown>
    if (Array.isArray(o.accounts)) items = o.accounts
  }
  return items.map(normalizeAdminAccount).filter((a) => a.accountId && a.userId)
}

function normalizeAdminAccount(item: unknown): AdminWaAccount {
  const o =
    item && typeof item === 'object'
      ? (item as Record<string, unknown>)
      : {}
  const userIdRaw = o.userId ?? o.user_id
  return {
    accountId: pickId(o),
    userId:
      typeof userIdRaw === 'number'
        ? userIdRaw
        : typeof userIdRaw === 'string'
          ? Number(userIdRaw)
          : 0,
    ownerUsername:
      typeof o.ownerUsername === 'string'
        ? o.ownerUsername
        : typeof o.owner_username === 'string'
          ? o.owner_username
          : null,
    isReady:
      o.isReady === true ||
      o.is_ready === true ||
      o.is_ready === 1,
    isConnected:
      o.isConnected === true ||
      o.is_connected === true ||
      o.is_connected === 1,
    inMemory: o.inMemory === true || o.in_memory === true,
    hasQrCode: o.hasQrCode === true || o.has_qr_code === true,
    liveState:
      typeof o.liveState === 'string'
        ? o.liveState
        : typeof o.live_state === 'string'
          ? o.live_state
          : null,
    initError:
      typeof o.initError === 'string'
        ? o.initError
        : typeof o.init_error === 'string'
          ? o.init_error
          : null,
    createdAt:
      typeof o.createdAt === 'string'
        ? o.createdAt
        : typeof o.created_at === 'string'
          ? o.created_at
          : undefined,
    updatedAt:
      typeof o.updatedAt === 'string'
        ? o.updatedAt
        : typeof o.updated_at === 'string'
          ? o.updated_at
          : undefined,
  }
}
