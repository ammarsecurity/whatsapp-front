export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token?: string
  accessToken?: string
  message?: string
  [key: string]: unknown
}

export interface AddAccountRequest {
  accountId: string
}

export interface CheckNumberRequest {
  accountId: string
  phoneNumber: string
}

export interface SendMessageRequest {
  accountId: string
  message: string
  phoneNumbers: string[]
}

export type ApiError = {
  message: string
  status?: number
}
