export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 20

export interface PaginatedResult<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  page: number
  totalPages: number
}

export function clampLimit(raw: unknown, max = 100): number {
  const n = parseInt(String(raw ?? DEFAULT_PAGE_SIZE), 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE
  return Math.min(max, n)
}

export function clampOffset(raw: unknown): number {
  const n = parseInt(String(raw ?? 0), 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

export function paginateMeta(total: number, limit: number, offset: number) {
  const page = Math.floor(offset / limit) + 1
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1)
  return { page, totalPages }
}

export function buildPaginated<T>(
  items: T[],
  total: number,
  limit: number,
  offset: number,
): PaginatedResult<T> {
  const { page, totalPages } = paginateMeta(total, limit, offset)
  return { items, total, limit, offset, page, totalPages }
}

/** Client-side slice after filter */
export function slicePage<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}

export function filterBySearch<T>(
  items: T[],
  query: string,
  getSearchText: (item: T) => string,
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => getSearchText(item).toLowerCase().includes(q))
}
