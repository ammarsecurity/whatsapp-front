import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

export function CodeBlock({
  code,
  language = 'json',
}: {
  code: string
  language?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border bg-panel/80 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {language}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted transition-colors hover:bg-border/50 hover:text-text"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-wa-green" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="max-h-80 overflow-auto p-3 font-mono text-xs leading-relaxed text-text/90">
        <code>{code}</code>
      </pre>
    </div>
  )
}
