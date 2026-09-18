import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* -------------------------------------------------------------------------- */
/* Badge                                                                       */
/* -------------------------------------------------------------------------- */

type BadgeTone =
  | 'neutral'
  | 'positive'
  | 'negative'
  | 'caution'
  | 'info'
  | 'brand'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-600 ring-ink-200',
  positive: 'bg-brand-50 text-brand-700 ring-brand-200',
  negative: 'bg-[var(--color-negative-soft)] text-negative ring-[color-mix(in_oklch,var(--color-negative)_25%,transparent)]',
  caution: 'bg-[var(--color-caution-soft)] text-[color-mix(in_oklch,var(--color-caution)_78%,black)] ring-[color-mix(in_oklch,var(--color-caution)_30%,transparent)]',
  info: 'bg-[var(--color-info-soft)] text-[color-mix(in_oklch,var(--color-info)_85%,black)] ring-[color-mix(in_oklch,var(--color-info)_25%,transparent)]',
  brand: 'bg-brand-100 text-brand-800 ring-brand-200',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot = false,
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
  dot?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
        'text-[11px] font-medium leading-5 ring-1 ring-inset whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {dot && (
        <span
          className="size-1.5 rounded-full bg-current opacity-70"
          aria-hidden
        />
      )}
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'article'
}) {
  return <Tag className={cn('surface', className)}>{children}</Tag>
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-5 py-4 border-b border-ink-200',
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-ink-900 leading-5">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-ink-500 leading-4">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Estados vazios / carregando / erro                                          */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-14 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-3.5 flex size-11 items-center justify-center rounded-xl bg-ink-100 text-ink-400">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-ink-800">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] text-ink-500 leading-5">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-4 space-y-2.5">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton
              key={c}
              className={cn('h-4', c === 0 ? 'w-24' : c === cols - 1 ? 'w-20' : 'flex-1')}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-[var(--color-negative-soft)] text-negative">
        <svg
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink-800">
        Não foi possível carregar
      </p>
      <p className="mt-1 max-w-sm text-[13px] text-ink-500">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 text-[13px] font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2"
        >
          Tentar novamente
        </button>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Barra de progresso                                                          */
/* -------------------------------------------------------------------------- */

export function ProgressBar({
  value,
  tone = 'brand',
  className,
}: {
  /** Percentual de 0 a 100 (valores acima são limitados visualmente). */
  value: number
  tone?: 'brand' | 'negative' | 'caution'
  className?: string
}) {
  const clamped = Math.max(0, Math.min(100, value))
  const colors = {
    brand: 'bg-brand-500',
    negative: 'bg-negative',
    caution: 'bg-[var(--color-caution)]',
  }

  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-ink-200', className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500 ease-out', colors[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
