import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[32px] font-bold leading-tight text-text">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[15px] text-muted">{description}</p>
        )}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </header>
  )
}

export function KpiCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}) {
  const tones = {
    neutral: 'text-text',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  }
  return (
    <div className="rounded-[16px] bg-white p-6 shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className={`mt-2 truncate text-2xl font-semibold ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
    </div>
  )
}

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-[16px] bg-white p-1 shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`min-h-11 flex-1 rounded-[14px] px-4 text-[15px] font-semibold transition-colors ${
            value === tab.id
              ? 'bg-primary-50 text-primary-700'
              : 'text-muted hover:bg-slate-50 hover:text-text'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
