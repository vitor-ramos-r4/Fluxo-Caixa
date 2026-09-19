import { createRenderer, type ComponentRenderProps } from '@json-render/react'
import type { ReactNode } from 'react'
import { Button as AppButton } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { catalog } from './catalog'

/** Mapeia gaps do catálogo para classes do Tailwind. */
const GAP: Record<string, string> = { none: 'gap-0', sm: 'gap-2', md: 'gap-4', lg: 'gap-6' }
const ALIGN: Record<string, string> = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' }
const JUSTIFY: Record<string, string> = { start: 'justify-start', center: 'justify-center', end: 'justify-end', between: 'justify-between' }
const MAX_W: Record<string, string> = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }

function typed<T>(fn: (ctx: ComponentRenderProps<T>) => ReactNode) {
  return fn
}

/**
 * Registry do fluxo-caixa: mapeia cada componente do catálogo para um
 * componente React estilizado com o design system do app. Specs aprovados
 * pela skill json-render-jev renderizam por aqui.
 */
export const AiRenderer = createRenderer(catalog, {
  Button: typed<{ label: string; variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | null }>(
    ({ element, emit }) => (
      <AppButton
        type="button"
        variant={element.props.variant === 'outline' ? 'secondary' : (element.props.variant ?? 'secondary')}
        onClick={() => emit('press')}
      >
        {element.props.label}
      </AppButton>
    ),
  ),
  Card: typed<{ title: string; description?: string | null; maxWidth?: 'sm' | 'md' | 'lg' | null }>(
    ({ element, children }) => (
      <div
        className={cn(
          'w-full rounded-xl border border-ink-200 bg-white p-5 shadow-sm',
          element.props.maxWidth ? MAX_W[element.props.maxWidth] : undefined,
        )}
      >
        <h2 className="text-base font-semibold text-ink-900">{element.props.title}</h2>
        {element.props.description ? (
          <p className="mt-0.5 text-[13px] text-ink-500">{element.props.description}</p>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    ),
  ),
  Stack: typed<{ direction: 'vertical' | 'horizontal'; gap?: 'none' | 'sm' | 'md' | 'lg' | null; align?: string | null; justify?: string | null }>(
    ({ element, children }) => (
      <div
        className={cn(
          'flex',
          element.props.direction === 'horizontal' ? 'flex-row' : 'flex-col',
          GAP[element.props.gap ?? 'md'],
          element.props.align ? ALIGN[element.props.align] : undefined,
          element.props.justify ? JUSTIFY[element.props.justify] : undefined,
        )}
      >
        {children}
      </div>
    ),
  ),
  Heading: typed<{ text: string; level?: 'h1' | 'h2' | 'h3' }>(({ element }) => {
    const level = element.props.level ?? 'h2'
    const cls = level === 'h1' ? 'text-2xl font-bold' : level === 'h2' ? 'text-lg font-semibold' : 'text-sm font-semibold text-ink-700'
    return <h3 className={cn('text-ink-900', cls)}>{element.props.text}</h3>
  }),
  Text: typed<{ text: string; variant?: 'default' | 'muted' | 'strong' | null }>(({ element }) => (
    <p className={cn('text-sm text-ink-800', element.props.variant === 'muted' && 'text-ink-500', element.props.variant === 'strong' && 'font-semibold')}>
      {element.props.text}
    </p>
  )),
  Badge: typed<{ text: string; variant?: 'default' | 'secondary' | 'outline' | null }>(({ element }) => (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        element.props.variant === 'secondary' && 'bg-ink-100 text-ink-600',
        element.props.variant === 'outline' && 'border border-ink-300 text-ink-600',
        (!element.props.variant || element.props.variant === 'default') && 'bg-brand-100 text-brand-700',
      )}
    >
      {element.props.text}
    </span>
  )),
  Separator: typed<{ orientation?: 'horizontal' | 'vertical' | null }>(({ element }) =>
    element.props.orientation === 'vertical' ? (
      <span className="h-full w-px bg-ink-200" />
    ) : (
      <hr className="border-ink-200" />
    ),
  ),
  Progress: typed<{ value: number; max: number; label?: string }>(({ element }) => {
    const pct = element.props.max > 0 ? Math.min(100, (element.props.value / element.props.max) * 100) : 0
    return (
      <div className="space-y-1">
        {element.props.label ? (
          <div className="flex items-center justify-between text-xs text-ink-500">
            <span>{element.props.label}</span>
            <span>{pct.toFixed(0)}%</span>
          </div>
        ) : null}
        <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }),
  Input: typed<{ label: string; name: string; type?: 'text' | 'email' | 'number' | 'password'; placeholder?: string | null }>(
    ({ element }) => (
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink-700">{element.props.label}</span>
        <input
          name={element.props.name}
          type={element.props.type ?? 'text'}
          placeholder={element.props.placeholder ?? undefined}
          className="h-9 w-full rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 outline-none focus:border-brand-500"
        />
      </label>
    ),
  ),
  Select: typed<{ label: string; name: string; options: string[] }>(({ element }) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink-700">{element.props.label}</span>
      <select
        name={element.props.name}
        className="h-9 w-full rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 outline-none focus:border-brand-500"
      >
        {element.props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )),
})