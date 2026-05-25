import { CheckCircle2, Loader2, Wifi, WifiOff } from 'lucide-react'
import type { ConnectionState } from '../lib/accountStatus'

const styles: Record<
  ConnectionState,
  { className: string; icon: typeof Wifi }
> = {
  connected: {
    className: 'bg-wa-green/20 text-wa-green border-wa-green/30',
    icon: CheckCircle2,
  },
  connecting: {
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    icon: Loader2,
  },
  disconnected: {
    className: 'bg-red-500/10 text-red-300 border-red-500/30',
    icon: WifiOff,
  },
  unknown: {
    className: 'bg-border/40 text-muted border-border',
    icon: Wifi,
  },
}

export function ConnectionBadge({
  state,
  label,
  polling,
}: {
  state: ConnectionState
  label: string
  polling?: boolean
}) {
  const { className, icon: Icon } = styles[state]
  const spin = state === 'connecting' || polling

  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-3 ${className}`}
      role="status"
    >
      <Icon className={`h-5 w-5 shrink-0 ${spin ? 'animate-spin' : ''}`} />
      <p className="text-sm font-semibold">{label}</p>
    </div>
  )
}
