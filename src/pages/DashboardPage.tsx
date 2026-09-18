import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Info,
  Plus,
  Sparkles,
  TrendingUp,
  Wallet as WalletIcon,
} from 'lucide-react'
import { useActiveOrg } from '@/contexts/OrgContext'
import { queryKeys } from '@/lib/queryClient'
import {
  listEntries,
  listMonthlyByAccount,
  listWalletBalances,
} from '@/services/api'
import {
  bestAndWorstMonths,
  buildAccountSlices,
  buildAlerts,
  buildMonthSeries,
  cashflowFromAccountTotals,
  computeKpis,
  marginTone,
} from '@/lib/analytics'
import {
  currentYearRange,
  endOfMonth,
  formatCompact,
  formatCurrency,
  formatDate,
  formatMonthKey,
  formatPercent,
  signedCurrency,
  startOfMonth,
} from '@/lib/format'
import type { Alert } from '@/lib/types'
import { PageBody, PageHeader, StatCard, StatGrid } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui/Feedback'
import { RadialGauge } from '@/components/ui/RadialGauge'
import { cn } from '@/lib/cn'

/* -------------------------------------------------------------------------- */
/* Seletor de período                                                          */
/* -------------------------------------------------------------------------- */

type RangePreset = 'mes-atual' | 'ultimos-3' | 'ultimos-6' | 'ano'

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'mes-atual', label: 'Mês atual' },
  { id: 'ultimos-3', label: '3 meses' },
  { id: 'ultimos-6', label: '6 meses' },
  { id: 'ano', label: 'Ano' },
]

function resolveRange(preset: RangePreset): { from: string; to: string } {
  const today = new Date()

  switch (preset) {
    case 'mes-atual':
      return { from: startOfMonth(today), to: endOfMonth(today) }
    case 'ultimos-3': {
      const start = new Date(today.getFullYear(), today.getMonth() - 2, 1)
      return { from: startOfMonth(start), to: endOfMonth(today) }
    }
    case 'ultimos-6': {
      const start = new Date(today.getFullYear(), today.getMonth() - 5, 1)
      return { from: startOfMonth(start), to: endOfMonth(today) }
    }
    case 'ano':
    default:
      return currentYearRange(today)
  }
}

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

