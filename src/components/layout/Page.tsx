import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Sparkline } from '@/components/ui/Sparkline'

/**
 * Moldura padrão das páginas: título, ações e conteúdo.
 * Mantém o ritmo visual consistente entre telas.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-3 mb-5',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-ink-900">
          {title}
        </h1>
        {description && (
          <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}

/** Área de conteúdo com largura e respiro padronizados. */
export function PageBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('px-4 py-5 sm:px-6 sm:py-6', className)}>{children}</div>
  )
}

/**
 * Cartão de indicador.
 *
 * `delta` mostra a variação em relação ao período anterior; quando ausente,
 * o espaço é reservado com uma linha de contexto para o grid não "pular".
 *
 * O valor pode chegar de duas formas: já formatado em `value`, ou cru em
 * `valueNumber` junto de `format` — nesse caso a transição é animada.
 */
export function StatCard({
  label,
  value,
  valueNumber,
  format,
  context,
  delta,
  tone = 'neutral',
  icon,
  trend,
}: {
  label: string
  /** Valor já formatado. Ignorado quando `valueNumber` e `format` vêm juntos. */
  value?: string
  /** Número cru; com `format`, anima até este valor. */
  valueNumber?: number
  format?: (value: number) => string
  context?: string
  delta?: { value: number; label?: string }
  tone?: 'neutral' | 'positive' | 'negative' | 'brand'
  icon?: ReactNode
  /** Série recente (mínimo 2 pontos) para o traço de tendência. */
  trend?: number[]
}) {
  const animated = valueNumber !== undefined && format !== undefined

  const valueTone = {
    neutral: 'text-ink-900',
    positive: 'text-brand-700',
    negative: 'text-negative',
    brand: 'text-ink-900',
  }[tone]

  const trendColor = {
    neutral: 'var(--color-ink-400)',
    positive: 'var(--color-brand-500)',
    negative: 'var(--color-negative)',
    brand: 'var(--color-brand-500)',
  }[tone]

  return (
    <div className="surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-500">
          {label}
        </p>
        {icon && <span className="text-ink-300">{icon}</span>}
      </div>

      <p
        className={cn(
          'mt-1.5 text-[22px] font-semibold leading-7 tabular tracking-tight',
          valueTone,
        )}
      >
        {animated ? (
          <AnimatedNumber value={valueNumber} format={format} />
        ) : (
          value
        )}
      </p>

      {trend && trend.length >= 2 && (
        <Sparkline data={trend} color={trendColor} className="mt-1.5" />
      )}

      <div className="mt-1 flex items-center gap-1.5 min-h-4">
        {delta && (
          <span
            className={cn(
              'text-[11px] font-medium tabular',
              delta.value >= 0 ? 'text-brand-600' : 'text-negative',
            )}
          >
            {delta.value >= 0 ? '↑' : '↓'} {Math.abs(delta.value).toFixed(1)}%
          </span>
        )}
        {(context || delta?.label) && (
          <span className="text-[11px] text-ink-400">
            {delta?.label ?? context}
          </span>
        )}
      </div>
    </div>
  )
}

/** Grade responsiva de cartões de indicador. */
export function StatGrid({
  children,
  cols = 4,
}: {
  children: ReactNode
  cols?: 2 | 3 | 4 | 5
}) {
  const colsClass = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  }[cols]

  return (
    <div className={cn('grid grid-cols-1 gap-3', colsClass)}>{children}</div>
  )
}
