import { CheckCircle2, Loader2, Wifi, WifiOff } from 'lucide-react'
import type { ConnectionState } from '../lib/accountStatus'

const styles: Record<
  ConnectionState,
  { className: string; icon: typeof Wifi }
> = {
  connected: {
    className: 'bg-emerald-50 text-emerald-700',
    icon: CheckCircle2,
  },
  connecting: {
    className: 'bg-amber-50 text-amber-700',
    icon: Loader2,
  },
  disconnected: {
    className: 'bg-red-50 text-red-700',
    icon: WifiOff,
  },
  unknown: {
    className: 'bg-slate-100 text-slate-600',
    icon: Wifi,
  },
}

export function ConnectionBadge({
  state,
  label,
}: {
  state: ConnectionState
  label: string
  polling?: boolean
}) {
  const { className, icon: Icon } = styles[state]

  return (
    <div
      className={`flex min-h-11 items-center gap-2 rounded-[14px] px-4 py-2 ${className}`}
      role="status"
    >
      <Icon className="h-5 w-5 shrink-0" />
      <p className="text-[15px] font-semibold">{label}</p>
    </div>
  )
}