export function DashboardPage() {
  const { activeOrgId, activeOrg } = useActiveOrg()
  const [preset, setPreset] = useState<RangePreset>('ano')

  const range = useMemo(() => resolveRange(preset), [preset])

  const cashflowQuery = useQuery({
    queryKey: queryKeys.monthlyCashflow(activeOrgId, range.from, range.to),
    queryFn: () => listMonthlyByAccount(activeOrgId, range.from, range.to),
  })

  const entriesQuery = useQuery({
    queryKey: queryKeys.entries({ org: activeOrgId, ...range, recent: true }),
    queryFn: () =>
      listEntries(
        { orgId: activeOrgId, from: range.from, to: range.to },
        { limit: 200 },
      ),
  })

  const walletsQuery = useQuery({
    queryKey: queryKeys.walletBalances(activeOrgId),
    queryFn: () => listWalletBalances(activeOrgId),
  })

  const loading =
    cashflowQuery.isLoading || entriesQuery.isLoading || walletsQuery.isLoading

  const error = cashflowQuery.error ?? entriesQuery.error ?? walletsQuery.error

  /* -- Dados derivados ---------------------------------------------------- */

  const model = useMemo(() => {
    const entries = entriesQuery.data?.rows ?? []
    const byAccount = cashflowQuery.data ?? []
    const openingBalance = Number(activeOrg?.opening_balance ?? 0)

    const series = buildMonthSeries(
      cashflowFromAccountTotals(byAccount, activeOrgId),
      range.from,
      range.to,
      openingBalance,
    )

    const kpis = computeKpis(series, openingBalance)
    const { best, worst } = bestAndWorstMonths(series)

    const openEntries = entries.filter((e) => e.status === 'em_aberto')
    const openPayable = openEntries
      .filter((e) => e.kind === 'saida')
      .reduce((s, e) => s + Number(e.amount), 0)
    const openReceivable = openEntries
      .filter((e) => e.kind === 'entrada')
      .reduce((s, e) => s + Number(e.amount), 0)

    const alerts = buildAlerts({
      series,
      kpis,
      walletBalances: walletsQuery.data ?? [],
      accounts: [],
      openEntries: openEntries.length,
      openPayable,
      openReceivable,
    })

    return {
      series,
      kpis,
      best,
      worst,
      alerts,
      incomeSlices: buildAccountSlices(entries, 'entrada'),
      expenseSlices: buildAccountSlices(entries, 'saida'),
      upcoming: openEntries
        .sort((a, b) => a.issued_on.localeCompare(b.issued_on))
        .slice(0, 6),
      recent: entries.slice(0, 8),
      hasData: entries.length > 0,
    }
  }, [entriesQuery.data, cashflowQuery.data, walletsQuery.data, range, activeOrg, activeOrgId])

  /* -- Render ------------------------------------------------------------- */

  return (
    <PageBody>
      <PageHeader
        title="Visão geral"
        description={`Acompanhamento financeiro de ${activeOrg?.name ?? 'sua empresa'}`}
        actions={
          <>
            <div className="flex items-center rounded-lg border border-ink-200 bg-white p-0.5 shadow-sm">
              {PRESETS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPreset(item.id)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                    preset === item.id
                      ? 'bg-ink-900 text-white'
                      : 'text-ink-500 hover:text-ink-800',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <Link to="/lancamentos">
              <Button variant="primary" size="md" icon={<Plus className="size-4" />}>
                Novo lançamento
              </Button>
            </Link>
          </>
        }
      />

      {error ? (
        <Card>
          <ErrorState
            message={error instanceof Error ? error.message : String(error)}
            onRetry={() => {
              void cashflowQuery.refetch()
              void entriesQuery.refetch()
            }}
          />
        </Card>
      ) : loading ? (
        <DashboardSkeleton />
      ) : !model.hasData ? (
        <Card>
          <EmptyState
            icon={<WalletIcon className="size-5" />}
            title="Nenhum lançamento neste período"
            description="Comece registrando uma entrada ou saída, ou importe os dados da sua planilha para ver os indicadores."
            action={
              <div className="flex gap-2">
                <Link to="/lancamentos">
                  <Button variant="primary" icon={<Plus className="size-4" />}>
                    Registrar lançamento
                  </Button>
                </Link>
                <Link to="/configuracoes">
                  <Button variant="secondary">Importar planilha</Button>
                </Link>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {/* KPIs */}
          <StatGrid cols={4}>
            <StatCard
              label="Entradas"
              value={formatCurrency(model.kpis.income)}
              valueNumber={model.kpis.income}
              format={formatCurrency}
              trend={model.series.map((m) => m.income)}
              tone="positive"
              icon={<ArrowUpRight className="size-4" />}
              delta={
                model.kpis.resultDelta !== null
                  ? { value: model.kpis.resultDelta, label: 'vs. 1ª metade' }
                  : undefined
              }
              context={model.kpis.resultDelta === null ? 'Total recebido' : undefined}
            />
            <StatCard
              label="Saídas"
              value={formatCurrency(model.kpis.expense)}
              valueNumber={model.kpis.expense}
              format={formatCurrency}
              trend={model.series.map((m) => m.expense)}
              tone="negative"
              icon={<ArrowDownRight className="size-4" />}
              context="Total pago no período"
            />
            <StatCard
              label="Resultado"
              value={formatCurrency(model.kpis.result)}
              valueNumber={model.kpis.result}
              format={formatCurrency}
              trend={model.series.map((m) => m.result)}
              tone={model.kpis.result >= 0 ? 'positive' : 'negative'}
              context={`Margem de ${formatPercent(model.kpis.margin)}`}
            />
            <StatCard
              label="Saldo em caixa"
              value={formatCurrency(model.kpis.closingBalance)}
              valueNumber={model.kpis.closingBalance}
              format={formatCurrency}
              trend={model.series.map((m) => m.accumulated)}
              tone={model.kpis.closingBalance >= 0 ? 'neutral' : 'negative'}
              context={`Abertura: ${formatCurrency(model.kpis.openingBalance)}`}
            />
          </StatGrid>

          {/* Alertas */}
          {model.alerts.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {model.alerts.slice(0, 3).map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          )}

          {/* Gráficos principais */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Entradas e saídas por mês"
                subtitle="Valores realizados, excluindo transferências entre contas"
                action={
                  <div className="flex items-center gap-2.5">
                    <span className="text-right text-[11px] leading-3.5 text-ink-500">
                      Margem
                      <br />
                      operacional
                    </span>
                    <RadialGauge
                      value={Math.max(0, Math.min(100, model.kpis.margin))}
                      valueLabel={formatPercent(model.kpis.margin, 0)}
                      size={48}
                      strokeWidth={5}
                      tone={marginTone(model.kpis.margin)}
                    />
                  </div>
                }
              />
              <div className="p-4 pt-2">
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={model.series}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                      barGap={2}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#e8e8e5"
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#737373' }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#737373' }}
                        tickFormatter={(value: number) => formatCompact(value)}
                        width={70}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: '#00000008' }} />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        height={28}
                        iconType="circle"
                        iconSize={7}
                        wrapperStyle={{ fontSize: 12 }}
                      />
                      <Bar
                        dataKey="income"
                        name="Entradas"
                        fill="#26a269"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={28}
                      />
                      <Bar
                        dataKey="expense"
                        name="Saídas"
                        fill="#c2503a"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Saldo acumulado"
                subtitle="Evolução do caixa no período"
              />
              <div className="p-4 pt-2">
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={model.series}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#26a269" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="#26a269" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#e8e8e5"
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#737373' }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#737373' }}
                        tickFormatter={(value: number) => formatCompact(value)}
                        width={70}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="accumulated"
                        name="Saldo"
                        stroke="#1c7a50"
                        strokeWidth={2}
                        fill="url(#balanceFill)"
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          </div>

          {/* Composição + Destaques */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <CompositionCard
              title="Origem das entradas"
              subtitle="Participação por conta"
              slices={model.incomeSlices}
              emptyLabel="Sem entradas no período"
            />
            <CompositionCard
              title="Destino das saídas"
              subtitle="Participação por conta"
              slices={model.expenseSlices}
              emptyLabel="Sem saídas no período"
            />

            <Card>
              <CardHeader title="Destaques do período" />
              <div className="divide-y divide-ink-100">
                {model.best && (
                  <HighlightRow
                    label="Melhor mês"
                    primary={formatMonthKey(model.best.key)}
                    value={formatCurrency(model.best.result)}
                    positive
                  />
                )}
                {model.worst && model.worst.key !== model.best?.key && (
                  <HighlightRow
                    label="Mês mais crítico"
                    primary={formatMonthKey(model.worst.key)}
                    value={formatCurrency(model.worst.result)}
                    positive={model.worst.result >= 0}
                  />
                )}
                <HighlightRow
                  label="Média mensal de entradas"
                  primary={formatCurrency(model.kpis.averageIncome)}
                />
                <HighlightRow
                  label="Resultado acumulado"
                  primary={formatCurrency(model.kpis.result)}
                  positive={model.kpis.result >= 0}
                />
              </div>
            </Card>

            <Card>
              <CardHeader
                title="A receber e a pagar"
                subtitle="Lançamentos em aberto"
                action={
                  <Link
                    to="/conciliacao"
                    className="text-[12px] font-medium text-brand-700 hover:text-brand-800"
                  >
                    Conciliar
                  </Link>
                }
              />
              {model.upcoming.length === 0 ? (
                <EmptyState
                  icon={<Sparkles className="size-5" />}
                  title="Tudo liquidado"
                  description="Não há lançamentos pendentes."
                  className="py-10"
                />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {model.upcoming.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-md',
                          entry.kind === 'entrada'
                            ? 'bg-brand-50 text-brand-600'
                            : 'bg-[var(--color-negative-soft)] text-negative',
                        )}
                      >
                        {entry.kind === 'entrada' ? (
                          <ArrowUpRight className="size-3.5" />
                        ) : (
                          <ArrowDownRight className="size-3.5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink-800">
                          {entry.description}
                        </p>
                        <p className="text-[11px] text-ink-500">
                          {formatDate(entry.issued_on)}
                          {entry.chart_of_accounts && ` · ${entry.chart_of_accounts.name}`}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 text-[12px] font-semibold tabular',
                          entry.kind === 'entrada' ? 'text-brand-700' : 'text-negative',
                        )}
                      >
                        {signedCurrency(Number(entry.amount), entry.kind)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Lançamentos recentes */}
          <Card>
            <CardHeader
              title="Lançamentos recentes"
              subtitle="Últimos movimentos registrados"
              action={
                <Link
                  to="/lancamentos"
                  className="text-[12px] font-medium text-brand-700 hover:text-brand-800"
                >
                  Ver todos
                </Link>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr>
                    <th className="th">Data</th>
                    <th className="th">Descrição</th>
                    <th className="th">Conta</th>
                    <th className="th text-center">Situação</th>
                    <th className="th text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {model.recent.map((entry) => (
                    <tr key={entry.id} className="row-hover">
                      <td className="td whitespace-nowrap">
                        {formatDate(entry.issued_on)}
                      </td>
                      <td className="td max-w-[280px] truncate font-medium text-ink-800">
                        {entry.description}
                      </td>
                      <td className="td text-ink-500">
                        {entry.chart_of_accounts?.name ?? '—'}
                      </td>
                      <td className="td text-center">
                        {entry.status === 'pago' ? (
                          <Badge tone="positive">Pago</Badge>
                        ) : (
                          <Badge tone="caution">Em aberto</Badge>
                        )}
                      </td>
                      <td
                        className={cn(
                          'td num text-right font-semibold',
                          entry.kind === 'entrada' ? 'text-brand-700' : 'text-negative',
                        )}
                      >
                        {signedCurrency(Number(entry.amount), entry.kind)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </PageBody>
  )
}

/* -------------------------------------------------------------------------- */
/* Subcomponentes                                                              */
/* -------------------------------------------------------------------------- */

function AlertCard({ alert }: { alert: Alert }) {
  const tones = {
    critico: {
      wrap: 'border-[color-mix(in_oklch,var(--color-negative)_28%,transparent)] bg-[var(--color-negative-soft)]',
      icon: 'text-negative',
      title: 'text-[color-mix(in_oklch,var(--color-negative)_80%,black)]',
      body: 'text-[color-mix(in_oklch,var(--color-negative)_65%,black)]',
    },
    atencao: {
      wrap: 'border-[color-mix(in_oklch,var(--color-caution)_32%,transparent)] bg-[var(--color-caution-soft)]',
      icon: 'text-[color-mix(in_oklch,var(--color-caution)_80%,black)]',
      title: 'text-[color-mix(in_oklch,var(--color-caution)_72%,black)]',
      body: 'text-[color-mix(in_oklch,var(--color-caution)_60%,black)]',
    },
    info: {
      wrap: 'border-ink-200 bg-white',
      icon: 'text-ink-400',
      title: 'text-ink-800',
      body: 'text-ink-500',
    },
  }[alert.severity]

  const Icon =
    alert.severity === 'critico'
      ? AlertTriangle
      : alert.severity === 'atencao'
        ? TrendingUp
        : Info

  return (
    <div className={cn('rounded-xl border p-3.5', tones.wrap)}>
      <div className="flex items-start gap-2.5">
        <Icon className={cn('mt-0.5 size-4 shrink-0', tones.icon)} />
        <div className="min-w-0 flex-1">
          <p className={cn('text-[13px] font-semibold leading-5', tones.title)}>
            {alert.title}
          </p>
          <p className={cn('mt-0.5 text-[12px] leading-4.5', tones.body)}>
            {alert.detail}
          </p>
          {alert.action && (
            <Link
              to={alert.action.to}
              className={cn(
                'mt-1.5 inline-block text-[12px] font-medium underline underline-offset-2',
                tones.title,
              )}
            >
              {alert.action.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function CompositionCard({
  title,
  subtitle,
  slices,
  emptyLabel,
}: {
  title: string
  subtitle: string
  slices: { name: string; value: number; share: number; color: string }[]
  emptyLabel: string
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {slices.length === 0 ? (
        <EmptyState title={emptyLabel} className="py-10" />
      ) : (
        <div className="p-4">
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={38}
                  outerRadius={62}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.name} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1.5">
            {slices.slice(0, 5).map((slice) => (
              <li key={slice.name} className="flex items-center gap-2 text-[12px]">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="min-w-0 flex-1 truncate text-ink-600">
                  {slice.name}
                </span>
                <span className="shrink-0 tabular text-ink-500">
                  {formatPercent(slice.share, 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function HighlightRow({
  label,
  primary,
  value,
  positive,
}: {
  label: string
  primary: string
  value?: string
  positive?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[12px] text-ink-500">{label}</p>
        <p className="truncate text-[13px] font-medium text-ink-800">{primary}</p>
      </div>
      {value && (
        <span
          className={cn(
            'shrink-0 text-[13px] font-semibold tabular',
            positive ? 'text-brand-700' : 'text-negative',
          )}
        >
          {value}
        </span>
      )}
    </div>
  )
}

/** Tooltip unificado dos gráficos, com valores em pt-BR. */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 shadow-raised">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-400">
        {label}
      </p>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center gap-2 text-[12px]">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-ink-600">{item.name}</span>
          <span className="ml-auto font-semibold tabular text-ink-900">
            {formatCurrency(Number(item.value ?? 0))}
          </span>
        </div>
      ))}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="surface p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-6 w-32" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="surface xl:col-span-2 p-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-4 h-[280px] w-full" />
        </div>
        <div className="surface p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-[280px] w-full" />
        </div>
      </div>
    </div>
  )
}
