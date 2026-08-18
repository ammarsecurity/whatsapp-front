import { Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from './Button'

export function CopyRow({
  label,
  value,
  className = 'bg-slate-50',
}: {
  label: string
  value: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-[14px] px-4 py-3 ${className}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-muted">{label}</p>
        <p className="mt-1 break-all font-mono text-[13px] font-semibold text-text" dir="ltr">
          {value}
        </p>
      </div>
      <Button variant="secondary" onClick={copy}>
        <Copy className="h-4 w-4" />
        {copied ? 'تم النسخ' : 'نسخ'}
      </Button>
    </div>
  )
}
