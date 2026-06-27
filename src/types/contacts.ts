export interface ContactGroup {
  id: number
  name: string
  description?: string | null
  numberCount: number
  createdAt?: string
  updatedAt?: string
}

export interface ContactGroupNumber {
  id: number
  phoneNumber: string
  label?: string | null
  createdAt?: string
}

export interface CampaignRecord {
  id: number
  name: string
  accountId: string
  groupId?: number | null
  groupName?: string | null
  messageText: string
  delayMs: number
  status: 'pending' | 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled'
  totalRecipients: number
  successCount: number
  failureCount: number
  templateId?: number | null
  scheduledAt?: string | null
  createdAt?: string
  completedAt?: string | null
}

export interface SendCampaignRequest {
  accountId: string
  groupId?: number
  name?: string
  message?: string
  templateId?: number
  templateName?: string
  templateVars?: Record<string, string>
  delayMs?: number
  phoneNumbers?: string[]
  scheduledAt?: string
}

export interface SendCampaignResult {
  campaignId: number
  total: number
  successCount: number
  failureCount: number
  scheduled?: boolean
  scheduledAt?: string
  skippedOptOut?: number
  started?: boolean
  status?: string
  results?: Array<{ phone: string; success: boolean; error?: string }>
}
