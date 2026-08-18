const DATE_LOCALE = 'en-GB'
const NUMBER_LOCALE = 'en-US'

export function formatNumber(value: number) {
  return new Intl.NumberFormat(NUMBER_LOCALE).format(value)
}

export function formatIqd(value: number) {
  return `${formatNumber(value)} IQD`
}

export function formatDate(value: string | Date) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(DATE_LOCALE)
}

export function formatDateTime(value: string | Date) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(DATE_LOCALE, { hour12: false })
}
