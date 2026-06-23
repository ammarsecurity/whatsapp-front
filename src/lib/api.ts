import type {
  AddAccountRequest,
  CheckNumberRequest,
  LoginRequest,
  SendMessageRequest,
} from '../types/api'
import type {
  MessageHistoryFilters,
  MessageRecord,
  MessageStatistics,
  SendMediaRequest,
} from '../types/messages'
import type { AdminUser, CreateUserRequest, AdminWaAccount, WaAccount } from '../types/models'
import {
  parseAccountList,
  parseAdminAccountList,
  parseMessageList,
  parseMessageStatistics,
  parseUserList,
} from './parseList'
import type { SystemHealthResponse } from '../types/systemHealth'
import { getApiUrl, getToken } from './storage'

export class ApiClientError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.body = body
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const base = getApiUrl()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = token
  }

  const res = await fetch(`${base}${path}`, { ...options, headers })

  let data: unknown
  const text = await res.text()
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    let msg = extractErrorMessage(data, res.statusText)
    if (res.status === 503 && (msg === res.statusText || msg === 'Request failed')) {
      msg = 'Server warming up — wait ~20 seconds after restart and retry'
    }
    throw new ApiClientError(msg, res.status, data)
  }

  return data as T
}

async function requestForm<T>(
  path: string,
  form: FormData,
  auth = true,
): Promise<T> {
  const base = getApiUrl()
  const headers: Record<string, string> = {}

  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = token
  }

  const res = await fetch(`${base}${path}`, { method: 'POST', headers, body: form })

  let data: unknown
  const text = await res.text()
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    let msg = extractErrorMessage(data, res.statusText)
    if (res.status === 503 && (msg === res.statusText || msg === 'Request failed')) {
      msg = 'Server warming up — wait ~20 seconds after restart and retry'
    }
    throw new ApiClientError(msg, res.status, data)
  }

  return data as T
}

async function requestFirst<T>(
  paths: string[],
  options: RequestInit = {},
): Promise<T> {
  let lastErr: ApiClientError | null = null
  for (const path of paths) {
    try {
      return await request<T>(path, options)
    } catch (err) {
      if (err instanceof ApiClientError) {
        lastErr = err
        if (err.status !== 404) throw err
      } else {
        throw err
      }
    }
  }
  throw lastErr ?? new ApiClientError('Not found', 404, null)
}

export function extractToken(data: Record<string, unknown>): string | null {
  if (typeof data.token === 'string') return data.token
  if (typeof data.accessToken === 'string') return data.accessToken
  if (typeof data.access_token === 'string') return data.access_token
  return null
}

/** Backend uses `error`; some responses use `message`. */
export function extractErrorMessage(
  data: unknown,
  fallback = 'Request failed',
): string {
  if (typeof data === 'object' && data !== null) {
    const o = data as Record<string, unknown>
    if (typeof o.error === 'string' && o.error.trim()) return o.error
    if (typeof o.message === 'string' && o.message.trim()) return o.message
  }
  if (typeof data === 'string' && data.trim()) return data
  return fallback || 'Request failed'
}

