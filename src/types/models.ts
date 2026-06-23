export interface WaAccount {
  accountId: string
  status?: string
  phone?: string
  isReady?: boolean
  isConnected?: boolean
  /** GET /status shape */
  connected?: boolean
  ready?: boolean
  qrCode?: string | null
}

/** Admin dashboard — account owned by any user */
export interface AdminWaAccount {
  accountId: string
  userId: number
  ownerUsername?: string | null
  isReady?: boolean
  isConnected?: boolean
  inMemory?: boolean
  hasQrCode?: boolean
  liveState?: string | null
  initError?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface AdminUser {
  userId?: number
  username: string
  role?: string
  isAdmin?: boolean
  createdAt?: string
}

export interface CreateUserRequest {
  username: string
  password: string
  role?: string
}
