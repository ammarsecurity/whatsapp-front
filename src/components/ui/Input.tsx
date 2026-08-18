import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export function Input({ label, hint, error, className = '', id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <label className="block space-y-2">
      {label && (
        <span className="block text-[15px] font-medium text-text">{label}</span>
      )}
      <input
        id={inputId}
        className={`min-h-11 w-full rounded-[14px] border bg-white px-4 py-2.5 text-[15px] text-text outline-none transition-colors placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${
          error ? 'border-danger' : 'border-border'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {hint && !error && <p className="text-[13px] text-muted">{hint}</p>}
    </label>
  )
}