export const api = {
  login(body: LoginRequest) {
    return request<Record<string, unknown>>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }, false)
  },

  async loginAndGetToken(body: LoginRequest): Promise<string> {
    const data = await api.login(body)
    const token = extractToken(data)
    if (!token) {
      throw new ApiClientError(
        'No token in login response',
        200,
        data,
      )
    }
    return token
  },

  register(body: LoginRequest) {
    return request<Record<string, unknown>>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }, false)
  },

  systemStatus() {
    return request<Record<string, unknown>>('/api/status/system')
  },

  async listAccounts(): Promise<WaAccount[]> {
    const data = await requestFirst<unknown>([
      '/api/accounts',
      '/api/accounts/list',
      '/api/user/accounts',
    ])
    return parseAccountList(data)
  },

  accountStatus(accountId: string) {
    return request<Record<string, unknown>>(
      `/api/accounts/${encodeURIComponent(accountId)}/status`,
    )
  },

  getQr(accountId: string, regenerate = false) {
    const q = regenerate ? '?regenerate=1' : ''
    return request<Record<string, unknown>>(
      `/api/accounts/${encodeURIComponent(accountId)}/qr${q}`,
    )
  },

  resetSession(accountId: string) {
    return request<Record<string, unknown>>(
      `/api/accounts/${encodeURIComponent(accountId)}/reset-session`,
      { method: 'POST' },
    )
  },

  addAccount(body: AddAccountRequest) {
    return request<Record<string, unknown>>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  addAccountByPath(accountId: string) {
    // Backend only exposes POST /api/accounts (no path variant)
    return this.addAccount({ accountId })
  },

  deleteAccount(accountId: string) {
    return request<Record<string, unknown>>(
      `/api/accounts/${encodeURIComponent(accountId)}`,
      { method: 'DELETE' },
    )
  },

  checkNumber(body: CheckNumberRequest) {
    return request<Record<string, unknown>>('/api/messages/check-number', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  sendMessage(body: SendMessageRequest) {
    return request<Record<string, unknown>>('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  sendMedia(body: SendMediaRequest) {
    const form = new FormData()
    form.append('file', body.file)
    form.append('accountId', body.accountId)
    form.append('phoneNumbers', JSON.stringify(body.phoneNumbers))
    form.append('mediaType', body.mediaType ?? 'document')
    if (body.caption) form.append('caption', body.caption)
    return requestForm<Record<string, unknown>>('/api/messages/send-media', form)
  },

  async messageHistory(filters: MessageHistoryFilters = {}): Promise<MessageRecord[]> {
    const params = new URLSearchParams()
    if (filters.accountId) params.set('accountId', filters.accountId)
    if (filters.phoneNumber) params.set('phoneNumber', filters.phoneNumber)
    if (filters.status) params.set('status', filters.status)
    if (filters.limit != null) params.set('limit', String(filters.limit))
    if (filters.offset != null) params.set('offset', String(filters.offset))
    const q = params.toString()
    const data = await request<unknown>(`/api/messages${q ? `?${q}` : ''}`)
    return parseMessageList(data)
  },

  async messageStatistics(accountId?: string): Promise<MessageStatistics | null> {
    const q = accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''
    const data = await request<unknown>(`/api/messages/statistics${q}`)
    return parseMessageStatistics(data)
  },

  getMessage(messageId: number) {
    return request<Record<string, unknown>>(`/api/messages/${messageId}`)
  },

  async listUsers(): Promise<AdminUser[]> {
    const data = await request<unknown>('/api/users')
    return parseUserList(data)
  },

  createUser(body: CreateUserRequest) {
    return request<Record<string, unknown>>('/api/users', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  deleteUser(userId: number) {
    return request<Record<string, unknown>>(`/api/users/${userId}`, {
      method: 'DELETE',
    })
  },

  adminAccountPath(userId: number, accountId: string) {
    return `/api/admin/accounts/${userId}/${encodeURIComponent(accountId)}`
  },

  adminSystemHealth() {
    return request<SystemHealthResponse>('/api/admin/system-health')
  },

  async listAllAccountsAdmin(): Promise<AdminWaAccount[]> {
    const data = await request<unknown>('/api/admin/accounts')
    return parseAdminAccountList(data)
  },

  adminDisconnectAccount(userId: number, accountId: string) {
    return request<Record<string, unknown>>(
      `${api.adminAccountPath(userId, accountId)}/disconnect`,
      { method: 'POST' },
    )
  },

  adminResetSession(userId: number, accountId: string) {
    return request<Record<string, unknown>>(
      `${api.adminAccountPath(userId, accountId)}/reset-session`,
      { method: 'POST' },
    )
  },

  adminGetQr(userId: number, accountId: string, regenerate = false) {
    const q = regenerate ? '?regenerate=1' : ''
    return request<Record<string, unknown>>(
      `${api.adminAccountPath(userId, accountId)}/qr${q}`,
    )
  },

  adminDeleteAccount(userId: number, accountId: string) {
    return request<Record<string, unknown>>(
      api.adminAccountPath(userId, accountId),
      { method: 'DELETE' },
    )
  },

  updateUser(
    userId: number,
    body: Partial<CreateUserRequest> & { isAdmin?: boolean },
  ) {
    return requestFirst<Record<string, unknown>>(
      [
        `/api/users/${userId}`,
        `/api/admin/users/${userId}`,
      ],
      { method: 'PUT', body: JSON.stringify(body) },
    )
  },
}
