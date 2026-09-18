import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Plus, Target, TrendingDown, TrendingUp } from 'lucide-react'
import { useActiveOrg } from '@/contexts/OrgContext'
import { queryKeys } from '@/lib/queryClient'
import { listAccounts, listEntries } from '@/services/api'
import {
  buildMonthSeries,
  cashflowFromEntries,
  computeKpis,
} from '@/lib/analytics'
import {
  formatCompact,
  formatCurrency,
  formatMonthKey,
  formatMonthLong,
  formatPercent,
} from '@/lib/format'
import { PageBody, PageHeader, StatCard, StatGrid } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  ProgressBar,
  Skeleton,
} from '@/components/ui/Feedback'
import { CurrencyInput, Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'

/**
 * Metas e orçamento.
 *
 * As metas ficam no armazenamento local: são preferências de acompanhamento
 * do usuário, não dados contábeis, e não precisam sincronizar entre
 * dispositivos para o recurso ser útil.
 */

interface Goal {
  id: string
  kind: 'entrada' | 'saida'
  label: string
  monthlyTarget: number
}

const STORAGE_KEY = 'fluxo-caixa.goals'

function loadGoals(): Goal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Goal[]) : []
  } catch {
    return []
  }
}

function saveGoals(goals: Goal[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goals))
}

