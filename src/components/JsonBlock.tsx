export function JsonBlock({ data }: { data: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-surface p-3 text-xs leading-relaxed text-muted">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}
