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
  searchPlaceholder = 'بحث…',
  children,
  className = '',
}: ListToolbarProps) {
  return (
    <div className={`mb-4 flex flex-wrap items-end gap-3 ${className}`}>
      <div className="min-w-[180px] flex-1">
        <Input
          label="بحث"
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
        className="min-h-11 w-full rounded-[14px] border border-border bg-white px-4 text-[15px] text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
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
