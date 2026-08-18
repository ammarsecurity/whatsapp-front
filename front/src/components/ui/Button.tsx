import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  children: ReactNode
}

const variants: Record<Variant, string> = {
  primary:
    'bg-primary-500 text-white hover:bg-primary-700 disabled:opacity-50 shadow-sm',
  secondary:
    'bg-white border border-border text-text hover:bg-slate-50 disabled:opacity-50',
  danger:
    'bg-danger text-white hover:bg-red-600 disabled:opacity-50',
  ghost: 'text-muted hover:text-text hover:bg-slate-100',
}

export function Button({
  variant = 'primary',
  loading,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] px-4 py-2.5 text-[15px] font-semibold transition-colors ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}
