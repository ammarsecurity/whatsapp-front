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

export function accountStatusLabel(acc: {
  status?: string
  isReady?: boolean
  isConnected?: boolean
  ready?: boolean
  connected?: boolean
}): { label: string; tone: 'ready' | 'connecting' | 'offline' | 'unknown' } {
  const status = String(acc.status ?? '').toLowerCase()
  if (status === 'ready' || acc.isReady || acc.ready) {
    return { label: 'Ready to send', tone: 'ready' }
  }
  if (['qr', 'loading', 'initializing', 'authenticated'].includes(status)) {
    return { label: 'Connecting…', tone: 'connecting' }
  }
  if (['logged_out', 'failed', 'disconnected'].includes(status)) {
    return { label: 'Not linked', tone: 'offline' }
  }
  if (acc.isConnected || acc.connected) {
    return { label: 'Connected', tone: 'ready' }
  }
  return { label: 'Not linked', tone: 'offline' }
}

export const ACCOUNT_STATUS_STYLES = {
  ready: 'bg-wa-green/20 text-wa-green',
  connecting: 'bg-amber-500/15 text-amber-300',
  offline: 'bg-red-500/10 text-red-300',
  unknown: 'bg-border/50 text-muted',
} as const
