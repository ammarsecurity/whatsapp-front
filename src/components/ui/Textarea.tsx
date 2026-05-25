import type { TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
}

export function Textarea({ label, hint, className = '', ...props }: TextareaProps) {
  return (
    <label className="block space-y-1.5">
      {label && (
        <span className="text-sm font-medium text-muted">{label}</span>
      )}
      <textarea
        className={`w-full resize-y rounded-lg border border-border bg-panel px-3.5 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted/60 focus:border-wa-green focus:ring-1 focus:ring-wa-green/30 ${className}`}
        {...props}
      />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </label>
  )
}
