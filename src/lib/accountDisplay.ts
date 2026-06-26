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

/** Show account slug in a human-readable way (Work Phone, Sales Team). */
export function formatAccountLabel(accountId: string): string {
  if (!accountId.trim()) return 'Unnamed account'
  return accountId
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
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

  if (status === 'ready') {
    return { label: 'Ready to send', tone: 'ready' }
  }

  if (['qr', 'loading', 'initializing', 'authenticated'].includes(status)) {
    return status === 'qr'
      ? { label: 'Needs QR', tone: 'connecting' }
      : { label: 'Connecting…', tone: 'connecting' }
  }

  if (['logged_out', 'failed', 'disconnected'].includes(status)) {
    return { label: 'Not linked', tone: 'offline' }
  }

  if (
    ['unpaired', 'unlaunched', 'close', 'closed', 'offline', 'logout'].includes(
      liveState,
    )
  ) {
    return { label: 'Not linked', tone: 'offline' }
  }

  if (acc.isReady || acc.ready) {
    return { label: 'Ready to send', tone: 'ready' }
  }

  if (acc.isConnected || acc.connected) {
    return { label: 'Connected', tone: 'ready' }
  }

  return { label: 'Not linked', tone: 'offline' }
}

/** Prefer live poll data; fall back to list entry when poll is unavailable. */
export function liveStatusDisplayMeta(
  live: ParsedAccountStatus | null,
  fallback?: Parameters<typeof accountStatusLabel>[0],
): AccountStatusMeta {
  if (live) {
    if (isAccountReady(live.raw)) {
      return { label: 'Ready to send', tone: 'ready' }
    }
    if (live.state === 'connecting') {
      const status = String(live.raw.status ?? '').toLowerCase()
      if (status === 'qr') {
        return { label: 'Needs QR', tone: 'connecting' }
      }
      return { label: 'Connecting…', tone: 'connecting' }
    }
    if (live.state === 'disconnected') {
      return { label: 'Not linked', tone: 'offline' }
    }
    return { label: live.label, tone: 'unknown' }
  }
  if (fallback) return accountStatusLabel(fallback)
  return { label: 'Unknown', tone: 'unknown' }
}

export const ACCOUNT_STATUS_STYLES = {
  ready: 'bg-wa-green/20 text-wa-green',
  connecting: 'bg-amber-500/15 text-amber-300',
  offline: 'bg-red-500/10 text-red-300',
  unknown: 'bg-border/50 text-muted',
} as const
