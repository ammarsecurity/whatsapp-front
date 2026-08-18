import { forwardRef, type TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ label, hint, className = '', ...props }, ref) {
    return (
      <label className="block space-y-2">
        {label && (
          <span className="block text-[15px] font-medium text-text">{label}</span>
        )}
        <textarea
          ref={ref}
          className={`w-full resize-y rounded-[14px] border border-border bg-white px-4 py-2.5 text-[15px] text-text outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${className}`}
          {...props}
        />
        {hint && <p className="text-[13px] text-muted">{hint}</p>}
      </label>
    )
  },
)
