export interface MessageTemplate {
  id: number
  name: string
  body: string
  createdAt?: string
  updatedAt?: string
}

export interface OptOutEntry {
  id: number
  phoneNumber: string
  reason?: string | null
  source?: string
  createdAt?: string
}

export interface CampaignRecipient {
  id: number
  phoneNumber: string
  status: 'sent' | 'failed' | 'skipped_opt_out'
  errorMessage?: string | null
  createdAt?: string
}

export interface InboxMessage {
  id: number
  accountId: string
  phoneNumber: string
  contactName?: string | null
  body: string
  direction: 'in' | 'out'
  isRead: boolean
  createdAt?: string
}

export interface AutoReplyRule {
  id: number
  accountId?: string | null
  keyword?: string | null
  matchType: 'exact' | 'contains' | 'any'
  replyText: string
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export interface ApiKeyRecord {
  id: number
  name: string
  keyPrefix: string
  lastUsedAt?: string | null
  expiresAt?: string | null
  createdAt?: string
}

export interface WebhookRecord {
  id: number
  url: string
  events: string[]
  enabled: boolean
  hasSecret?: boolean
  createdAt?: string
}

export interface UserQuota {
  dailyMessageLimit: number
  dailyCheckLimit: number
  messagesSentToday: number
  checksToday: number
  quotaResetDate?: string | null
}

export const WEBHOOK_EVENTS = [
  'message.received',
  'message.sent',
  'campaign.completed',
  'campaign.failed',
  'account.ready',
  'account.disconnected',
] as const
