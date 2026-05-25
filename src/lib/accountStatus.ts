export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'unknown'

export interface ParsedAccountStatus {
  state: ConnectionState
  label: string
  raw: Record<string, unknown>
}

const CONNECTED_VALUES = new Set([
  'connected',
  'open',
  'ready',
  'online',
  'authenticated',
  'logged_in',
  'loggedin',
  'active',
])

const CONNECTING_VALUES = new Set([
  'connecting',
  'pairing',
  'loading',
  'qr',
  'qrcode',
  'pending',
])

function norm(value: unknown): string {
  return String(value).trim().toLowerCase()
}

function boolConnected(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return null
}

function stateFromString(value: string): ConnectionState | null {
  if (CONNECTED_VALUES.has(value)) return 'connected'
  if (CONNECTING_VALUES.has(value)) return 'connecting'
  if (
    ['disconnected', 'close', 'closed', 'offline', 'logout', 'unpaired'].includes(
      value,
    )
  ) {
    return 'disconnected'
  }
  return null
}

function labelsFor(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting…'
    case 'disconnected':
      return 'Disconnected'
    default:
      return 'Unknown'
  }
}

export function parseAccountStatus(data: unknown): ParsedAccountStatus {
  const raw =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : {}

  const nestedCandidates = [
    raw.status,
    raw.data,
    raw.account,
    raw.instance,
    raw.session,
  ]
  const nested = nestedCandidates.find(
    (v) => v && typeof v === 'object',
  ) as Record<string, unknown> | undefined

  const sources = [raw, nested].filter(Boolean) as Record<string, unknown>[]

  for (const src of sources) {
    for (const key of [
      'connected',
      'isConnected',
      'isReady',
      'ready',
      'authenticated',
      'loggedIn',
    ]) {
      const b = boolConnected(src[key])
      if (b === true) {
        return { state: 'connected', label: 'Connected', raw }
      }
      if (b === false && key === 'connected') {
        return { state: 'disconnected', label: 'Disconnected', raw }
      }
    }

    for (const key of [
      'status',
      'state',
      'connectionState',
      'connection',
      'connectionStatus',
      'linkStatus',
      'sessionState',
    ]) {
      const val = src[key]
      if (typeof val === 'string') {
        const s = stateFromString(norm(val))
        if (s) {
          return { state: s, label: labelsFor(s), raw }
        }
      }
    }
  }

  if (raw.success === true && typeof raw.message === 'string') {
    const s = stateFromString(norm(raw.message))
    if (s) {
      return { state: s, label: labelsFor(s), raw }
    }
  }

  return { state: 'unknown', label: 'Unknown', raw }
}

export function isAccountConnected(data: unknown): boolean {
  return parseAccountStatus(data).state === 'connected'
}
