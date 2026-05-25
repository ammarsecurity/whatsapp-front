import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import type { ReactNode } from 'react'

export type AlertVariant = 'success' | 'error' | 'info' | 'warning'

const config: Record<
  AlertVariant,
  {
    accent: string
    glow: string
    iconBg: string
    iconColor: string
    border: string
    Icon: typeof CheckCircle2
  }
> = {
  success: {
    accent: 'bg-wa-green',
    glow: 'shadow-[0_0_24px_-6px_rgba(37,211,102,0.35)]',
    iconBg: 'bg-wa-green/15 ring-1 ring-wa-green/25',
    iconColor: 'text-wa-green',
    border: 'border-wa-green/20',
    Icon: CheckCircle2,
  },
  error: {
    accent: 'bg-red-500',
    glow: 'shadow-[0_0_24px_-6px_rgba(239,68,68,0.3)]',
    iconBg: 'bg-red-500/15 ring-1 ring-red-500/25',
    iconColor: 'text-red-400',
    border: 'border-red-500/20',
    Icon: AlertCircle,
  },
  warning: {
    accent: 'bg-amber-500',
    glow: 'shadow-[0_0_24px_-6px_rgba(245,158,11,0.25)]',
    iconBg: 'bg-amber-500/15 ring-1 ring-amber-500/25',
    iconColor: 'text-amber-300',
    border: 'border-amber-500/20',
    Icon: AlertCircle,
  },
  info: {
    accent: 'bg-wa-teal',
    glow: 'shadow-[0_0_20px_-8px_rgba(7,94,84,0.5)]',
    iconBg: 'bg-wa-teal/25 ring-1 ring-border',
    iconColor: 'text-muted',
    border: 'border-border',
    Icon: Info,
  },
}

export function Alert({
  variant = 'info',
  title,
  children,
  onDismiss,
  className = '',
}: {
  variant?: AlertVariant
  title?: string
  children: ReactNode
  onDismiss?: () => void
  className?: string
}) {
  const { accent, glow, iconBg, iconColor, border, Icon } = config[variant]

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-panel/95 backdrop-blur-sm ${border} ${glow} ${className}`}
      role="alert"
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <div className="flex gap-3.5 py-4 pl-4 pr-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
        >
          <Icon className={`h-[18px] w-[18px] ${iconColor}`} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          {title && (
            <p className="text-sm font-semibold leading-snug text-text">{title}</p>
          )}
          <div
            className={`text-sm leading-relaxed text-muted ${title ? 'mt-1' : ''}`}
          >
            {children}
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-card hover:text-text"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
