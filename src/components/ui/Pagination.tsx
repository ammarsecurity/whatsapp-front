import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination'

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: readonly number[]
  className?: string
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className = '',
}: PaginationProps) {
  if (total === 0) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 pt-4 ${className}`}
    >
      <p className="text-[13px] text-muted">
        عرض {from}–{to} من {total}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-[13px] text-muted">
            لكل صفحة
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="min-h-11 rounded-[14px] border border-border bg-white px-3 text-[15px] text-text"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="flex h-11 w-11 items-center justify-center rounded-[14px] text-muted transition-colors hover:bg-slate-50 hover:text-text disabled:opacity-40"
            aria-label="الصفحة السابقة"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="min-w-[4.5rem] text-center text-[13px] text-muted">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="flex h-11 w-11 items-center justify-center rounded-[14px] text-muted transition-colors hover:bg-slate-50 hover:text-text disabled:opacity-40"
            aria-label="الصفحة التالية"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export { DEFAULT_PAGE_SIZE }
