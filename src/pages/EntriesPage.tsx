import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useActiveOrg } from '@/contexts/OrgContext'
import { queryKeys } from '@/lib/queryClient'
import {
  createEntry,
  deleteEntry,
  listAccounts,
  listEntries,
  listParties,
  listWallets,
  toggleEntryStatus,
  updateEntry,
  type EntryFilters,
} from '@/services/api'
import {
  currentYearRange,
  formatCurrency,
  formatDate,
  signedCurrency,
  toDateOnly,
} from '@/lib/format'
import type { EntryKind, EntryStatus, EntryWithRelations } from '@/lib/types'
import { PageBody, PageHeader, StatCard, StatGrid } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  TableSkeleton,
} from '@/components/ui/Feedback'
import {
  CurrencyInput,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'

const PAGE_SIZE = 25

/* -------------------------------------------------------------------------- */
/* Validação                                                                   */
/* -------------------------------------------------------------------------- */

const entrySchema = z.object({
  account_id: z.string().min(1, 'Selecione o plano de conta.'),
  wallet_id: z.string().optional(),
  party_id: z.string().optional(),
  description: z.string().trim().min(2, 'Descreva o lançamento.'),
  amount: z
    .union([z.number(), z.literal('')])
    .refine((v) => typeof v === 'number' && v > 0, {
      message: 'Informe um valor maior que zero.',
    }),
  issued_on: z.string().min(1, 'Informe a data.'),
  status: z.enum(['pago', 'em_aberto']),
  settled_on: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

type EntryFormValues = z.infer<typeof entrySchema>

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

export function EntriesPage() {
  const { activeOrgId, canEdit } = useActiveOrg()
  const queryClient = useQueryClient()

  const [filters, setFilters] = useState<Omit<EntryFilters, 'orgId'>>(() => ({
    ...currentYearRange(),
    status: undefined,
    kind: undefined,
    search: '',
  }))
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [editing, setEditing] = useState<EntryWithRelations | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<EntryWithRelations | null>(null)

  const query = { orgId: activeOrgId, ...filters }

  const entriesQuery = useQuery({
    queryKey: queryKeys.entries({ ...query, page }),
    queryFn: () => listEntries(query, { limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })

  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts(activeOrgId),
    queryFn: () => listAccounts(activeOrgId),
  })

  const walletsQuery = useQuery({
    queryKey: queryKeys.wallets(activeOrgId),
    queryFn: () => listWallets(activeOrgId),
  })

  const partiesQuery = useQuery({
    queryKey: queryKeys.parties(activeOrgId),
    queryFn: () => listParties(activeOrgId),
  })

  const rows = entriesQuery.data?.rows ?? []
  const total = entriesQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const accounts = accountsQuery.data ?? []
  const incomeAccounts = accounts.filter((a) => a.kind === 'receita')
  const expenseAccounts = accounts.filter((a) => a.kind === 'despesa')
  const wallets = (walletsQuery.data ?? []).filter((w) => w.is_active)

  /* -- Totais do filtro atual ------------------------------------------- */

  const totals = useMemo(() => {
    // Separa o que já foi liquidado do que está pendente: somar os dois daria
    // um "total" que não corresponde a nenhum saldo real.
    let income = 0
    let expense = 0
    let openIncome = 0
    let openExpense = 0
    let open = 0

    for (const entry of rows) {
      const amount = Number(entry.amount)
      const settled = entry.status === 'pago'

      if (entry.kind === 'entrada') {
        if (settled) income += amount
        else openIncome += amount
      } else if (settled) {
        expense += amount
      } else {
        openExpense += amount
      }

      if (!settled) open += 1
    }

    return { income, expense, open, openIncome, openExpense }
  }, [rows])

  /* -- Mutations --------------------------------------------------------- */

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['entries'] })
    void queryClient.invalidateQueries({ queryKey: ['monthly-by-account'] })
    void queryClient.invalidateQueries({ queryKey: ['wallet-balances'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const saveMutation = useMutation({
    mutationFn: async (values: EntryFormValues) => {
      const payload = {
        org_id: activeOrgId,
        account_id: values.account_id,
        wallet_id: values.wallet_id || null,
        party_id: values.party_id || null,
        description: values.description,
        amount: values.amount as number,
        issued_on: values.issued_on,
        status: values.status as EntryStatus,
        settled_on: values.status === 'pago' ? values.settled_on || values.issued_on : null,
        reference: values.reference || null,
        notes: values.notes || null,
      }

      return editing
        ? updateEntry(editing.id, payload)
        : createEntry(payload)
    },
    onSuccess: () => {
      invalidateAll()
      setEditing(null)
      setCreating(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEntry(id),
    onSuccess: () => {
      invalidateAll()
      setConfirmDelete(null)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, status, issued }: { id: string; status: EntryStatus; issued: string }) =>
      toggleEntryStatus(id, status, issued),
    onSuccess: invalidateAll,
  })

  /* -- Handlers ---------------------------------------------------------- */

  function applySearch(event: React.FormEvent) {
    event.preventDefault()
    setFilters((f) => ({ ...f, search: searchInput }))
    setPage(0)
  }

  function clearFilters() {
    setFilters({ ...currentYearRange(), search: '' })
    setSearchInput('')
    setPage(0)
  }

  const hasActiveFilters = Boolean(
    filters.status || filters.kind || filters.search,
  )

  return (
    <PageBody>
      <PageHeader
        title="Lançamentos"
        description="Entradas, saídas e situação de cada movimento"
        actions={
          canEdit && (
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(null)
                setCreating(true)
              }}
            >
              Novo lançamento
            </Button>
          )
        }
      />

      <StatGrid cols={4}>
        <StatCard
          label="Registros no filtro"
          value={String(total)}
          context="Lançamentos encontrados"
        />
        <StatCard
          label="Entradas"
          value={formatCurrency(totals.income)}
          tone="positive"
          icon={<ArrowUpRight className="size-4" />}
          context="Somatório desta página"
        />
        <StatCard
          label="Saídas"
          value={formatCurrency(totals.expense)}
          tone="negative"
          icon={<ArrowDownRight className="size-4" />}
          context="Somatório desta página"
        />
        <StatCard
          label="Em aberto"
          value={String(totals.open)}
          tone={totals.open > 0 ? 'negative' : 'neutral'}
          context="Aguardando liquidação"
        />
      </StatGrid>

      {/* Filtros */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <form onSubmit={applySearch} className="min-w-[200px] flex-1">
            <Field label="Buscar">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
                <Input
                  placeholder="Descrição, documento ou observação"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-8"
                />
              </div>
            </Field>
          </form>

          <Field label="De" className="w-[150px]">
            <Input
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => {
                setFilters((f) => ({ ...f, from: e.target.value }))
                setPage(0)
              }}
            />
          </Field>

          <Field label="Até" className="w-[150px]">
            <Input
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => {
                setFilters((f) => ({ ...f, to: e.target.value }))
                setPage(0)
              }}
            />
          </Field>

          <Field label="Tipo" className="w-[130px]">
            <Select
              value={filters.kind ?? ''}
              onChange={(e) => {
                setFilters((f) => ({
                  ...f,
                  kind: (e.target.value || undefined) as EntryKind | undefined,
                }))
                setPage(0)
              }}
            >
              <option value="">Todos</option>
              <option value="entrada">Entradas</option>
              <option value="saida">Saídas</option>
            </Select>
          </Field>

          <Field label="Situação" className="w-[140px]">
            <Select
              value={filters.status ?? ''}
              onChange={(e) => {
                setFilters((f) => ({
                  ...f,
                  status: (e.target.value || undefined) as EntryStatus | undefined,
                }))
                setPage(0)
              }}
            >
              <option value="">Todas</option>
              <option value="pago">Pagas</option>
              <option value="em_aberto">Em aberto</option>
            </Select>
          </Field>

          {hasActiveFilters && (
            <Button variant="ghost" size="md" onClick={clearFilters} icon={<X className="size-3.5" />}>
              Limpar
            </Button>
          )}
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
            icon={<Search className="size-5" />}
            title="Nenhum lançamento encontrado"
            description={
              hasActiveFilters
                ? 'Ajuste os filtros para ver outros registros.'
                : 'Registre o primeiro movimento do seu caixa.'
            }
            action={
              hasActiveFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : canEdit ? (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Novo lançamento
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr>
                    <th className="th">Data</th>
                    <th className="th">Descrição</th>
                    <th className="th">Plano de conta</th>
                    <th className="th">Conta</th>
                    <th className="th text-center">Situação</th>
                    <th className="th text-right">Valor</th>
                    {canEdit && <th className="th w-20 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => (
                    <tr key={entry.id} className="row-hover group">
                      <td className="td whitespace-nowrap">
                        {formatDate(entry.issued_on)}
                      </td>
                      <td className="td max-w-[260px]">
                        <p className="truncate font-medium text-ink-800">
                          {entry.description}
                        </p>
                        {entry.parties && (
                          <p className="truncate text-[11px] text-ink-400">
                            {entry.parties.name}
                          </p>
                        )}
                      </td>
                      <td className="td text-ink-500">
                        {entry.chart_of_accounts?.name ?? '—'}
                      </td>
                      <td className="td text-ink-500">
                        {entry.wallets?.name ?? '—'}
                      </td>
                      <td className="td text-center">
                        {canEdit ? (
                          <button
                            onClick={() =>
                              toggleMutation.mutate({
                                id: entry.id,
                                status: entry.status,
                                issued: entry.issued_on,
                              })
                            }
                            title="Alternar situação"
                            className="transition-opacity hover:opacity-75"
                          >
                            {entry.status === 'pago' ? (
                              <Badge tone="positive" dot>
                                Pago
                              </Badge>
                            ) : (
                              <Badge tone="caution" dot>
                                Em aberto
                              </Badge>
                            )}
                          </button>
                        ) : entry.status === 'pago' ? (
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
                      {canEdit && (
                        <td className="td">
                          <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            <button
                              onClick={() => {
                                setCreating(false)
                                setEditing(entry)
                              }}
                              title="Editar"
                              className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(entry)}
                              title="Excluir"
                              className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-[var(--color-negative-soft)] hover:text-negative"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div className="flex items-center justify-between gap-3 border-t border-ink-200 px-4 py-3">
              <p className="text-[12px] text-ink-500">
                Mostrando{' '}
                <span className="font-medium text-ink-700">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)}
                </span>{' '}
                de <span className="font-medium text-ink-700">{total}</span>
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  icon={<ChevronLeft className="size-3.5" />}
                >
                  Anterior
                </Button>
                <span className="text-[12px] tabular text-ink-500">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Modais */}
      {(creating || editing) && (
        <EntryFormModal
          entry={editing}
          incomeAccounts={incomeAccounts}
          expenseAccounts={expenseAccounts}
          wallets={wallets}
          parties={partiesQuery.data ?? []}
          saving={saveMutation.isPending}
          error={
            saveMutation.error instanceof Error ? saveMutation.error.message : null
          }
          onClose={() => {
            setCreating(false)
            setEditing(null)
            saveMutation.reset()
          }}
          onSubmit={(values) => saveMutation.mutate(values)}
        />
      )}

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Excluir lançamento"
        description="Esta ação não pode ser desfeita."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
            >
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-5 text-ink-600">
          O lançamento{' '}
          <strong className="font-semibold text-ink-900">
            {confirmDelete?.description}
          </strong>{' '}
          no valor de{' '}
          <strong className="font-semibold text-ink-900">
            {confirmDelete && formatCurrency(Number(confirmDelete.amount))}
          </strong>{' '}
          será removido permanentemente.
        </p>
      </Modal>
    </PageBody>
  )
}

/* -------------------------------------------------------------------------- */
/* Formulário                                                                  */
/* -------------------------------------------------------------------------- */

function EntryFormModal({
  entry,
  incomeAccounts,
  expenseAccounts,
  wallets,
  parties,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  entry: EntryWithRelations | null
  incomeAccounts: { id: string; name: string }[]
  expenseAccounts: { id: string; name: string }[]
  wallets: { id: string; name: string }[]
  parties: { id: string; name: string; kind: string }[]
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: EntryFormValues) => void
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EntryFormValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: entry
      ? {
          account_id: entry.account_id,
          wallet_id: entry.wallet_id ?? '',
          party_id: entry.party_id ?? '',
          description: entry.description,
          amount: Number(entry.amount),
          issued_on: entry.issued_on,
          status: entry.status,
          settled_on: entry.settled_on ?? '',
          reference: entry.reference ?? '',
          notes: entry.notes ?? '',
        }
      : {
          account_id: '',
          wallet_id: wallets[0]?.id ?? '',
          party_id: '',
          description: '',
          amount: '',
          issued_on: toDateOnly(new Date()),
          status: 'pago',
          settled_on: '',
          reference: '',
          notes: '',
        },
  })

  const amount = watch('amount')
  const status = watch('status')

  return (
    <Modal
      open
      onClose={onClose}
      title={entry ? 'Editar lançamento' : 'Novo lançamento'}
      description={
        entry
          ? 'Atualize os dados do movimento.'
          : 'Registre uma entrada ou saída no caixa.'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={handleSubmit(onSubmit)}
            icon={<Check className="size-4" />}
          >
            {entry ? 'Salvar alterações' : 'Registrar'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-[color-mix(in_oklch,var(--color-negative)_25%,transparent)] bg-[var(--color-negative-soft)] px-3 py-2.5 text-[13px] text-negative">
            {error}
          </div>
        )}

        <Field
          label="Plano de conta"
          required
          error={errors.account_id?.message}
          hint="O tipo (entrada ou saída) é definido pela conta escolhida."
        >
          <Select {...register('account_id')} invalid={Boolean(errors.account_id)}>
            <option value="">Selecione…</option>
            {incomeAccounts.length > 0 && (
              <optgroup label="Receitas (entradas)">
                {incomeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </optgroup>
            )}
            {expenseAccounts.length > 0 && (
              <optgroup label="Despesas (saídas)">
                {expenseAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>

        <Field label="Descrição" required error={errors.description?.message}>
          <Input
            {...register('description')}
            placeholder="Ex.: Recebimento de cliente, pagamento de fornecedor…"
            invalid={Boolean(errors.description)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Valor" required error={errors.amount?.message}>
            <CurrencyInput
              value={amount ?? ''}
              onValueChange={(value) =>
                setValue('amount', value, { shouldValidate: true })
              }
              invalid={Boolean(errors.amount)}
              placeholder="0,00"
            />
          </Field>

          <Field label="Data do lançamento" required error={errors.issued_on?.message}>
            <Input
              type="date"
              {...register('issued_on')}
              invalid={Boolean(errors.issued_on)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Situação" required>
            <Select {...register('status')}>
              <option value="pago">Pago / recebido</option>
              <option value="em_aberto">Em aberto</option>
            </Select>
          </Field>

          {status === 'pago' && (
            <Field
              label="Data de liquidação"
              hint="Deixe vazio para usar a data do lançamento."
            >
              <Input type="date" {...register('settled_on')} />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Conta ou caixa">
            <Select {...register('wallet_id')}>
              <option value="">Não vincular</option>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Cliente ou fornecedor">
            <Select {...register('party_id')}>
              <option value="">Não vincular</option>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Documento de referência" hint="Nota fiscal, boleto ou comprovante.">
          <Input {...register('reference')} placeholder="Opcional" />
        </Field>

        <Field label="Observações">
          <Textarea {...register('notes')} placeholder="Informações adicionais" />
        </Field>
      </form>
    </Modal>
  )
}
