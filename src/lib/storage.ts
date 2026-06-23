import type { AuthUser } from './user'

const TOKEN_KEY = 'wa_token'
const API_URL_KEY = 'wa_api_url'
const ACCOUNT_KEY = 'wa_account_id'
const USER_KEY = 'wa_user'

export const DEFAULT_API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ||
  'http://74.50.65.142:8489'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function setUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getApiUrl(): string {
  return localStorage.getItem(API_URL_KEY) || DEFAULT_API_URL
}

export function setApiUrl(url: string): void {
  localStorage.setItem(API_URL_KEY, url.replace(/\/$/, ''))
}

export function getAccountId(): string {
  return localStorage.getItem(ACCOUNT_KEY) || 'ibsprimary'
}

export function setAccountId(id: string): void {
  localStorage.setItem(ACCOUNT_KEY, id)
}
