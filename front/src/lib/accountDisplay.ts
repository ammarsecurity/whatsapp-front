import type { ParsedAccountStatus } from './accountStatus'
import { isAccountReady } from './accountStatus'

/** Turn a friendly name into a valid account slug for the API. */
export function slugifyAccountName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32)
  return slug || 'whatsapp'
}

/** Show a friendly note when set; otherwise the technical account id. */
export function formatAccountLabel(accountId: string, note?: string | null): string {
  const label = String(note || '').trim()
  if (label) return label
  if (!accountId.trim()) return 'حساب بدون اسم'
  if (/^wa_[a-f0-9]+$/i.test(accountId)) return accountId
  return accountId
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function accountTitle(acc: { accountId: string; note?: string | null } | null | undefined): string {
  if (!acc) return 'حساب بدون اسم'
  return formatAccountLabel(acc.accountId, acc.note)
}

export function sameAccountId(a?: string | null, b?: string | null): boolean {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
}

export type AccountStatusMeta = {
  label: string
  tone: 'ready' | 'connecting' | 'offline' | 'unknown'
}

export function accountStatusLabel(acc: {
  status?: string
  liveState?: string
  isReady?: boolean
  isConnected?: boolean
  ready?: boolean
  connected?: boolean
}): AccountStatusMeta {
  const status = String(acc.status ?? '').toLowerCase()
  const liveState = String(acc.liveState ?? '').toLowerCase()

  if (['qr', 'loading', 'initializing', 'authenticated'].includes(status)) {
    return status === 'qr'
      ? { label: 'يحتاج مسح QR', tone: 'connecting' }
      : { label: 'جارٍ الربط…', tone: 'connecting' }
  }

  if (['opening', 'pairing', 'timeout', 'conflict'].includes(liveState)) {
    return { label: 'جارٍ الربط…', tone: 'connecting' }
  }

  if (status === 'ready') {
    return { label: 'جاهز للإرسال', tone: 'ready' }
  }

  if (['logged_out', 'failed', 'disconnected'].includes(status)) {
    return { label: 'غير مرتبط', tone: 'offline' }
  }

  if (
    ['unpaired', 'unlaunched', 'close', 'closed', 'offline', 'logout'].includes(
      liveState,
    )
  ) {
    return { label: 'غير مرتبط', tone: 'offline' }
  }

  // Do not trust stale DB isReady — only live status === ready means sendable.
  return { label: 'غير مرتبط', tone: 'offline' }
}

/** Prefer live poll data; fall back to list entry when poll is unavailable. */
export function liveStatusDisplayMeta(
  live: ParsedAccountStatus | null,
  fallback?: Parameters<typeof accountStatusLabel>[0],
): AccountStatusMeta {
  if (live) {
    if (isAccountReady(live.raw)) {
      return { label: 'جاهز للإرسال', tone: 'ready' }
    }
    if (live.state === 'connecting') {
      return { label: live.label || 'جارٍ الربط…', tone: 'connecting' }
    }
    if (live.state === 'disconnected') {
      if (live.raw.needsQr === true || String(live.raw.status ?? '').toLowerCase() === 'qr') {
        return { label: 'يحتاج مسح QR', tone: 'connecting' }
      }
      return { label: live.label || 'غير مرتبط', tone: 'offline' }
    }
    return { label: live.label, tone: 'unknown' }
  }
  if (fallback) return accountStatusLabel(fallback)
  return { label: 'غير معروف', tone: 'unknown' }
}

export const ACCOUNT_STATUS_STYLES = {
  ready: 'bg-emerald-50 text-emerald-700',
  connecting: 'bg-amber-50 text-amber-700',
  offline: 'bg-red-50 text-red-700',
  unknown: 'bg-slate-100 text-slate-600',
} as const

/** Copy for send/campaign screens when the session is not send-ready. */
export function notReadySendHint(state?: 'connected' | 'connecting' | 'disconnected' | 'unknown' | null) {
  if (state === 'connecting') {
    return {
      line: 'جارٍ الربط — انتظر حتى يصبح جاهزاً للإرسال.',
      footer: 'انتظر حتى يصبح الحساب جاهزاً ثم أرسل.',
      action: 'wait' as const,
    }
  }
  return {
    line: 'الحساب غير مرتبط. اربطه بمسح QR.',
    footer: 'اربط الحساب بمسح QR قبل الإرسال.',
    action: 'qr' as const,
  }
}
