import type {
  AddAccountRequest,
  CheckNumberRequest,
  LoginRequest,
  SendMessageRequest,
  UpdateProfileRequest,
  UpdateUserRequest,
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
import type {
  CampaignRecord,
  ContactGroup,
  ContactGroupNumber,
  SendCampaignRequest,
  SendCampaignResult,
} from '../types/contacts'
import type {
  ApiKeyRecord,
  AutoReplyRule,
  CampaignRecipient,
  InboxMessage,
  MessageTemplate,
  OptOutEntry,
  UserQuota,
  WebhookRecord,
} from '../types/features'
import type { PaginatedResult } from './pagination'
import { buildPaginated } from './pagination'
import { getApiUrl, getToken } from './storage'

export interface ClearStuckSessionsResponse {
  success?: boolean
  message?: string
  clearedCount: number
  errorCount: number
  cleared: Array<{
    accountId: string
    previousStatus?: string
    liveState?: string | null
    userId?: number
  }>
  errors: Array<{
    accountId: string
    error: string
    userId?: number
  }>
}

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

function formatHttpErrorMessage(
  status: number,
  data: unknown,
  fallback: string,
): string {
  let msg = extractErrorMessage(data, fallback)
  if (status === 503) {
    const body =
      data && typeof data === 'object'
        ? (data as Record<string, unknown>)
        : null
    if (body?.error === 'WhatsApp account is not ready' && body.status) {
      return `Account not ready (${String(body.status)}) — wait until status is "ready"`
    }
    if (msg === fallback || msg === 'Request failed') {
      return 'Service temporarily unavailable — retry shortly'
    }
  }
  if (status === 504) {
    const body =
      data && typeof data === 'object'
        ? (data as Record<string, unknown>)
        : null
    if (typeof body?.hint === 'string' && body.hint.trim()) {
      return `${msg}. ${body.hint}`
    }
    return msg || 'Request timed out on the server — try Clear stuck sessions'
  }
  return msg
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
  timeoutMs = 120_000,
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

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiClientError(
        'Request timed out — WhatsApp may be stuck. Try Accounts → Clear stuck sessions.',
        408,
        null,
      )
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  let data: unknown
  const text = await res.text()
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    const msg = formatHttpErrorMessage(res.status, data, res.statusText)
    throw new ApiClientError(msg, res.status, data)
  }

  return data as T
}

