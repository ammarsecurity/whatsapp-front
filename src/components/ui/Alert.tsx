import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import type { ReactNode } from 'react'

export type AlertVariant = 'success' | 'error' | 'info' | 'warning'

const config: Record<
  AlertVariant,
  {
    accent: string
    iconBg: string
    iconColor: string
    Icon: typeof CheckCircle2
  }
> = {
  success: {
    accent: 'bg-success',
    iconBg: 'bg-green-50',
    iconColor: 'text-success',
    Icon: CheckCircle2,
  },
  error: {
    accent: 'bg-danger',
    iconBg: 'bg-red-50',
    iconColor: 'text-danger',
    Icon: AlertCircle,
  },
  warning: {
    accent: 'bg-warning',
    iconBg: 'bg-amber-50',
    iconColor: 'text-warning',
    Icon: AlertCircle,
  },
  info: {
    accent: 'bg-primary-500',
    iconBg: 'bg-primary-50',
    iconColor: 'text-primary-700',
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
  const { accent, iconBg, iconColor, Icon } = config[variant]

  return (
    <div
      className={`relative overflow-hidden rounded-[16px] bg-white shadow-[0px_1px_3px_rgba(15,23,42,0.08)] ${className}`}
      role="alert"
    >
      <div className={`absolute inset-y-0 end-0 w-[3px] ${accent}`} />
      <div className="flex gap-4 px-4 py-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${iconBg}`}
        >
          <Icon className={`h-5 w-5 ${iconColor}`} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          {title && (
            <p className="text-[15px] font-semibold leading-snug text-text">{title}</p>
          )}
          <div className={`text-[15px] leading-relaxed text-muted ${title ? 'mt-1' : ''}`}>
            {children}
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-muted hover:bg-slate-100 hover:text-text"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
