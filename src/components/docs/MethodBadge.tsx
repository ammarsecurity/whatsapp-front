import type { HttpMethod } from '../../data/apiDocs'

const styles: Record<HttpMethod, string> = {
  GET: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  POST: 'bg-wa-green/15 text-wa-green border-wa-green/30',
  PUT: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  PATCH: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  DELETE: 'bg-red-500/15 text-red-300 border-red-500/30',
}

export function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide ${styles[method]}`}
    >
      {method}
    </span>
  )
}
