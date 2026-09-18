import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* -------------------------------------------------------------------------- */
/* Campo com rótulo, dica e erro                                               */
/* -------------------------------------------------------------------------- */

interface FieldProps {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="text-negative ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-negative">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn('field', className)}
      {...props}
    />
  )
})

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn('field resize-y', className)}
      {...props}
    />
  )
})

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn('field appearance-none cursor-pointer pr-9', className)}
      style={{
        // Seta desenhada como SVG inline para não depender de imagem externa.
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.625rem center',
      }}
      {...props}
    >
      {children}
    </select>
  )
})

/* -------------------------------------------------------------------------- */
/* Campos especializados                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Entrada monetária em pt-BR.
 *
 * Aceita "1.234,56", "1234.56" ou "R$ 1.234,56" e devolve número. Digitar
 * vírgula como separador decimal é o que um usuário brasileiro espera, e o
 * `<input type="number">` não lida com isso.
 */
export const CurrencyInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
    value: number | ''
    onValueChange: (value: number | '') => void
    invalid?: boolean
  }
>(function CurrencyInput({ value, onValueChange, invalid, ...props }, ref) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400 select-none">
        R$
      </span>
      <input
        ref={ref}
        inputMode="decimal"
        aria-invalid={invalid || undefined}
        className="field pl-9 text-right tabular"
        value={value === '' ? '' : formatForDisplay(value)}
        onChange={(event) => {
          const parsed = parseCurrencyInput(event.target.value)
          onValueChange(parsed)
        }}
        {...props}
      />
    </div>
  )
})

function formatForDisplay(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Interpreta a digitação do usuário e devolve número ou '' quando vazio. */
export function parseCurrencyInput(raw: string): number | '' {
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim()
  if (!cleaned) return ''

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')

  let normalized: string
  if (lastComma > lastDot) {
    // Formato pt-BR: pontos são separador de milhar.
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    // Formato en-US ou milhar pt-BR sem decimais.
    const decimals = cleaned.length - lastDot - 1
    normalized =
      decimals === 3 && !cleaned.includes(',')
        ? cleaned.replace(/\./g, '')
        : cleaned
  } else {
    normalized = cleaned
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : ''
}
