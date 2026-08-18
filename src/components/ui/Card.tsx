import type { ReactNode } from 'react'

interface CardProps {
  title?: string
  description?: string
  children: ReactNode
  className?: string
  action?: ReactNode
  id?: string
}

export function Card({
  title,
  description,
  children,
  className = '',
  action,
  id,
}: CardProps) {
  return (
    <section
      id={id}
      className={`rounded-[16px] border-0 bg-white p-6 shadow-[0px_1px_3px_rgba(15,23,42,0.08)] ${className}`}
    >
      {(title || action) && (
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-lg font-semibold text-text">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-[13px] text-muted">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