export function GoalsPage() {
  const { activeOrgId, activeOrg, canEdit } = useActiveOrg()
  const [goals, setGoals] = useState<Goal[]>(loadGoals)
  const [modalOpen, setModalOpen] = useState(false)

  const range = useMemo(() => {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth() - 5, 1)
    const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`
    const to = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate(),
    ).padStart(2, '0')}`
    return { from, to }
  }, [])

  const entriesQuery = useQuery({
    queryKey: queryKeys.entries({ org: activeOrgId, ...range, goals: true }),
    queryFn: () =>
      listEntries({ orgId: activeOrgId, from: range.from, to: range.to }, { limit: 1000 }),
  })

  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts(activeOrgId),
    queryFn: () => listAccounts(activeOrgId),
  })

  const model = useMemo(() => {
    const entries = entriesQuery.data?.rows ?? []
    const openingBalance = Number(activeOrg?.opening_balance ?? 0)

    const series = buildMonthSeries(
      cashflowFromEntries(entries, activeOrgId),
      range.from,
      range.to,
      openingBalance,
    )

    return { series, kpis: computeKpis(series, openingBalance), entries }
  }, [entriesQuery.data, range, activeOrg, activeOrgId])

  const currentMonth = model.series[model.series.length - 1]

  function addGoal(goal: Omit<Goal, 'id'>) {
    const next = [...goals, { ...goal, id: crypto.randomUUID() }]
    setGoals(next)
    saveGoals(next)
    setModalOpen(false)
  }

  function removeGoal(id: string) {
    const next = goals.filter((goal) => goal.id !== id)
    setGoals(next)
    saveGoals(next)
  }

  const loading = entriesQuery.isLoading

  return (
    <PageBody>
      <PageHeader
        title="Metas e orçamento"
        description="Defina objetivos mensais e acompanhe o desempenho"
        actions={
          canEdit && (
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => setModalOpen(true)}
            >
              Nova meta
            </Button>
          )
        }
      />

      {entriesQuery.isError ? (
        <Card>
          <ErrorState
            message={
              entriesQuery.error instanceof Error
                ? entriesQuery.error.message
                : 'Erro ao carregar dados.'
            }
            onRetry={() => void entriesQuery.refetch()}
          />
        </Card>
      ) : loading ? (
        <GoalsSkeleton />
      ) : (
        <div className="space-y-4">
          <StatGrid cols={4}>
            <StatCard
              label="Meta de entradas"
              value={formatCurrency(
                goals
                  .filter((g) => g.kind === 'entrada')
                  .reduce((s, g) => s + g.monthlyTarget, 0),
              )}
              context="Somatório das metas mensais"
            />
            <StatCard
              label="Teto de despesas"
              value={formatCurrency(
                goals
                  .filter((g) => g.kind === 'saida')
                  .reduce((s, g) => s + g.monthlyTarget, 0),
              )}
              context="Limite definido por mês"
            />
            <StatCard
              label="Entradas no mês"
              value={formatCurrency(currentMonth?.income ?? 0)}
              tone="positive"
              context={currentMonth ? formatMonthLong(currentMonth.key) : '—'}
            />
            <StatCard
              label="Despesas no mês"
              value={formatCurrency(currentMonth?.expense ?? 0)}
              tone="negative"
              context={currentMonth ? formatMonthLong(currentMonth.key) : '—'}
            />
          </StatGrid>

          {/* Progresso das metas */}
          <Card>
            <CardHeader
              title="Progresso das metas"
              subtitle="Comparação entre o realizado e o objetivo de cada mês"
            />
            {goals.length === 0 ? (
              <EmptyState
                icon={<Target className="size-5" />}
                title="Nenhuma meta definida"
                description="Crie uma meta mensal de faturamento ou um teto de despesas para acompanhar aqui."
                action={
                  canEdit ? (
                    <Button variant="primary" onClick={() => setModalOpen(true)}>
                      Criar primeira meta
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {goals.map((goal) => {
                  const realized =
                    goal.kind === 'entrada'
                      ? (currentMonth?.income ?? 0)
                      : (currentMonth?.expense ?? 0)
                  const progress =
                    goal.monthlyTarget > 0
                      ? (realized / goal.monthlyTarget) * 100
                      : 0

                  // Para despesas, ultrapassar a meta é ruim; para receitas, é bom.
                  const isExpense = goal.kind === 'saida'
                  const onTrack = isExpense ? progress <= 100 : progress >= 100
                  const tone = onTrack
                    ? 'brand'
                    : isExpense
                      ? 'negative'
                      : progress >= 70
                        ? 'caution'
                        : 'negative'

                  return (
                    <li key={goal.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'flex size-6 items-center justify-center rounded-md',
                                isExpense
                                  ? 'bg-[var(--color-negative-soft)] text-negative'
                                  : 'bg-brand-50 text-brand-600',
                              )}
                            >
                              {isExpense ? (
                                <TrendingDown className="size-3.5" />
                              ) : (
                                <TrendingUp className="size-3.5" />
                              )}
                            </span>
                            <p className="truncate text-[13px] font-medium text-ink-800">
                              {goal.label}
                            </p>
                            {onTrack && <Badge tone="positive">Atingida</Badge>}
                          </div>
                          <p className="mt-1 text-[12px] text-ink-500">
                            {formatCurrency(realized)} de{' '}
                            {formatCurrency(goal.monthlyTarget)}
                            {currentMonth && ` em ${formatMonthKey(currentMonth.key)}`}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          <span
                            className={cn(
                              'text-[13px] font-semibold tabular',
                              onTrack ? 'text-brand-700' : 'text-ink-700',
                            )}
                          >
                            {formatPercent(progress, 0)}
                          </span>
                          {canEdit && (
                            <button
                              onClick={() => removeGoal(goal.id)}
                              className="text-[12px] text-ink-400 transition-colors hover:text-negative"
                            >
                              Remover
                            </button>
                          )}
                        </div>
                      </div>

                      <ProgressBar value={progress} tone={tone} className="mt-2.5" />
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {/* Histórico vs meta */}
          {goals.length > 0 && (
            <Card>
              <CardHeader
                title="Realizado por mês"
                subtitle="Entradas e saídas dos últimos meses"
              />
              <div className="p-4 pt-2">
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={model.series}
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
                      <Tooltip
                        content={<GoalsTooltip />}
                        cursor={{ fill: '#00000008' }}
                      />
                      <Bar dataKey="income" name="Entradas" radius={[3, 3, 0, 0]} maxBarSize={30}>
                        {model.series.map((month) => {
                          const target = goals
                            .filter((g) => g.kind === 'entrada')
                            .reduce((s, g) => s + g.monthlyTarget, 0)
                          const reached = target > 0 && month.income >= target
                          return (
                            <Cell
                              key={month.key}
                              fill={reached ? '#26a269' : '#9ec9b4'}
                            />
                          )
                        })}
                      </Bar>
                      <Bar dataKey="expense" name="Saídas" radius={[3, 3, 0, 0]} maxBarSize={30}>
                        {model.series.map((month) => {
                          const ceiling = goals
                            .filter((g) => g.kind === 'saida')
                            .reduce((s, g) => s + g.monthlyTarget, 0)
                          const over = ceiling > 0 && month.expense > ceiling
                          return (
                            <Cell
                              key={month.key}
                              fill={over ? '#c2503a' : '#e0b1a6'}
                            />
                          )
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 px-1 text-[11px] leading-4 text-ink-400">
                  Barras cheias indicam metas atingidas nas entradas e teto
                  respeitado nas saídas.
                </p>
              </div>
            </Card>
          )}

          {/* Sugestões baseadas no histórico */}
          {goals.length === 0 && model.kpis.averageIncome > 0 && (
            <Card>
              <CardHeader
                title="Sugestões a partir do seu histórico"
                subtitle="Médias dos últimos meses — use como ponto de partida"
              />
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                <SuggestionCard
                  label="Meta de entradas sugerida"
                  value={model.kpis.averageIncome * 1.1}
                  hint="10% acima da média histórica"
                />
                <SuggestionCard
                  label="Teto de despesas sugerido"
                  value={model.kpis.averageExpense * 0.95}
                  hint="5% abaixo da média histórica"
                />
              </div>
            </Card>
          )}
        </div>
      )}

      <GoalModal
        open={modalOpen}
        accounts={accountsQuery.data ?? []}
        onClose={() => setModalOpen(false)}
        onSubmit={addGoal}
      />
    </PageBody>
  )
}

function SuggestionCard({
  label,
  value,
  hint,
}: {
  label: string
  value: number
  hint: string
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular text-ink-900">
        {formatCurrency(value)}
      </p>
      <p className="mt-0.5 text-[11px] text-ink-400">{hint}</p>
    </div>
  )
}

function GoalModal({
  open,
  accounts,
  onClose,
  onSubmit,
}: {
  open: boolean
  accounts: { id: string; name: string; kind: string }[]
  onClose: () => void
  onSubmit: (goal: { kind: 'entrada' | 'saida'; label: string; monthlyTarget: number }) => void
}) {
  const [kind, setKind] = useState<'entrada' | 'saida'>('entrada')
  const [label, setLabel] = useState('')
  const [target, setTarget] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    if (!label.trim()) {
      setError('Dê um nome para a meta.')
      return
    }
    if (typeof target !== 'number' || target <= 0) {
      setError('Informe um valor maior que zero.')
      return
    }

    onSubmit({ kind, label: label.trim(), monthlyTarget: target })
    setLabel('')
    setTarget('')
    setError(null)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova meta"
      description="Defina um objetivo mensal para acompanhar no painel."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Criar meta
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-[color-mix(in_oklch,var(--color-negative)_25%,transparent)] bg-[var(--color-negative-soft)] px-3 py-2.5 text-[13px] text-negative">
            {error}
          </div>
        )}

        <Field label="Tipo de meta" required>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as 'entrada' | 'saida')}
          >
            <option value="entrada">Meta de entradas (faturamento)</option>
            <option value="saida">Teto de despesas</option>
          </Select>
        </Field>

        <Field
          label="Nome da meta"
          required
          hint={
            accounts.length > 0
              ? 'Ex.: Faturamento mensal, folha de pagamento, marketing…'
              : undefined
          }
        >
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === 'entrada' ? 'Faturamento mensal' : 'Teto de despesas'}
          />
        </Field>

        <Field label="Valor mensal" required>
          <CurrencyInput value={target} onValueChange={setTarget} placeholder="0,00" />
        </Field>
      </div>
    </Modal>
  )
}

function GoalsTooltip({
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

function GoalsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="surface p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-6 w-32" />
          </div>
        ))}
      </div>
      <div className="surface p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-32 w-full" />
      </div>
    </div>
  )
}
