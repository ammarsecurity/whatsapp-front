export interface WaAccount {
  accountId: string
  status?: string
  phone?: string
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
