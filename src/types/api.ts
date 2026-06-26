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
  phoneNumbers: string[]
  /** Plain text — omit if using templateId or templateName */
  message?: string
  templateId?: number
  templateName?: string
  templateVars?: Record<string, string>
}

export interface UpdateProfileRequest {
  currentPassword: string
  username?: string
  password?: string
}

export interface UpdateUserRequest {
  username?: string
  password?: string
}

export type ApiError = {
  message: string
  status?: number
}
