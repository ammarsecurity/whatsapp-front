export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'unknown'

export interface ParsedAccountStatus {
  state: ConnectionState
  label: string
  raw: Record<string, unknown>
}

const CONNECTING_VALUES = new Set([
  'connecting',
  'pairing',
  'loading',
  'qr',
  'qrcode',
  'pending',
  'initializing',
  'authenticated',
])

const DISCONNECTED_VALUES = new Set([
  'disconnected',
  'close',
  'closed',
  'offline',
  'logout',
  'unpaired',
  'logged_out',
  'failed',
])

function norm(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function boolFlag(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return null
}

function labelsFor(state: ConnectionState, extra?: string): string {
  if (extra) return extra
  switch (state) {
    case 'connected':
      return 'جاهز للإرسال'
    case 'connecting':
      return 'جارٍ الربط…'
    case 'disconnected':
      return 'غير مرتبط'
    default:
      return 'غير معروف'
  }
}

function pickSource(raw: Record<string, unknown>): Record<string, unknown> {
  const nestedCandidates = [raw.status, raw.data, raw.account, raw.instance, raw.session]
  const nested = nestedCandidates.find((v) => v && typeof v === 'object') as
    | Record<string, unknown>
    | undefined
  return nested ? { ...raw, ...nested } : raw
}

export function parseAccountStatus(data: unknown): ParsedAccountStatus {
  const raw =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const src = pickSource(raw)

  const status = norm(src.status)
  const liveState = norm(src.liveState ?? src.state)
  const inMemory = boolFlag(src.inMemory)
  const sessionActive = boolFlag(src.sessionActive)
  const needsQr = src.needsQr === true
  const ready = boolFlag(src.ready) === true || boolFlag(src.isReady) === true

  if (inMemory === false || sessionActive === false) {
    return {
      state: 'disconnected',
      label: needsQr || status === 'qr' ? 'يحتاج مسح QR' : labelsFor('disconnected'),
      raw,
    }
  }

  if (status === 'ready') {
    return { state: 'connected', label: labelsFor('connected'), raw }
  }

  if (status === 'qr' || needsQr || liveState === 'qr') {
    return { state: 'connecting', label: 'يحتاج مسح QR', raw }
  }

  if (CONNECTING_VALUES.has(status) || CONNECTING_VALUES.has(liveState)) {
    return { state: 'connecting', label: labelsFor('connecting'), raw }
  }

  if (DISCONNECTED_VALUES.has(status) || DISCONNECTED_VALUES.has(liveState)) {
    return { state: 'disconnected', label: labelsFor('disconnected'), raw }
  }

  if (ready && (!status || status === 'ready')) {
    return { state: 'connected', label: labelsFor('connected'), raw }
  }

  if (raw.success === true && typeof raw.message === 'string') {
    const msg = norm(raw.message)
    if (CONNECTING_VALUES.has(msg)) {
      return { state: 'connecting', label: labelsFor('connecting'), raw }
    }
    if (DISCONNECTED_VALUES.has(msg)) {
      return { state: 'disconnected', label: labelsFor('disconnected'), raw }
    }
  }

  return { state: 'unknown', label: labelsFor('unknown'), raw }
}

export function isAccountConnected(data: unknown): boolean {
  return parseAccountStatus(data).state === 'connected'
}

/** True only when the WhatsApp session is live and ready to send. */
export function isAccountReady(data: unknown): boolean {
  const parsed = parseAccountStatus(data)
  if (parsed.state !== 'connected') return false
  const raw = parsed.raw
  const status = String(raw.status ?? '').trim().toLowerCase()
  if (status && status !== 'ready') return false
  if (raw.inMemory === false) return false
  if (raw.sessionActive === false) return false
  return true
}