async function requestForm<T>(
  path: string,
  form: FormData,
  auth = true,
  timeoutMs = 180_000,
): Promise<T> {
  const base = getApiUrl()
  const headers: Record<string, string> = {}

  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = token
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiClientError(
        'Upload timed out — WhatsApp may be stuck. Try Accounts → Clear stuck sessions.',
        408,
        null,
      )
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  let data: unknown
  const text = await res.text()
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    const msg = formatHttpErrorMessage(res.status, data, res.statusText)
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

  updateProfile(body: UpdateProfileRequest) {
    return request<Record<string, unknown>>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
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

  disconnectAccount(accountId: string) {
    return request<Record<string, unknown>>(
      `/api/accounts/${encodeURIComponent(accountId)}/disconnect`,
      { method: 'POST' },
    )
  },

  clearStuckSessions() {
    return request<ClearStuckSessionsResponse>(
      '/api/accounts/clear-stuck-sessions',
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
    return request<Record<string, unknown>>(
      '/api/messages/check-number',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      true,
      90_000,
    )
  },

  sendMessage(body: SendMessageRequest) {
    return request<Record<string, unknown>>(
      '/api/messages/send',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      true,
      90_000,
    )
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

  async messageHistory(
    filters: MessageHistoryFilters = {},
  ): Promise<PaginatedResult<MessageRecord>> {
    const params = new URLSearchParams()
    if (filters.accountId) params.set('accountId', filters.accountId)
    if (filters.phoneNumber) params.set('phoneNumber', filters.phoneNumber)
    if (filters.search) params.set('search', filters.search)
    if (filters.status) params.set('status', filters.status)
    if (filters.limit != null) params.set('limit', String(filters.limit))
    if (filters.offset != null) params.set('offset', String(filters.offset))
    const q = params.toString()
    const data = await request<unknown>(`/api/messages${q ? `?${q}` : ''}`)
    const o = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const messages = parseMessageList(data)
    const total = Number(o.total ?? messages.length)
    const limit = Number(o.limit ?? filters.limit ?? 20)
    const offset = Number(o.offset ?? filters.offset ?? 0)
    return buildPaginated(messages, total, limit, offset)
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

  adminClearStuckSessions() {
    return request<ClearStuckSessionsResponse>(
      '/api/admin/clear-stuck-sessions',
      { method: 'POST' },
    )
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

  updateUser(userId: number, body: UpdateUserRequest) {
    return request<Record<string, unknown>>(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  async listContactGroups(params: {
    search?: string
    limit?: number
    offset?: number
  } = {}): Promise<PaginatedResult<ContactGroup>> {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.limit != null) q.set('limit', String(params.limit))
    if (params.offset != null) q.set('offset', String(params.offset))
    const qs = q.toString()
    const data = await request<unknown>(`/api/contact-groups${qs ? `?${qs}` : ''}`)
    const o = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const list = Array.isArray(o.groups) ? o.groups : []
    const items = list
      .map((g) => {
        const row = g as Record<string, unknown>
        return {
          id: Number(row.id),
          name: String(row.name ?? ''),
          description: row.description != null ? String(row.description) : null,
          numberCount: Number(row.numberCount ?? row.number_count ?? 0),
          createdAt: row.createdAt != null ? String(row.createdAt) : undefined,
          updatedAt: row.updatedAt != null ? String(row.updatedAt) : undefined,
        }
      })
      .filter((g) => g.id && g.name)
    return buildPaginated(
      items,
      Number(o.total ?? items.length),
      Number(o.limit ?? params.limit ?? 50),
      Number(o.offset ?? params.offset ?? 0),
    )
  },

  createContactGroup(body: { name: string; description?: string; numbers?: string[] }) {
    return request<Record<string, unknown>>('/api/contact-groups', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async getContactGroup(
    groupId: number,
    params: { search?: string; limit?: number; offset?: number } = {},
  ): Promise<{
    group: ContactGroup
    numbers: ContactGroupNumber[]
    total: number
    limit: number
    offset: number
    page: number
    totalPages: number
  } | null> {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.limit != null) q.set('limit', String(params.limit))
    if (params.offset != null) q.set('offset', String(params.offset))
    const qs = q.toString()
    const data = await request<unknown>(
      `/api/contact-groups/${groupId}${qs ? `?${qs}` : ''}`,
    )
    const o = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const g = o.group as Record<string, unknown> | undefined
    if (!g) return null
    const numbers = Array.isArray(o.numbers) ? o.numbers : []
    const total = Number(o.total ?? numbers.length)
    const limit = Number(o.limit ?? params.limit ?? 50)
    const offset = Number(o.offset ?? params.offset ?? 0)
    const paged = buildPaginated([], total, limit, offset)
    return {
      group: {
        id: Number(g.id),
        name: String(g.name ?? ''),
        description: g.description != null ? String(g.description) : null,
        numberCount: total,
      },
      numbers: numbers.map((n) => {
        const row = n as Record<string, unknown>
        return {
          id: Number(row.id),
          phoneNumber: String(row.phoneNumber ?? row.phone_number ?? ''),
          label: row.label != null ? String(row.label) : null,
        }
      }),
      total,
      limit,
      offset,
      page: paged.page,
      totalPages: paged.totalPages,
    }
  },

  updateContactGroup(groupId: number, body: { name?: string; description?: string }) {
    return request<Record<string, unknown>>(`/api/contact-groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  deleteContactGroup(groupId: number) {
    return request<Record<string, unknown>>(`/api/contact-groups/${groupId}`, {
      method: 'DELETE',
    })
  },

  importContactNumbers(
    groupId: number,
    numbers: string[],
    replace = false,
  ) {
    return request<Record<string, unknown>>(`/api/contact-groups/${groupId}/numbers`, {
      method: 'POST',
      body: JSON.stringify({ numbers, replace }),
    })
  },

  deleteContactNumber(groupId: number, numberId: number) {
    return request<Record<string, unknown>>(
      `/api/contact-groups/${groupId}/numbers/${numberId}`,
      { method: 'DELETE' },
    )
  },

  async listCampaigns(params: {
    search?: string
    status?: string
    limit?: number
    offset?: number
  } = {}): Promise<PaginatedResult<CampaignRecord>> {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.status) q.set('status', params.status)
    if (params.limit != null) q.set('limit', String(params.limit))
    if (params.offset != null) q.set('offset', String(params.offset))
    const qs = q.toString()
    const data = await request<unknown>(`/api/campaigns${qs ? `?${qs}` : ''}`)
    const o = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const list = Array.isArray(o.campaigns) ? o.campaigns : []
    const items = list.map(parseCampaign).filter((c) => c.id)
    return buildPaginated(
      items,
      Number(o.total ?? items.length),
      Number(o.limit ?? params.limit ?? 20),
      Number(o.offset ?? params.offset ?? 0),
    )
  },

  async sendCampaign(body: SendCampaignRequest): Promise<SendCampaignResult> {
    const data = await request<Record<string, unknown>>(
      '/api/campaigns/send',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      true,
      120_000,
    )
    return {
      campaignId: Number(data.campaignId),
      total: Number(data.total ?? data.totalRecipients ?? 0),
      successCount: Number(data.successCount ?? 0),
      failureCount: Number(data.failureCount ?? 0),
      scheduled: !!data.scheduled,
      scheduledAt: data.scheduledAt != null ? String(data.scheduledAt) : undefined,
      skippedOptOut: data.skippedOptOut != null ? Number(data.skippedOptOut) : undefined,
      results: Array.isArray(data.results)
        ? (data.results as SendCampaignResult['results'])
        : undefined,
    }
  },

  async getCampaign(id: number): Promise<CampaignRecord | null> {
    const data = await request<Record<string, unknown>>(`/api/campaigns/${id}`)
    const c = data.campaign
    if (!c) return null
    return parseCampaign(c)
  },

  async listCampaignRecipients(
    campaignId: number,
    params: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<PaginatedResult<CampaignRecipient>> {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.limit != null) q.set('limit', String(params.limit))
    if (params.offset != null) q.set('offset', String(params.offset))
    const qs = q.toString()
    const data = await request<unknown>(`/api/campaigns/${campaignId}/recipients${qs ? `?${qs}` : ''}`)
    const o = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const list = Array.isArray(o.recipients) ? o.recipients : []
    const items = list.map((r) => {
      const row = r as Record<string, unknown>
      return {
        id: Number(row.id),
        phoneNumber: String(row.phoneNumber ?? row.phone_number ?? ''),
        status: String(row.status) as CampaignRecipient['status'],
        errorMessage: row.errorMessage != null ? String(row.errorMessage) : row.error_message != null ? String(row.error_message) : null,
        createdAt: row.createdAt != null ? String(row.createdAt) : undefined,
      }
    })
    return buildPaginated(
      items,
      Number(o.total ?? items.length),
      Number(o.limit ?? params.limit ?? 50),
      Number(o.offset ?? params.offset ?? 0),
    )
  },

  cancelScheduledCampaign(campaignId: number) {
    return request<Record<string, unknown>>(`/api/campaigns/${campaignId}/cancel`, {
      method: 'POST',
    })
  },

  async listTemplates(params: {
    search?: string
    limit?: number
    offset?: number
  } = {}): Promise<PaginatedResult<MessageTemplate>> {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.limit != null) q.set('limit', String(params.limit))
    if (params.offset != null) q.set('offset', String(params.offset))
    const qs = q.toString()
    const data = await request<unknown>(`/api/templates${qs ? `?${qs}` : ''}`)
    const o = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const list = Array.isArray(o.templates) ? o.templates : []
    const items = list.map(parseTemplate).filter((t) => t.id)
    return buildPaginated(
      items,
      Number(o.total ?? items.length),
      Number(o.limit ?? params.limit ?? 50),
      Number(o.offset ?? params.offset ?? 0),
    )
  },

  createTemplate(body: { name: string; body: string }) {
    return request<{ template: MessageTemplate }>('/api/templates', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateTemplate(id: number, body: { name?: string; body?: string }) {
    return request<{ template: MessageTemplate }>(`/api/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  deleteTemplate(id: number) {
    return request<Record<string, unknown>>(`/api/templates/${id}`, { method: 'DELETE' })
  },

  async listOptOuts(params: {
    search?: string
    limit?: number
    offset?: number
  } = {}): Promise<PaginatedResult<OptOutEntry>> {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.limit != null) q.set('limit', String(params.limit))
    if (params.offset != null) q.set('offset', String(params.offset))
    const qs = q.toString()
    const data = await request<unknown>(`/api/opt-out${qs ? `?${qs}` : ''}`)
    const o = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const list = Array.isArray(o.optOuts) ? o.optOuts : []
    const items = list.map((r) => {
      const row = r as Record<string, unknown>
      return {
        id: Number(row.id),
        phoneNumber: String(row.phoneNumber ?? row.phone_number ?? ''),
        reason: row.reason != null ? String(row.reason) : null,
        source: row.source != null ? String(row.source) : undefined,
        createdAt: row.createdAt != null ? String(row.createdAt) : undefined,
      }
    })
    return buildPaginated(
      items,
      Number(o.total ?? items.length),
      Number(o.limit ?? params.limit ?? 50),
      Number(o.offset ?? params.offset ?? 0),
    )
  },

  addOptOut(phoneNumber: string, reason?: string) {
    return request<Record<string, unknown>>('/api/opt-out', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, reason }),
    })
  },

  removeOptOut(phoneNumber: string) {
    return request<Record<string, unknown>>(`/api/opt-out/${encodeURIComponent(phoneNumber)}`, {
      method: 'DELETE',
    })
  },

  async listInbox(params: {
    accountId?: string
    search?: string
    unreadOnly?: boolean
    limit?: number
    offset?: number
  } = {}): Promise<PaginatedResult<InboxMessage> & { unread: number }> {
    const q = new URLSearchParams()
    if (params.accountId) q.set('accountId', params.accountId)
    if (params.search) q.set('search', params.search)
    if (params.unreadOnly) q.set('unreadOnly', '1')
    if (params.limit != null) q.set('limit', String(params.limit))
    if (params.offset != null) q.set('offset', String(params.offset))
    const qs = q.toString()
    const data = await request<unknown>(`/api/inbox${qs ? `?${qs}` : ''}`)
    const o = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const list = Array.isArray(o.messages) ? o.messages : []
    const items = list.map(parseInboxMessage)
    const paged = buildPaginated(
      items,
      Number(o.total ?? items.length),
      Number(o.limit ?? params.limit ?? 30),
      Number(o.offset ?? params.offset ?? 0),
    )
    return { ...paged, unread: Number(o.unread ?? 0) }
  },

  async getInboxConversation(accountId: string, phone: string) {
    const data = await request<Record<string, unknown>>(
      `/api/inbox/conversation/${encodeURIComponent(accountId)}/${encodeURIComponent(phone)}`,
    )
    const list = Array.isArray(data.messages) ? data.messages : []
    return list.map(parseInboxMessage)
  },

  markInboxRead(ids: number[]) {
    return request<Record<string, unknown>>('/api/inbox/read', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
  },

  replyInbox(accountId: string, phoneNumber: string, message: string) {
    return request<Record<string, unknown>>('/api/inbox/reply', {
      method: 'POST',
      body: JSON.stringify({ accountId, phoneNumber, message }),
    })
  },

  async listAutoReplies(accountId?: string): Promise<AutoReplyRule[]> {
    const q = accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''
    const data = await request<Record<string, unknown>>(`/api/auto-replies${q}`)
    const list = Array.isArray(data.rules) ? data.rules : []
    return list.map(parseAutoReply)
  },

  createAutoReply(body: {
    accountId?: string
    keyword?: string
    matchType?: string
    replyText: string
    enabled?: boolean
  }) {
    return request<{ rule: AutoReplyRule }>('/api/auto-replies', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateAutoReply(id: number, body: Partial<AutoReplyRule>) {
    return request<{ rule: AutoReplyRule }>(`/api/auto-replies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        accountId: body.accountId,
        keyword: body.keyword,
        matchType: body.matchType,
        replyText: body.replyText,
        enabled: body.enabled,
      }),
    })
  },

  deleteAutoReply(id: number) {
    return request<Record<string, unknown>>(`/api/auto-replies/${id}`, { method: 'DELETE' })
  },

  async listApiKeys(): Promise<ApiKeyRecord[]> {
    const data = await request<Record<string, unknown>>('/api/integrations/api-keys')
    const list = Array.isArray(data.keys) ? data.keys : []
    return list.map((k) => {
      const row = k as Record<string, unknown>
      return {
        id: Number(row.id),
        name: String(row.name ?? ''),
        keyPrefix: String(row.keyPrefix ?? row.key_prefix ?? ''),
        lastUsedAt: row.lastUsedAt != null ? String(row.lastUsedAt) : null,
        expiresAt: row.expiresAt != null ? String(row.expiresAt) : null,
        createdAt: row.createdAt != null ? String(row.createdAt) : undefined,
      }
    })
  },

  createApiKey(name: string, expiresAt?: string) {
    return request<{ key: { id: number; name: string; keyPrefix: string; secret: string } }>(
      '/api/integrations/api-keys',
      { method: 'POST', body: JSON.stringify({ name, expiresAt }) },
    )
  },

  deleteApiKey(id: number) {
    return request<Record<string, unknown>>(`/api/integrations/api-keys/${id}`, {
      method: 'DELETE',
    })
  },

  async listWebhooks(): Promise<{ webhooks: WebhookRecord[]; validEvents: string[] }> {
    const data = await request<Record<string, unknown>>('/api/integrations/webhooks')
    const list = Array.isArray(data.webhooks) ? data.webhooks : []
    return {
      webhooks: list.map((h) => {
        const row = h as Record<string, unknown>
        return {
          id: Number(row.id),
          url: String(row.url ?? ''),
          events: Array.isArray(row.events) ? row.events.map(String) : [],
          enabled: !!row.enabled,
          hasSecret: !!row.hasSecret,
          createdAt: row.createdAt != null ? String(row.createdAt) : undefined,
        }
      }),
      validEvents: Array.isArray(data.validEvents) ? data.validEvents.map(String) : [],
    }
  },

  createWebhook(body: { url: string; events: string[]; secret?: string; enabled?: boolean }) {
    return request<Record<string, unknown>>('/api/integrations/webhooks', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateWebhook(id: number, body: Partial<{ url: string; events: string[]; secret: string; enabled: boolean }>) {
    return request<Record<string, unknown>>(`/api/integrations/webhooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  deleteWebhook(id: number) {
    return request<Record<string, unknown>>(`/api/integrations/webhooks/${id}`, {
      method: 'DELETE',
    })
  },

  async getQuota(): Promise<UserQuota> {
    const data = await request<Record<string, unknown>>('/api/integrations/quota')
    const q = (data.quota ?? {}) as Record<string, unknown>
    return {
      dailyMessageLimit: Number(q.dailyMessageLimit ?? q.daily_message_limit ?? 1000),
      dailyCheckLimit: Number(q.dailyCheckLimit ?? q.daily_check_limit ?? 500),
      messagesSentToday: Number(q.messagesSentToday ?? q.messages_sent_today ?? 0),
      checksToday: Number(q.checksToday ?? q.checks_today ?? 0),
      quotaResetDate: q.quotaResetDate != null ? String(q.quotaResetDate) : null,
    }
  },

  updateQuota(body: { dailyMessageLimit?: number; dailyCheckLimit?: number }) {
    return request<{ quota: UserQuota }>('/api/integrations/quota', {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },
}

function parseCampaign(raw: unknown): CampaignRecord {
  const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    id: Number(c.id),
    name: String(c.name ?? ''),
    accountId: String(c.accountId ?? c.account_id ?? ''),
    groupId: c.groupId != null ? Number(c.groupId) : c.group_id != null ? Number(c.group_id) : null,
    groupName: c.groupName != null ? String(c.groupName) : c.group_name != null ? String(c.group_name) : null,
    messageText: String(c.messageText ?? c.message_text ?? ''),
    delayMs: Number(c.delayMs ?? c.delay_ms ?? 3000),
    status: String(c.status ?? 'pending') as CampaignRecord['status'],
    totalRecipients: Number(c.totalRecipients ?? c.total_recipients ?? 0),
    successCount: Number(c.successCount ?? c.success_count ?? 0),
    failureCount: Number(c.failureCount ?? c.failure_count ?? 0),
    templateId: c.templateId != null ? Number(c.templateId) : c.template_id != null ? Number(c.template_id) : null,
    scheduledAt: c.scheduledAt != null ? String(c.scheduledAt) : c.scheduled_at != null ? String(c.scheduled_at) : null,
    createdAt: c.createdAt != null ? String(c.createdAt) : undefined,
    completedAt: c.completedAt != null ? String(c.completedAt) : c.completed_at != null ? String(c.completed_at) : null,
  }
}

function parseTemplate(raw: unknown): MessageTemplate {
  const t = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    id: Number(t.id),
    name: String(t.name ?? ''),
    body: String(t.body ?? ''),
    createdAt: t.createdAt != null ? String(t.createdAt) : undefined,
    updatedAt: t.updatedAt != null ? String(t.updatedAt) : undefined,
  }
}

function parseInboxMessage(raw: unknown): InboxMessage {
  const m = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    id: Number(m.id),
    accountId: String(m.accountId ?? m.account_id ?? ''),
    phoneNumber: String(m.phoneNumber ?? m.phone_number ?? ''),
    contactName: m.contactName != null ? String(m.contactName) : m.contact_name != null ? String(m.contact_name) : null,
    body: String(m.body ?? ''),
    direction: (m.direction === 'out' ? 'out' : 'in') as InboxMessage['direction'],
    isRead: !!(m.isRead ?? m.is_read),
    createdAt: m.createdAt != null ? String(m.createdAt) : undefined,
  }
}

function parseAutoReply(raw: unknown): AutoReplyRule {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    id: Number(r.id),
    accountId: r.accountId != null ? String(r.accountId) : r.account_id != null ? String(r.account_id) : null,
    keyword: r.keyword != null ? String(r.keyword) : null,
    matchType: String(r.matchType ?? r.match_type ?? 'contains') as AutoReplyRule['matchType'],
    replyText: String(r.replyText ?? r.reply_text ?? ''),
    enabled: !!(r.enabled ?? true),
    createdAt: r.createdAt != null ? String(r.createdAt) : undefined,
    updatedAt: r.updatedAt != null ? String(r.updatedAt) : undefined,
  }
}
