/**
 * Cálculos de indicadores derivados.
 *
 * Ficam fora dos componentes para poderem ser testados e reaproveitados
 * entre o dashboard, os relatórios e as metas.
 */
import {
  MONTH_LABELS,
  formatMonthKey,
  monthKeysBetween,
  parseDateOnly,
} from './format'
import type {
  Alert,
  ChartOfAccount,
  EntryWithRelations,
  MonthlyByAccount,
  MonthlyCashflow,
  WalletBalance,
} from './types'

/* -------------------------------------------------------------------------- */
/* Série mensal                                                                */
/* -------------------------------------------------------------------------- */

export interface MonthPoint {
  key: string
  label: string
  income: number
  expense: number
  result: number
  accumulated: number
  /** Quantidade de lançamentos no mês (para tooltips e tabelas). */
  count: number
  /** Entradas ainda em aberto — não compõem o resultado realizado. */
  pendingIncome: number
  /** Saídas ainda em aberto. */
  pendingExpense: number
}

/**
 * Monta a série mensal contínua dentro do intervalo.
 *
 * Meses sem movimento entram com zero — sem isso, os gráficos "pulam" meses
 * e a linha de tendência fica enganosa.
 */
export function buildMonthSeries(
  cashflow: MonthlyCashflow[],
  from: string,
  to: string,
  openingBalance: number,
): MonthPoint[] {
  const byMonth = new Map(cashflow.map((row) => [row.month.slice(0, 7), row]))

  let running = openingBalance
  return monthKeysBetween(from, to).map((key) => {
    const row = byMonth.get(key)
    const income = Number(row?.income ?? 0)
    const expense = Number(row?.expense ?? 0)
    const result = income - expense
    running += result

    return {
      key,
      label: formatMonthKey(key),
      income,
      expense,
      result,
      accumulated: running,
      count: 0,
      pendingIncome: Number(row?.pending_income ?? 0),
      pendingExpense: Number(row?.pending_expense ?? 0),
    }
  })
}

/**
 * Consolida o agregado por conta (view `monthly_by_account`) numa série
 * mensal, pronta para `buildMonthSeries`.
 *
 * As páginas que precisam de valores realizados usam `total`, que já exclui
 * lançamentos em aberto e transferências no banco. O que está pendente vai
 * para os campos separados, para não contaminar o saldo.
 */
export function cashflowFromAccountTotals(
  rows: MonthlyByAccount[],
  orgId: string,
): MonthlyCashflow[] {
  const byMonth = new Map<
    string,
    { income: number; expense: number; pendingIncome: number; pendingExpense: number }
  >()

  for (const row of rows) {
    const key = row.month.slice(0, 7)
    const current = byMonth.get(key) ?? {
      income: 0,
      expense: 0,
      pendingIncome: 0,
      pendingExpense: 0,
    }

    if (row.account_kind === 'receita') {
      current.income += Number(row.total)
      current.pendingIncome += Number(row.pending_total)
    } else if (row.account_kind === 'despesa') {
      current.expense += Number(row.total)
      current.pendingExpense += Number(row.pending_total)
    }

    byMonth.set(key, current)
  }

  return [...byMonth.entries()].map(([month, values]) => ({
    org_id: orgId,
    month: `${month}-01`,
    income: values.income,
    expense: values.expense,
    pending_income: values.pendingIncome,
    pending_expense: values.pendingExpense,
    operational_result: values.income - values.expense,
    accumulated_balance: 0,
  }))
}

/**
 * Mesma consolidação, a partir de lançamentos já carregados.
 *
 * Considera apenas o que está liquidado, mantendo a mesma regra da view —
 * é o que permite o dashboard e as metas mostrarem base caixa.
 */
export function cashflowFromEntries(
  entries: EntryWithRelations[],
  orgId: string,
): MonthlyCashflow[] {
  const byMonth = new Map<
    string,
    { income: number; expense: number; pendingIncome: number; pendingExpense: number }
  >()

  for (const entry of entries) {
    if (entry.is_transfer) continue

    const key = entry.issued_on.slice(0, 7)
    const current = byMonth.get(key) ?? {
      income: 0,
      expense: 0,
      pendingIncome: 0,
      pendingExpense: 0,
    }
    const amount = Number(entry.amount)
    const settled = entry.status === 'pago'

    if (entry.kind === 'entrada') {
      if (settled) current.income += amount
      else current.pendingIncome += amount
    } else if (settled) {
      current.expense += amount
    } else {
      current.pendingExpense += amount
    }

    byMonth.set(key, current)
  }

  return [...byMonth.entries()].map(([month, values]) => ({
    org_id: orgId,
    month: `${month}-01`,
    income: values.income,
    expense: values.expense,
    pending_income: values.pendingIncome,
    pending_expense: values.pendingExpense,
    operational_result: values.income - values.expense,
    accumulated_balance: 0,
  }))
}

