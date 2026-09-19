import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Download, FileBarChart } from 'lucide-react'
import { useActiveOrg } from '@/contexts/OrgContext'
import { queryKeys } from '@/lib/queryClient'
import { listEntries, listMonthlyByAccount } from '@/services/api'
import {
  buildDre,
  buildMonthSeries,
  buildQuarterly,
  cashflowFromAccountTotals,
  computeKpis,
  marginTone,
  projectSeries,
} from '@/lib/analytics'
import {
  currentYearRange,
  endOfMonth,
  formatCompact,
  formatCurrency,
  formatMonthLong,
  formatPercent,
  startOfMonth,
} from '@/lib/format'
import { PageBody, PageHeader, StatCard, StatGrid } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Field'
import { RadialGauge } from '@/components/ui/RadialGauge'
import { cn } from '@/lib/cn'
import { exportCashflowWorkbook } from '@/services/excel'

type PeriodPreset = 'ano' | '12m' | '24m' | 'custom'

export function ReportsPage() {
  const { activeOrgId, activeOrg } = useActiveOrg()
  const [preset, setPreset] = useState<PeriodPreset>('ano')
  const [custom, setCustom] = useState(() => currentYearRange())
  const [exporting, setExporting] = useState(false)

  const range = useMemo(() => {
    if (preset === 'custom') return custom
    const today = new Date()

    if (preset === 'ano') return currentYearRange(today)

    const months = preset === '12m' ? 11 : 23
    const start = new Date(today.getFullYear(), today.getMonth() - months, 1)
    return { from: startOfMonth(start), to: endOfMonth(today) }
  }, [preset, custom])

  /*
   * Intervalo custom inválido é um caminho morto: datas invertidas devolviam
   * uma tela vazia sem explicar o motivo. Agora isso é sinalizado antes de
   * consultar, e a consulta é evitada.
   */
  const invalidCustomRange =
    preset === 'custom' && Boolean(custom.from) && Boolean(custom.to) && custom.from > custom.to

  // Consulta só com intervalo válido: evita chamadas inúteis quando o usuário
  // está digitando as datas (from sem to, ou ainda invertidas).
  const effectiveRange = invalidCustomRange || !custom.from || !custom.to ? null : range

  const entriesQuery = useQuery({
    queryKey: queryKeys.entries({ org: activeOrgId, ...range, report: true }),
    queryFn: () =>
      listEntries({ orgId: activeOrgId, from: range.from, to: range.to }, { limit: 2000 }),
    enabled: effectiveRange !== null,
  })

  const cashflowQuery = useQuery({
    queryKey: queryKeys.monthlyByAccount(activeOrgId, range.from, range.to),
    queryFn: () => listMonthlyByAccount(activeOrgId, range.from, range.to),
    enabled: effectiveRange !== null,
  })

  const loading = entriesQuery.isLoading || cashflowQuery.isLoading
  const error = entriesQuery.error ?? cashflowQuery.error

  const model = useMemo(() => {
    const entries = entriesQuery.data?.rows ?? []
    const openingBalance = Number(activeOrg?.opening_balance ?? 0)

    const series = buildMonthSeries(
      cashflowFromAccountTotals(cashflowQuery.data ?? [], activeOrgId),
      range.from,
      range.to,
      openingBalance,
    )

    return {
      entries,
      series,
      kpis: computeKpis(series, openingBalance),
      dre: buildDre(entries),
      quarterly: buildQuarterly(series),
      projection: projectSeries(series, 3),
    }
  }, [entriesQuery.data, cashflowQuery.data, range, activeOrg, activeOrgId])

  async function handleExport() {
    setExporting(true)
    try {
      await exportCashflowWorkbook({
        organization: activeOrg?.name ?? 'Empresa',
        from: range.from,
        to: range.to,
        series: model.series,
        entries: model.entries,
        dre: model.dre.rows,
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <PageBody>
      <PageHeader
        title="Relatórios"
        description="DRE gerencial, fluxo por período e projeção de caixa"
        actions={
          <>
            <div className="flex items-center rounded-lg border border-ink-200 bg-white p-0.5 shadow-sm">
              {(
                [
                  ['ano', 'Ano atual'],
                  ['12m', '12 meses'],
                  ['24m', '24 meses'],
                  ['custom', 'Período'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setPreset(id)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                    preset === id ? 'bg-ink-900 text-white' : 'text-ink-500 hover:text-ink-800',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <Button
              variant="secondary"
              icon={<Download className="size-4" />}
              loading={exporting}
              onClick={() => void handleExport()}
              disabled={!model.entries.length}
              title={
                model.entries.length
                  ? 'Baixar o fluxo do período em Excel'
                  : 'Sem lançamentos no período para exportar'
              }
            >
              Exportar Excel
            </Button>
          </>
        }
      />

      {preset === 'custom' && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-end gap-3 p-4">
            <Field label="De" className="w-[160px]">
              <Input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              />
            </Field>
            <Field label="Até" className="w-[160px]">
              <Input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              />
            </Field>

            {invalidCustomRange && (
              <div
                role="alert"
                className="flex-1 min-w-[220px] rounded-lg border border-[color-mix(in_oklch,var(--color-caution)_32%,transparent)] bg-[var(--color-caution-soft)] px-3 py-2.5 text-[12px] leading-5 text-[color-mix(in_oklch,var(--color-caution)_70%,black)]"
              >
                A data inicial está depois da data final. Ajuste o intervalo
                para gerar os relatórios.
              </div>
            )}
          </div>
        </Card>
      )}

      {invalidCustomRange ? (
        <Card>
          <EmptyState
            icon={<FileBarChart className="size-5" />}
            title="Intervalo inválido"
            description="A data inicial precisa ser anterior à data final para gerar os relatórios."
          />
        </Card>
      ) : error ? (
        <Card>
          <ErrorState
            message={error instanceof Error ? error.message : String(error)}
            onRetry={() => {
              void entriesQuery.refetch()
              void cashflowQuery.refetch()
            }}
          />
        </Card>
      ) : loading ? (
        <ReportsSkeleton />
      ) : !model.entries.length ? (
        <Card>
          <EmptyState
            icon={<FileBarChart className="size-5" />}
            title="Sem dados no período"
            description="Escolha outro intervalo ou registre lançamentos para gerar os relatórios."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <StatGrid cols={4}>
            <StatCard
              label="Receita bruta"
              value={formatCurrency(model.kpis.income)}
              valueNumber={model.kpis.income}
              format={formatCurrency}
              trend={model.series.map((m) => m.income)}
              tone="positive"
              context="Entradas liquidadas"
            />
            <StatCard
              label="Despesas"
              value={formatCurrency(model.kpis.expense)}
              valueNumber={model.kpis.expense}
              format={formatCurrency}
              trend={model.series.map((m) => m.expense)}
              tone="negative"
              context="Saídas liquidadas"
            />
            <StatCard
              label="Resultado líquido"
              value={formatCurrency(model.kpis.result)}
              valueNumber={model.kpis.result}
              format={formatCurrency}
              trend={model.series.map((m) => m.result)}
              tone={model.kpis.result >= 0 ? 'positive' : 'negative'}
              context={`Margem de ${formatPercent(model.kpis.margin)}`}
            />
            <StatCard
              label="Saldo final"
              value={formatCurrency(model.kpis.closingBalance)}
              valueNumber={model.kpis.closingBalance}
              format={formatCurrency}
              trend={model.series.map((m) => m.accumulated)}
              context={`Abertura: ${formatCurrency(model.kpis.openingBalance)}`}
            />
          </StatGrid>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* DRE */}
            <Card>
              <CardHeader
                title="DRE gerencial"
                subtitle="Somente lançamentos liquidados, base caixa"
                action={
                  <div className="flex items-center gap-2.5">
                    <span className="text-right text-[11px] leading-3.5 text-ink-500">
                      Margem
                      <br />
                      líquida
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
              <div className="p-4">
                <table className="w-full">
                  <tbody>
                    {model.dre.rows.map((row, index) => {
                      const isTotal = row.emphasis
                      const isLast = index === model.dre.rows.length - 1

                      return (
                        <tr
                          key={row.label}
                          className={cn(
                            isLast && 'border-t-2 border-ink-200',
                            isTotal && !isLast && 'border-t border-ink-200',
                          )}
                        >
                          <td
                            className={cn(
                              'py-2',
                              isTotal
                                ? 'text-[13px] font-semibold text-ink-900'
                                : 'pl-4 text-[13px] text-ink-600',
                            )}
                          >
                            {row.label}
                          </td>
                          <td
                            className={cn(
                              'py-2 text-right text-[12px] tabular',
                              isTotal ? 'text-ink-500' : 'text-ink-400',
                            )}
                          >
                            {formatPercent(row.share, 1)}
                          </td>
                          <td
                            className={cn(
                              'py-2 text-right text-[13px] font-semibold tabular',
                              row.negative
                                ? 'text-negative'
                                : row.value >= 0
                                  ? 'text-brand-700'
                                  : 'text-negative',
                              isTotal && 'text-[14px]',
                            )}
                          >
                            {formatCurrency(row.value)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Trimestral */}
            <Card>
              <CardHeader
                title="Fluxo por trimestre"
                subtitle="Entradas e saídas agrupadas por trimestre"
              />
              <div className="p-4 pt-2">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={model.quarterly}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                      barGap={2}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e8e5" />
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
                        tickFormatter={(v: number) => formatCompact(v)}
                        width={70}
                      />
                      <Tooltip content={<ReportTooltip />} cursor={{ fill: '#00000008' }} />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        height={28}
                        iconType="circle"
                        iconSize={7}
                        wrapperStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="income" name="Entradas" fill="#26a269" radius={[3, 3, 0, 0]} maxBarSize={36} />
                      <Bar dataKey="expense" name="Saídas" fill="#c2503a" radius={[3, 3, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          </div>

          {/* Projeção */}
          <Card>
            <CardHeader
              title="Projeção de entradas"
              subtitle="Extrapolação linear dos três meses seguintes, com base no histórico do período"
            />
            <div className="p-4 pt-2">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={model.projection}
                    margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e8e5" />
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
                      tickFormatter={(v: number) => formatCompact(v)}
                      width={70}
                    />
                    <Tooltip content={<ReportTooltip />} />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={28}
                      iconType="circle"
                      iconSize={7}
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="income"
                      name="Entradas realizadas"
                      stroke="#1c7a50"
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 0, fill: '#1c7a50' }}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey={(point: { income: number | null; projected: boolean }) =>
                        point.projected ? point.income : null
                      }
                      name="Projeção"
                      stroke="#3d7ea6"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={{ r: 3, strokeWidth: 0, fill: '#3d7ea6' }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 px-1 text-[11px] leading-4 text-ink-400">
                A projeção é uma referência estatística simples — não considera
                sazonalidade, contratos ou mudanças no seu negócio.
              </p>
            </div>
          </Card>

          {/* Detalhamento mensal */}
          <Card>
            <CardHeader
              title="Detalhamento mensal"
              subtitle="Valores realizados por mês"
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead>
                  <tr>
                    <th className="th">Mês</th>
                    <th className="th text-right">Entradas</th>
                    <th className="th text-right">Saídas</th>
                    <th className="th text-right">Resultado</th>
                    <th className="th text-right">Margem</th>
                    <th className="th text-right">Saldo acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {model.series.map((month) => {
                    const margin =
                      month.income > 0 ? (month.result / month.income) * 100 : 0

                    return (
                      <tr key={month.key} className="row-hover">
                        <td className="td capitalize">{formatMonthLong(month.key)}</td>
                        <td className="td num text-right text-brand-700">
                          {formatCurrency(month.income)}
                        </td>
                        <td className="td num text-right text-negative">
                          {formatCurrency(month.expense)}
                        </td>
                        <td
                          className={cn(
                            'td num text-right font-semibold',
                            month.result >= 0 ? 'text-ink-800' : 'text-negative',
                          )}
                        >
                          {formatCurrency(month.result)}
                        </td>
                        <td className="td num text-right text-ink-500">
                          {month.income > 0 ? formatPercent(margin) : '—'}
                        </td>
                        <td
                          className={cn(
                            'td num text-right font-medium',
                            month.accumulated >= 0 ? 'text-ink-700' : 'text-negative',
                          )}
                        >
                          {formatCurrency(month.accumulated)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </PageBody>
  )
}

function ReportTooltip({
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
          <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-ink-600">{item.name}</span>
          <span className="ml-auto font-semibold tabular text-ink-900">
            {formatCurrency(Number(item.value ?? 0))}
          </span>
        </div>
      ))}
    </div>
  )
}

function ReportsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="surface p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-6 w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="surface p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-[300px] w-full" />
        </div>
        <div className="surface p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-[300px] w-full" />
        </div>
      </div>
    </div>
  )
}
