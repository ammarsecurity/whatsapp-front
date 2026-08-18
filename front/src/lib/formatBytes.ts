export function formatMb(mb: number | null | undefined, digits = 1): string {
  if (mb == null || !Number.isFinite(mb)) return '—'
  return `${mb.toFixed(digits)} MB`
}

export function percentBarColor(percent: number): string {
  if (percent >= 90) return 'bg-red-500'
  if (percent >= 75) return 'bg-amber-500'
  return 'bg-wa-green'
}
