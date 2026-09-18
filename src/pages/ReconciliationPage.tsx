import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Info, Search, Undo2 } from 'lucide-react'
import { useActiveOrg } from '@/contexts/OrgContext'
import { queryKeys } from '@/lib/queryClient'
import { listEntries, setReconciled, updateEntry } from '@/services/api'
import { useWallets } from '@/hooks/useCatalog'
import {
  currentYearRange,
  formatCurrency,
  formatDate,
  signedCurrency,
} from '@/lib/format'
import type { EntryWithRelations } from '@/lib/types'
import { PageBody, PageHeader, StatCard, StatGrid } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  TableSkeleton,
} from '@/components/ui/Feedback'
import { Field, Input, Select } from '@/components/ui/Field'
import { cn } from '@/lib/cn'

type Tab = 'pendentes' | 'conciliados'

const PAGE_LIMIT = 200

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

export function ReconciliationPage() {
  const { activeOrgId, canEdit } = useActiveOrg()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>('pendentes')
  const [range, setRange] = useState(() => currentYearRange())
  const [walletId, setWalletId] = useState('')

  const entriesQuery = useQuery({
    queryKey: queryKeys.entries({
      org: activeOrgId,
      ...range,
      walletId: walletId || undefined,
      reconciliation: true,
    }),
    queryFn: () =>
      listEntries(
        {
          orgId: activeOrgId,
          from: range.from,
          to: range.to,
          walletId: walletId || undefined,
        },
        { limit: PAGE_LIMIT },
      ),
  })

  const walletsQuery = useWallets(activeOrgId)

  const wallets = walletsQuery.data ?? []

  /**
   * A lista já chega filtrada por período e conta, mas o status de conciliação
   * não é filtrável no servidor — separamos no cliente para não depender de
   * duas consultas diferentes.
   */
  const { pending, reconciled } = useMemo(() => {
    const rows = (entriesQuery.data?.rows ?? []).filter(
      (entry) => !entry.is_transfer,
    )

    return {
      pending: rows.filter((entry) => entry.reconciled_at === null),
      reconciled: rows.filter((entry) => entry.reconciled_at !== null),
    }
  }, [entriesQuery.data])

  const totals = useMemo(() => {
    const receivable = pending
      .filter((entry) => entry.kind === 'entrada')
      .reduce((sum, entry) => sum + Number(entry.amount), 0)
    const payable = pending
      .filter((entry) => entry.kind === 'saida')
      .reduce((sum, entry) => sum + Number(entry.amount), 0)

    return { receivable, payable }
  }, [pending])

  const invalidateEntries = () => {
    void queryClient.invalidateQueries({ queryKey: ['entries'] })
  }

  const reconcileMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      setReconciled(id, value),
    onSuccess: invalidateEntries,
  })

  const payMutation = useMutation({
    mutationFn: (id: string) => updateEntry(id, { status: 'pago' }),
    onSuccess: invalidateEntries,
  })

  const rows = tab === 'pendentes' ? pending : reconciled
  const busy = reconcileMutation.isPending || payMutation.isPending

  return (
    <PageBody>
      <PageHeader
        title="Conciliação bancária"
        description="Confirme quais lançamentos conferem com o extrato da conta"
        actions={
          canEdit ? undefined : <Badge tone="neutral">Somente leitura</Badge>
        }
      />

      <StatGrid cols={4}>
        <StatCard
          label="Pendentes"
          value={String(pending.length)}
          tone={pending.length > 0 ? 'negative' : 'neutral'}
          context="Aguardando conferência"
        />
        <StatCard
          label="A receber"
          value={formatCurrency(totals.receivable)}
          tone="positive"
          context="Entradas pendentes"
        />
        <StatCard
          label="A pagar"
          value={formatCurrency(totals.payable)}
          tone="negative"
          context="Saídas pendentes"
        />
        <StatCard
          label="Conciliados"
          value={String(reconciled.length)}
          context="Confirmados no período"
        />
      </StatGrid>

      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[color-mix(in_oklch,var(--color-info)_22%,transparent)] bg-[var(--color-info-soft)] px-3.5 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-[color-mix(in_oklch,var(--color-info)_85%,black)]" />
        <p className="text-[13px] leading-5 text-ink-700">
          Conciliar significa confirmar que o lançamento confere com o extrato
          bancário. Nenhum valor, data ou classificação é alterado — apenas
          marcamos o registro como conferido.
        </p>
      </div>

      {/* Filtros */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex items-center rounded-lg border border-ink-200 bg-white p-0.5 shadow-sm">
            {(
              [
                ['pendentes', `Pendentes (${pending.length})`],
                ['conciliados', `Conciliados (${reconciled.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                  tab === id
                    ? 'bg-ink-900 text-white'
                    : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <Field label="De" className="w-[150px]">
            <Input
              type="date"
              value={range.from}
              onChange={(e) =>
                setRange((r) => ({ ...r, from: e.target.value }))
              }
            />
          </Field>

          <Field label="Até" className="w-[150px]">
            <Input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </Field>

          <Field label="Conta" className="w-[200px]">
            <Select
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
            >
              <option value="">Todas</option>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {/* Tabela */}
      <Card className="mt-4 overflow-hidden">
        {entriesQuery.isError ? (
          <ErrorState
            message={
              entriesQuery.error instanceof Error
                ? entriesQuery.error.message
                : 'Erro ao carregar lançamentos.'
            }
            onRetry={() => void entriesQuery.refetch()}
          />
        ) : entriesQuery.isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={
              tab === 'pendentes' ? (
                <Check className="size-5" />
              ) : (
                <Search className="size-5" />
              )
            }
            title={
              tab === 'pendentes'
                ? 'Tudo conciliado no período'
                : 'Nenhum lançamento conciliado'
            }
            description={
              tab === 'pendentes'
                ? 'Não há lançamentos aguardando conferência com o extrato bancário.'
                : 'Marque lançamentos como conciliados na aba de pendentes para vê-los aqui.'
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr>
                    <th className="th">Data</th>
                    <th className="th">Descrição</th>
                    <th className="th">Plano de conta</th>
                    <th className="th">Conta</th>
                    <th className="th text-center">Situação</th>
                    <th className="th text-right">Valor</th>
                    <th className="th text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => (
                    <ReconciliationRow
                      key={entry.id}
                      entry={entry}
                      tab={tab}
                      canEdit={canEdit}
                      busy={busy}
                      onReconcile={(value) =>
                        reconcileMutation.mutate({ id: entry.id, value })
                      }
                      onPay={() => payMutation.mutate(entry.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-ink-200 px-4 py-3">
              <p className="text-[12px] text-ink-500">
                Mostrando{' '}
                <span className="font-medium text-ink-700">{rows.length}</span>{' '}
                {tab === 'pendentes' ? 'pendentes' : 'conciliados'}
              </p>
              {entriesQuery.data && entriesQuery.data.total > PAGE_LIMIT && (
                <p className="text-[12px] text-ink-400">
                  Limitado aos {PAGE_LIMIT} lançamentos mais recentes — refine o
                  período para ver outros.
                </p>
              )}
            </div>
          </>
        )}
      </Card>
    </PageBody>
  )
}

/* -------------------------------------------------------------------------- */
/* Linha                                                                       */
/* -------------------------------------------------------------------------- */

function ReconciliationRow({
  entry,
  tab,
  canEdit,
  busy,
  onReconcile,
  onPay,
}: {
  entry: EntryWithRelations
  tab: Tab
  canEdit: boolean
  busy: boolean
  onReconcile: (value: boolean) => void
  onPay: () => void
}) {
  return (
    <tr className="row-hover">
      <td className="td whitespace-nowrap">{formatDate(entry.issued_on)}</td>

      <td className="td max-w-[260px]">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-ink-800">
            {entry.description}
          </p>
          {tab === 'pendentes' && (
            <Badge tone="caution" dot>
              Pendente
            </Badge>
          )}
        </div>
        {entry.parties && (
          <p className="truncate text-[11px] text-ink-400">
            {entry.parties.name}
          </p>
        )}
      </td>

      <td className="td text-ink-500">
        {entry.chart_of_accounts?.name ?? '—'}
      </td>

      <td className="td text-ink-500">{entry.wallets?.name ?? '—'}</td>

      <td className="td text-center">
        {entry.status === 'pago' ? (
          <Badge tone="positive">Pago</Badge>
        ) : (
          <Badge tone="caution">Em aberto</Badge>
        )}
      </td>

      <td
        className={cn(
          'td num whitespace-nowrap text-right font-semibold',
          entry.kind === 'entrada' ? 'text-brand-700' : 'text-negative',
        )}
      >
        {signedCurrency(Number(entry.amount), entry.kind)}
      </td>

      <td className="td">
        <div className="flex justify-end gap-1.5">
          {tab === 'pendentes' ? (
            <>
              {/* Em aberto também precisa ser liquidado: oferecemos as duas
                  confirmações na mesma linha. */}
              {entry.status === 'em_aberto' && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canEdit || busy}
                  onClick={onPay}
                  title="Marcar como pago ou recebido"
                >
                  Marcar como pago
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                disabled={!canEdit || busy}
                onClick={() => onReconcile(true)}
                icon={<Check className="size-3.5" />}
              >
                Conciliar
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={!canEdit || busy}
              onClick={() => onReconcile(false)}
              icon={<Undo2 className="size-3.5" />}
              title="Desfazer conciliação"
            >
              Desfazer
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}