/* -------------------------------------------------------------------------- */
/* Indicadores                                                                 */
/* -------------------------------------------------------------------------- */

export interface Kpis {
  income: number
  expense: number
  result: number
  margin: number
  openingBalance: number
  closingBalance: number
  /** Média mensal de entradas — base das projeções. */
  averageIncome: number
  averageExpense: number
  /** Variação percentual do resultado vs. período anterior equivalente. */
  resultDelta: number | null
}

export function computeKpis(
  series: MonthPoint[],
  openingBalance: number,
): Kpis {
  const income = series.reduce((sum, m) => sum + m.income, 0)
  const expense = series.reduce((sum, m) => sum + m.expense, 0)
  const result = income - expense

  const months = series.length || 1
  const midpoint = Math.floor(series.length / 2)

  const firstHalf = series.slice(0, midpoint).reduce((s, m) => s + m.result, 0)
  const secondHalf = series.slice(midpoint).reduce((s, m) => s + m.result, 0)

  return {
    income,
    expense,
    result,
    margin: income > 0 ? (result / income) * 100 : 0,
    openingBalance,
    closingBalance: openingBalance + result,
    averageIncome: income / months,
    averageExpense: expense / months,
    // Só faz sentido comparar com pelo menos 4 meses de dados.
    resultDelta:
      series.length >= 4 && firstHalf !== 0
        ? ((secondHalf - firstHalf) / Math.abs(firstHalf)) * 100
        : null,
  }
}

/** Melhor e pior mês por resultado operacional. */
export function bestAndWorstMonths(series: MonthPoint[]): {
  best: MonthPoint | null
  worst: MonthPoint | null
} {
  const withMovement = series.filter((m) => m.income > 0 || m.expense > 0)
  if (!withMovement.length) return { best: null, worst: null }

  return withMovement.reduce(
    (acc, month) => ({
      best: !acc.best || month.result > acc.best.result ? month : acc.best,
      worst: !acc.worst || month.result < acc.worst.result ? month : acc.worst,
    }),
    { best: null, worst: null } as {
      best: MonthPoint | null
      worst: MonthPoint | null
    },
  )
}

/* -------------------------------------------------------------------------- */
/* Composição por conta                                                        */
/* -------------------------------------------------------------------------- */

export interface AccountSlice {
  name: string
  value: number
  share: number
  color: string
}

/** Paleta categórica fixa — evita cores aleatórias a cada render. */
const SERIES_COLORS = [
  '#26a269',
  '#3d7ea6',
  '#c08a2e',
  '#a04f7c',
  '#4f8a5b',
  '#8a6bbf',
  '#c2603a',
  '#5b7a99',
]

export function buildAccountSlices(
  entries: EntryWithRelations[],
  kind: 'entrada' | 'saida',
  limit = 6,
): AccountSlice[] {
  const totals = new Map<string, number>()

  for (const entry of entries) {
    if (entry.kind !== kind || entry.is_transfer) continue
    const name = entry.chart_of_accounts?.name ?? 'Sem categoria'
    totals.set(name, (totals.get(name) ?? 0) + Number(entry.amount))
  }

  const sum = [...totals.values()].reduce((s, v) => s + v, 0)
  if (sum === 0) return []

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, limit)
  const restTotal = sorted.slice(limit).reduce((s, [, v]) => s + v, 0)

  const slices: AccountSlice[] = top.map(([name, value], index) => ({
    name,
    value,
    share: (value / sum) * 100,
    color: SERIES_COLORS[index % SERIES_COLORS.length]!,
  }))

  if (restTotal > 0) {
    slices.push({
      name: 'Outros',
      value: restTotal,
      share: (restTotal / sum) * 100,
      color: '#9a9a95',
    })
  }

  return slices
}

/* -------------------------------------------------------------------------- */
/* Projeção                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Projeta os próximos meses por regressão linear simples sobre a série
 * histórica. É uma extrapolação honesta: sem dados suficientes, devolve a
 * média em vez de inventar tendência.
 */
