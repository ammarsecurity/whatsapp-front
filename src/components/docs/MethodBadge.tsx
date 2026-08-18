import type { HttpMethod } from '../../data/apiDocs'

const styles: Record<HttpMethod, string> = {
  GET: 'bg-amber-50 text-amber-800',
  POST: 'bg-emerald-50 text-emerald-800',
  PUT: 'bg-sky-50 text-sky-800',
  PATCH: 'bg-violet-50 text-violet-800',
  DELETE: 'bg-red-50 text-red-800',
}

export function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-[10px] px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide ${styles[method]}`}
    >
      {method}
    </span>
  )
}
