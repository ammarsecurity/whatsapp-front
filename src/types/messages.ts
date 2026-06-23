export interface MessageHistoryFilters {
  accountId?: string
  phoneNumber?: string
  status?: 'pending' | 'sent' | 'failed'
  limit?: number
  offset?: number
}

export interface SendMediaRequest {
  accountId: string
  phoneNumbers: string[]
  file: File
  mediaType?: 'image' | 'document' | 'audio' | 'video'
  caption?: string
}

export interface MessageRecord {
  id: number
  accountId: string
  phoneNumber: string
  messageType: string
  messageText: string
  status: string
  createdAt?: string
  sentAt?: string
  errorMessage?: string | null
  mediaFileName?: string | null
}

export interface MessageStatistics {
  total: number
  sent: number
  failed: number
  pending: number
}