export function projectSeries(
  series: MonthPoint[],
  monthsAhead = 3,
): { label: string; income: number | null; projected: boolean }[] {
  const history = series.map((m) => ({
    label: m.label,
    income: m.income as number | null,
    projected: false,
  }))

  const values = series.map((m) => m.income)
  const n = values.length

  if (n === 0) return history

  let slope = 0
  let intercept = values.reduce((s, v) => s + v, 0) / n

  if (n >= 3) {
    const meanX = (n - 1) / 2
    const meanY = intercept
    let numerator = 0
    let denominator = 0

    values.forEach((y, x) => {
      numerator += (x - meanX) * (y - meanY)
      denominator += (x - meanX) ** 2
    })

    if (denominator !== 0) {
      slope = numerator / denominator
      intercept = meanY - slope * meanX
    }
  }

  // Último rótulo para nomear a continuação (ex.: 'dez/26' → 'jan/27').
  const last = series[n - 1]
  const cursor = last ? parseDateOnly(`${last.key}-01`) : new Date()

  const projection = Array.from({ length: monthsAhead }, (_, i) => {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() + i + 1, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const value = intercept + slope * (n + i)
    return {
      label: formatMonthKey(key),
      // Nunca projeta entrada negativa: é um absurdo contábil.
      income: Math.max(0, Math.round(value * 100) / 100),
      projected: true,
    }
  })

  return [...history, ...projection]
}

/* -------------------------------------------------------------------------- */
/* Alertas                                                                     */
/* -------------------------------------------------------------------------- */

export interface AlertInput {
  series: MonthPoint[]
  kpis: Kpis
  walletBalances: WalletBalance[]
  accounts: ChartOfAccount[]
  openEntries: number
  openPayable: number
  openReceivable: number
}

/**
 * Gera os alertas do painel.
 *
 * Tudo é derivado dos dados reais — nada de mensagens genéricas fixas.
 * A ordem é por gravidade, para o que importa aparecer primeiro.
 */
export function buildAlerts(input: AlertInput): Alert[] {
  const alerts: Alert[] = []
  const { series, kpis, walletBalances, openEntries, openPayable, openReceivable } =
    input

  // 1. Caixa negativo é o problema mais grave possível.
  const negativeWallets = walletBalances.filter((w) => w.current_balance < 0)
  for (const wallet of negativeWallets) {
    alerts.push({
      id: `wallet-negative-${wallet.wallet_id}`,
      severity: 'critico',
      title: `${wallet.name} está no negativo`,
      detail: `Saldo atual de ${formatBRL(wallet.current_balance)}. Cubra a conta ou registre um aporte.`,
      action: { label: 'Ver contas', to: '/contas' },
    })
  }

  // 2. Resultado acumulado negativo no período.
  if (kpis.result < 0) {
    alerts.push({
      id: 'result-negative',
      severity: 'critico',
      title: 'As saídas superaram as entradas',
      detail: `Resultado de ${formatBRL(kpis.result)} no período analisado.`,
      action: { label: 'Ver relatórios', to: '/relatorios' },
    })
  }

  // 3. Meses consecutivos no vermelho.
  const recent = series.slice(-3)
  if (recent.length === 3 && recent.every((m) => m.result < 0)) {
    alerts.push({
      id: 'three-negative-months',
      severity: 'critico',
      title: 'Três meses seguidos de resultado negativo',
      detail: 'Vale revisar as despesas fixas e renegociar prazos.',
      action: { label: 'Ver lançamentos', to: '/lancamentos' },
    })
  }

  // 4. Contas a pagar em aberto.
  if (openPayable > 0) {
    alerts.push({
      id: 'payable-open',
      severity: openPayable > kpis.averageIncome ? 'atencao' : 'info',
      title: `${openEntries} lançamento${openEntries === 1 ? '' : 's'} em aberto`,
      detail: `Há ${formatBRL(openPayable)} a pagar e ${formatBRL(openReceivable)} a receber.`,
      action: { label: 'Conciliação', to: '/conciliacao' },
    })
  }

  // 5. Dependência de uma única fonte de receita.
  const incomeByMonth = series.filter((m) => m.income > 0)
  if (incomeByMonth.length >= 3) {
    const avg = kpis.averageIncome
    const volatileMonths = incomeByMonth.filter(
      (m) => Math.abs(m.income - avg) / avg > 0.35,
    ).length

    if (volatileMonths >= incomeByMonth.length / 2) {
      alerts.push({
        id: 'income-volatility',
        severity: 'atencao',
        title: 'Entradas com alta variação',
        detail:
          'As receitas oscilam bastante mês a mês, o que dificulta prever o caixa.',
        action: { label: 'Ver projeção', to: '/relatorios' },
      })
    }
  }

  // 6. Margem apertada.
  if (kpis.income > 0 && kpis.margin >= 0 && kpis.margin < 8) {
    alerts.push({
      id: 'thin-margin',
      severity: 'atencao',
      title: 'Margem operacional apertada',
      detail: `Margem de ${kpis.margin.toFixed(1)}%. Pequenas oscilações já levam o mês ao negativo.`,
      action: { label: 'Analisar despesas', to: '/relatorios' },
    })
  }

  // 7. Caixa confortável — feedback positivo também é informação.
  if (kpis.result > 0 && kpis.margin >= 20 && !negativeWallets.length) {
    alerts.push({
      id: 'healthy',
      severity: 'info',
      title: 'Caixa saudável no período',
      detail: `Margem de ${kpis.margin.toFixed(1)}% e todas as contas positivas.`,
    })
  }

  const order: Record<Alert['severity'], number> = {
    critico: 0,
    atencao: 1,
    info: 2,
  }

  return alerts.sort((a, b) => order[a.severity] - order[b.severity])
}

