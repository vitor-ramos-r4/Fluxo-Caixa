/**
 * Formatação pt-BR e utilitários de data.
 *
 * Um sistema financeiro vive de números legíveis; tudo que formata valor,
 * data ou percentual passa por aqui para manter consistência.
 */

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const numberFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** R$ 1.234,56 */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return currencyFormatter.format(0)
  }
  return currencyFormatter.format(value)
}

/** R$ 1,2 mil — para eixos de gráfico e espaços apertados. */
export function formatCompact(value: number): string {
  return compactFormatter.format(value)
}

/** 1.234,56 */
export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

/**
 * Valor com sinal explícito, para deixar entradas e saídas óbvias.
 * `signedCurrency(1500, 'entrada')` → "+ R$ 1.500,00"
 */
export function signedCurrency(value: number, kind: 'entrada' | 'saida'): string {
  const abs = Math.abs(value)
  return `${kind === 'entrada' ? '+' : '−'} ${currencyFormatter.format(abs)}`
}

/** 12,3% */
export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(digits).replace('.', ',')}%`
}

/* -------------------------------------------------------------------------- */
/* Datas                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Converte 'YYYY-MM-DD' em Date local.
 *
 * `new Date('2026-01-05')` é interpretado como UTC e pode voltar um dia em
 * fusos negativos (o caso do Brasil). Aqui montamos a data nos componentes
 * locais, evitando o clássico bug de lançamento "adiantado".
 */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/** Date → 'YYYY-MM-DD' (formato aceito pelo Postgres `date`). */
export function toDateOnly(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 05/01/2026 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return parseDateOnly(value).toLocaleDateString('pt-BR')
}

/** 05 jan */
export function formatDayMonth(value: string): string {
  return parseDateOnly(value)
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    .replace('.', '')
}

export const MONTH_LABELS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
] as const

export const MONTH_LABELS_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const

/** 'YYYY-MM' → 'jan/26' */
export function formatMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const label = MONTH_LABELS[(m ?? 1) - 1] ?? ''
  return `${label.toLowerCase()}/${String(y ?? '').slice(2)}`
}

/** 'YYYY-MM' → 'Janeiro de 2026' */
export function formatMonthLong(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTH_LABELS_FULL[(m ?? 1) - 1] ?? ''} de ${y ?? ''}`
}

/** Primeiro dia do mês, como 'YYYY-MM-DD'. */
export function startOfMonth(date: Date): string {
  return toDateOnly(new Date(date.getFullYear(), date.getMonth(), 1))
}

/** Último dia do mês, como 'YYYY-MM-DD'. */
export function endOfMonth(date: Date): string {
  return toDateOnly(new Date(date.getFullYear(), date.getMonth() + 1, 0))
}

/** Limites do ano corrente. */
export function currentYearRange(reference = new Date()): {
  from: string
  to: string
} {
  return {
    from: toDateOnly(new Date(reference.getFullYear(), 0, 1)),
    to: toDateOnly(new Date(reference.getFullYear(), 11, 31)),
  }
}

/** Lista de chaves 'YYYY-MM' entre duas datas, inclusive. */
export function monthKeysBetween(from: string, to: string): string[] {
  const start = parseDateOnly(from)
  const end = parseDateOnly(to)
  const keys: string[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)

  while (cursor <= end) {
    keys.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
    )
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return keys
}

/* -------------------------------------------------------------------------- */
/* Documentos e texto                                                          */
/* -------------------------------------------------------------------------- */

/** '12345678000190' → '12.345.678/0001-90' (ou CPF, se tiver 11 dígitos). */
export function formatDocument(value: string | null | undefined): string {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '')
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  }
  return value
}

/** Remove tudo que não é dígito — usado antes de gravar no banco. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/** 'PIX / Transferência' → 'pix-transferencia' */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Iniciais para avatares: 'Mega Comércio S.A.' → 'MC' */
export function initials(value: string, max = 2): string {
  return value
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÀ-Ú]/.test(w))
    .slice(0, max)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/** Trunca preservando palavras. */
export function truncate(value: string, length = 40): string {
  if (value.length <= length) return value
  return `${value.slice(0, length - 1).trimEnd()}…`
}
