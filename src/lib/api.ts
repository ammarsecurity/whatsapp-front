import type {
  AddAccountRequest,
  CheckNumberRequest,
  LoginRequest,
  SendMessageRequest,
} from '../types/api'
import type { CreateUserRequest } from '../types/models'
import { parseAccountList, parseUserList } from './parseList'
import type { AdminUser, WaAccount } from '../types/models'
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
    const msg =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message: string }).message)
        : res.statusText || 'Request failed'
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

  getQr(accountId: string) {
    return request<Record<string, unknown>>(
      `/api/accounts/${encodeURIComponent(accountId)}/qr`,
    )
  },

  addAccount(body: AddAccountRequest) {
    return request<Record<string, unknown>>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  addAccountByPath(accountId: string) {
    return request<Record<string, unknown>>(
      `/api/accounts/${encodeURIComponent(accountId)}`,
      { method: 'POST' },
    )
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

  async listUsers(): Promise<AdminUser[]> {
    const data = await requestFirst<unknown>([
      '/api/users',
      '/api/admin/users',
      '/api/auth/users',
    ])
    return parseUserList(data)
  },

  createUser(body: CreateUserRequest) {
    return requestFirst<Record<string, unknown>>(
      ['/api/users', '/api/admin/users', '/api/auth/register-admin'],
      { method: 'POST', body: JSON.stringify(body) },
    )
  },

  deleteUser(userId: number) {
    return requestFirst<Record<string, unknown>>(
      [
        `/api/users/${userId}`,
        `/api/admin/users/${userId}`,
      ],
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
