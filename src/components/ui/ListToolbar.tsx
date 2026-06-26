import type { ReactNode } from 'react'
import { Input } from './Input'

interface ListToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  children?: ReactNode
  className?: string
}

export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  children,
  className = '',
}: ListToolbarProps) {
  return (
    <div className={`mb-4 flex flex-wrap items-end gap-3 ${className}`}>
      <div className="min-w-[180px] flex-1">
        <Input
          label="Search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
        />
      </div>
      {children}
    </div>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}

export function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <label className="block min-w-[140px] space-y-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-panel px-3 py-2.5 text-sm text-text outline-none focus:border-wa-green"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function SearchIcon() {
  return null
}