/** Formatação local mínima para evitar dependência circular com format.ts. */
function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/* -------------------------------------------------------------------------- */
/* DRE simplificado                                                            */
/* -------------------------------------------------------------------------- */

export interface DreRow {
  label: string
  value: number
  /** Percentual sobre a receita bruta. */
  share: number
  emphasis?: boolean
  negative?: boolean
}

/**
 * DRE gerencial simplificado: receita bruta, despesas por grupo e resultado.
 * Não substitui a contabilidade — serve para leitura rápida de gestão.
 */
export function buildDre(entries: EntryWithRelations[]): {
  rows: DreRow[]
  grossRevenue: number
  netResult: number
} {
  const revenue = entries
    .filter((e) => e.kind === 'entrada' && !e.is_transfer && e.status === 'pago')
    .reduce((s, e) => s + Number(e.amount), 0)

  const expenseByAccount = new Map<string, number>()
  for (const entry of entries) {
    if (entry.kind !== 'saida' || entry.is_transfer || entry.status !== 'pago') {
      continue
    }
    const name = entry.chart_of_accounts?.name ?? 'Sem categoria'
    expenseByAccount.set(
      name,
      (expenseByAccount.get(name) ?? 0) + Number(entry.amount),
    )
  }

  const totalExpense = [...expenseByAccount.values()].reduce((s, v) => s + v, 0)
  const netResult = revenue - totalExpense
  const base = revenue || 1

  const rows: DreRow[] = [
    {
      label: 'Receita bruta',
      value: revenue,
      share: 100,
      emphasis: true,
    },
  ]

  for (const [name, value] of [...expenseByAccount.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    rows.push({
      label: name,
      value: -value,
      share: (value / base) * 100,
      negative: true,
    })
  }

  rows.push({
    label: 'Total de despesas',
    value: -totalExpense,
    share: (totalExpense / base) * 100,
    negative: true,
    emphasis: true,
  })

  rows.push({
    label: 'Resultado líquido',
    value: netResult,
    share: (netResult / base) * 100,
    emphasis: true,
  })

  return { rows, grossRevenue: revenue, netResult }
}

/* -------------------------------------------------------------------------- */
/* Fluxo por trimestre                                                         */
/* -------------------------------------------------------------------------- */

export function buildQuarterly(series: MonthPoint[]) {
  const quarters = new Map<number, { income: number; expense: number }>()

  for (const month of series) {
    const monthNumber = Number(month.key.split('-')[1] ?? 1)
    const quarter = Math.ceil(monthNumber / 3)
    const current = quarters.get(quarter) ?? { income: 0, expense: 0 }
    current.income += month.income
    current.expense += month.expense
    quarters.set(quarter, current)
  }

  return [...quarters.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([quarter, values]) => ({
      label: `${quarter}º tri`,
      income: values.income,
      expense: values.expense,
      result: values.income - values.expense,
    }))
}

/** Nome do mês a partir do índice 0-11. */
export function monthName(index: number): string {
  return MONTH_LABELS[index] ?? ''
}
