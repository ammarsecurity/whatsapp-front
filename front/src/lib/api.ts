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
  MessageTemplate,
  OptOutEntry,
  UserQuota,
  WebhookRecord,
} from '../types/features'
import type { PaginatedResult } from './pagination'
import { buildPaginated } from './pagination'
import { getApiUrl, getToken } from './storage'
import type {
  AccountLicense,
  BillingEligibility,
  BillingPlan,
  CheckoutResult,
  GatewayEnvSecrets,
  GatewaySettings,
  PaymentMethod,
  PaymentTransactionRow,
} from '../types/billing'

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
  if (status === 403) {
    const body =
      data && typeof data === 'object'
        ? (data as Record<string, unknown>)
        : null
    const code = String(body?.code || body?.error || '')
    if (code === 'SUBSCRIPTION_REQUIRED') {
      return 'ادفع خطة شهرية أو سنوية قبل إضافة حساب واتساب.'
    }
    if (code === 'SUBSCRIPTION_EXPIRED') {
      return 'انتهى اشتراك هذا الحساب. جدّد الخطة من صفحة الاشتراك.'
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

  addAccount(body: AddAccountRequest = {}) {
    return request<{
      success?: boolean
      accountId?: string
      note?: string
      token?: string | null
      keyPrefix?: string | null
    }>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateAccountNote(accountId: string, note: string) {
    return request<{ accountId: string; note: string }>(
      `/api/accounts/${encodeURIComponent(accountId)}`,
      { method: 'PATCH', body: JSON.stringify({ note }) },
    )
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
      started: !!data.started,
      status: data.status != null ? String(data.status) : undefined,
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
        accountId: row.accountId != null ? String(row.accountId) : row.account_id != null ? String(row.account_id) : null,
        token: row.token != null ? String(row.token) : row.token_plain != null ? String(row.token_plain) : null,
        lastUsedAt: row.lastUsedAt != null ? String(row.lastUsedAt) : null,
        expiresAt: row.expiresAt != null ? String(row.expiresAt) : null,
        createdAt: row.createdAt != null ? String(row.createdAt) : undefined,
      }
    })
  },

  createApiKey(name: string, expiresAt?: string, accountId?: string) {
    return request<{
      key: {
        id: number
        name: string
        keyPrefix: string
        accountId?: string | null
        secret: string
      }
    }>(
      '/api/integrations/api-keys',
      { method: 'POST', body: JSON.stringify({ name, expiresAt, accountId }) },
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

  async billingPlans(): Promise<BillingPlan[]> {
    const data = await request<{ plans?: unknown[] }>('/api/billing/plans')
    return (data.plans || []).map(parseBillingPlan)
  },

  async billingMethods(): Promise<PaymentMethod[]> {
    const data = await request<{ methods?: unknown[] }>('/api/billing/methods')
    return (data.methods || []).map((raw) => {
      const m = raw as Record<string, unknown>
      return {
        id: String(m.id) as PaymentMethod['id'],
        name: String(m.name ?? ''),
        minIqd: Number(m.minIqd ?? 0),
      }
    })
  },

  async billingEligibility(): Promise<BillingEligibility> {
    const data = await request<Record<string, unknown>>('/api/billing/eligibility')
    return {
      canAddAccount: !!data.canAddAccount,
      needsPayment: !!data.needsPayment,
      unusedLicense: data.unusedLicense
        ? parseLicense(data.unusedLicense)
        : null,
      adminBypass: !!data.adminBypass,
    }
  },

  async billingLicenses(): Promise<AccountLicense[]> {
    const data = await request<{ licenses?: unknown[] }>('/api/billing/licenses')
    return (data.licenses || []).map(parseLicense)
  },

  checkout(body: { planId: number; gateway: 'wayl' | 'fynexpay' }) {
    return request<CheckoutResult>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  reconcileOrder(orderId: number) {
    return request<{
      success: boolean
      paid: boolean
      order?: unknown
      license?: AccountLicense | null
      status?: string
    }>(`/api/billing/reconcile/${orderId}`, { method: 'POST' })
  },

  async adminBillingPlans(): Promise<BillingPlan[]> {
    const data = await request<{ plans?: unknown[] }>('/api/admin/billing/plans')
    return (data.plans || []).map(parseBillingPlan)
  },

  createBillingPlan(body: Partial<BillingPlan> & { name: string }) {
    return request<{ plan: BillingPlan }>('/api/admin/billing/plans', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateBillingPlan(id: number, body: Partial<BillingPlan>) {
    return request<{ plan: BillingPlan }>(`/api/admin/billing/plans/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  deleteBillingPlan(id: number) {
    return request<Record<string, unknown>>(`/api/admin/billing/plans/${id}`, {
      method: 'DELETE',
    })
  },

  async adminGatewaySettings(provider: 'wayl' | 'fynexpay'): Promise<GatewaySettings> {
    const data = await request<{ settings: Record<string, unknown> }>(
      `/api/admin/payment-gateways/${provider}`,
    )
    return parseGateway(data.settings)
  },

  async saveGatewaySettings(provider: 'wayl' | 'fynexpay', body: Record<string, unknown>) {
    const data = await request<{ settings: Record<string, unknown> }>(
      `/api/admin/payment-gateways/${provider}`,
      { method: 'PUT', body: JSON.stringify(body) },
    )
    return { settings: parseGateway(data.settings) }
  },

  testGatewayConnection(provider: 'wayl' | 'fynexpay', body: Record<string, unknown> = {}) {
    return request<{ success: boolean; ok: boolean }>(
      `/api/admin/payment-gateways/${provider}/test-connection`,
      { method: 'POST', body: JSON.stringify(body) },
    )
  },

  async adminPaymentTransactions(): Promise<PaymentTransactionRow[]> {
    const data = await request<{ transactions?: unknown[] }>(
      '/api/admin/payment-transactions',
    )
    return (data.transactions || []).map((raw) => {
      const t = raw as Record<string, unknown>
      return {
        id: Number(t.id),
        billingOrderId: Number(t.billingOrderId ?? t.billing_order_id),
        gateway: String(t.gateway ?? ''),
        referenceId: String(t.referenceId ?? t.reference_id ?? ''),
        externalId: t.externalId != null ? String(t.externalId) : null,
        amountIqd: t.amountIqd != null ? Number(t.amountIqd) : null,
        status: t.status != null ? String(t.status) : null,
        createdAt: t.createdAt != null ? String(t.createdAt) : undefined,
        userId: t.userId != null ? Number(t.userId) : undefined,
        username: t.username != null ? String(t.username) : null,
        planName: t.planName != null ? String(t.planName) : null,
        paymentStatus: t.paymentStatus != null ? String(t.paymentStatus) : null,
      }
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

function parseBillingPlan(raw: unknown): BillingPlan {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    id: Number(p.id),
    name: String(p.name ?? ''),
    billingCycle: (p.billingCycle === 'yearly' ? 'yearly' : 'monthly') as BillingPlan['billingCycle'],
    priceIqd: Number(p.priceIqd ?? p.price_iqd ?? 0),
    description: String(p.description ?? ''),
    isActive: !!(p.isActive ?? p.is_active ?? true),
    sortOrder: Number(p.sortOrder ?? p.sort_order ?? 0),
  }
}

function parseLicense(raw: unknown): AccountLicense {
  const l = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    id: Number(l.id),
    userId: Number(l.userId ?? l.user_id ?? 0),
    planId: l.planId != null ? Number(l.planId) : l.plan_id != null ? Number(l.plan_id) : null,
    billingOrderId:
      l.billingOrderId != null
        ? Number(l.billingOrderId)
        : l.billing_order_id != null
          ? Number(l.billing_order_id)
          : null,
    accountId:
      l.accountId != null
        ? String(l.accountId)
        : l.account_id != null
          ? String(l.account_id)
          : null,
    status: String(l.status ?? 'active') as AccountLicense['status'],
    startsAt: String(l.startsAt ?? l.starts_at ?? ''),
    expiresAt: String(l.expiresAt ?? l.expires_at ?? ''),
    planName: l.planName != null ? String(l.planName) : null,
    billingCycle: l.billingCycle != null ? String(l.billingCycle) : null,
  }
}

function parseGatewayEnv(raw: unknown): GatewayEnvSecrets {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const apiKey = String(o.apiKey ?? '')
  const merchantToken = String(o.merchantToken ?? '')
  const webhookSecret = String(o.webhookSecret ?? '')
  return {
    hasApiKey: !!o.hasApiKey || !!apiKey,
    hasMerchantToken: !!o.hasMerchantToken || !!merchantToken,
    hasWebhookSecret: !!o.hasWebhookSecret || !!webhookSecret,
    apiKey,
    merchantToken,
    webhookSecret,
  }
}

function parseGateway(raw: Record<string, unknown>): GatewaySettings {
  const test = parseGatewayEnv(raw.test)
  const live = parseGatewayEnv(raw.live)
  return {
    isEnabled: !!raw.isEnabled,
    baseUrl: String(raw.baseUrl ?? ''),
    environment: String(raw.environment ?? 'test'),
    hasApiKey: !!raw.hasApiKey,
    hasMerchantToken: !!raw.hasMerchantToken,
    hasWebhookSecret: !!raw.hasWebhookSecret,
    apiKey: String(raw.apiKey ?? ''),
    merchantToken: String(raw.merchantToken ?? ''),
    webhookSecret: String(raw.webhookSecret ?? ''),
    test,
    live,
    redirectUrl: String(raw.redirectUrl ?? ''),
    webhookUrl: String(raw.webhookUrl ?? ''),
    suggestedWebhookUrl: String(raw.suggestedWebhookUrl ?? ''),
    suggestedRedirectUrl: String(raw.suggestedRedirectUrl ?? ''),
    readyForCheckout: !!raw.readyForCheckout,
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : undefined,
  }
}
