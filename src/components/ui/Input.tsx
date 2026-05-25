import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export function Input({ label, hint, error, className = '', id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <label className="block space-y-1.5">
      {label && (
        <span className="text-sm font-medium text-muted">{label}</span>
      )}
      <input
        id={inputId}
        className={`w-full rounded-lg border bg-panel px-3.5 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted/60 focus:border-wa-green focus:ring-1 focus:ring-wa-green/30 ${
          error ? 'border-red-500' : 'border-border'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
    </label>
  )
}
