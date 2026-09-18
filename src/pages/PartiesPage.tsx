import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Check, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { useActiveOrg } from '@/contexts/OrgContext'
import { useParties, usePartyMutations, usePartyTotals } from '@/hooks/useCatalog'
import { PageBody, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  TableSkeleton,
} from '@/components/ui/Feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import { formatCurrency, formatDocument, initials } from '@/lib/format'
import type { Party, PartyKind } from '@/lib/types'

type Filter = 'todos' | 'cliente' | 'fornecedor'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'cliente', label: 'Clientes' },
  { id: 'fornecedor', label: 'Fornecedores' },
]

const KIND_LABELS: Record<PartyKind, string> = {
  cliente: 'Cliente',
  fornecedor: 'Fornecedor',
  ambos: 'Ambos',
}

const KIND_OPTIONS = Object.entries(KIND_LABELS) as [PartyKind, string][]

interface PartyFormValues {
  name: string
  kind: PartyKind
  document: string
  email: string
  phone: string
  notes: string
}

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

export function PartiesPage() {
  const { activeOrgId, canEdit } = useActiveOrg()
  const partiesQuery = useParties(activeOrgId)
  const totalsQuery = usePartyTotals(activeOrgId)
  const { create, update, remove } = usePartyMutations(activeOrgId)

  const [filter, setFilter] = useState<Filter>('todos')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Party | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Party | null>(null)

  const parties = partiesQuery.data ?? []

  // Totais vêm de uma view separada; cruzamos por id para não repetir consulta.
  const totalsById = useMemo(() => {
    const map = new Map<string, { settled: number; open: number }>()
    for (const total of totalsQuery.data ?? []) {
      map.set(total.party_id, {
        settled: Number(total.settled_total),
        open: Number(total.open_total),
      })
    }
    return map
  }, [totalsQuery.data])

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()

    return parties.filter((party) => {
      if (filter !== 'todos' && party.kind !== filter && party.kind !== 'ambos') {
        return false
      }
      if (!term) return true

      return (
        party.name.toLowerCase().includes(term) ||
        (party.document ?? '').includes(term.replace(/\D/g, ''))
      )
    })
  }, [parties, filter, search])

  const loading = partiesQuery.isLoading || totalsQuery.isLoading
  const error = partiesQuery.error ?? totalsQuery.error
  const saveError = create.error ?? update.error
  const hasFilters = filter !== 'todos' || search.trim().length > 0

  /* -- Handlers ---------------------------------------------------------- */

  function closeForm() {
    setCreating(false)
    setEditing(null)
    create.reset()
    update.reset()
  }

  function submit(values: PartyFormValues) {
    const payload = {
      name: values.name.trim(),
      kind: values.kind,
      document: values.document.trim() || null,
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      notes: values.notes.trim() || null,
    }

    if (editing) {
      update.mutate({ id: editing.id, patch: payload }, { onSuccess: closeForm })
      return
    }

    create.mutate({ org_id: activeOrgId, ...payload }, { onSuccess: closeForm })
  }

  function clearFilters() {
    setFilter('todos')
    setSearch('')
  }

  /* -- Render ------------------------------------------------------------- */

  return (
    <PageBody>
      <PageHeader
        title="Clientes e fornecedores"
        description="Quem paga, quem recebe e quanto cada um movimenta"
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
              Novo parceiro
            </Button>
          )
        }
      />

      {/* Filtros */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex items-center rounded-lg border border-ink-200 bg-white p-0.5 shadow-sm">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                  filter === item.id
                    ? 'bg-ink-900 text-white'
                    : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
            <Input
              placeholder="Buscar por nome ou documento"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-8"
            />
          </div>

          {hasFilters && (
            <Button
              variant="ghost"
              size="md"
              onClick={clearFilters}
              icon={<X className="size-3.5" />}
            >
              Limpar
            </Button>
          )}
        </div>
      </Card>

      {/* Tabela */}
      <Card className="overflow-hidden">
        {error ? (
          <ErrorState
            message={
              error instanceof Error ? error.message : 'Erro ao carregar parceiros.'
            }
            onRetry={() => {
              void partiesQuery.refetch()
              void totalsQuery.refetch()
            }}
          />
        ) : loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title="Nenhum parceiro encontrado"
            description={
              hasFilters
                ? 'Ajuste os filtros para ver outros registros.'
                : 'Cadastre clientes e fornecedores para acompanhar o que cada um movimenta.'
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : canEdit ? (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Novo parceiro
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr>
                  <th className="th">Nome</th>
                  <th className="th">Tipo</th>
                  <th className="th">Documento</th>
                  <th className="th">Contato</th>
                  <th className="th text-right">Movimentado</th>
                  <th className="th text-right">Em aberto</th>
                  {canEdit && <th className="th w-20 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((party) => {
                  const totals = totalsById.get(party.id)

                  return (
                    <tr key={party.id} className="row-hover group">
                      <td className="td">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-semibold text-ink-600">
                            {initials(party.name)}
                          </span>
                          <span className="max-w-[220px] truncate font-medium text-ink-800">
                            {party.name}
                          </span>
                          {!party.is_active && <Badge tone="caution">Inativo</Badge>}
                        </div>
                      </td>
                      <td className="td">
                        <Badge
                          tone={party.kind === 'cliente' ? 'positive' : 'neutral'}
                        >
                          {KIND_LABELS[party.kind]}
                        </Badge>
                      </td>
                      <td className="td whitespace-nowrap text-ink-500 tabular">
                        {formatDocument(party.document)}
                      </td>
                      <td className="td">
                        <p className="max-w-[200px] truncate text-ink-600">
                          {party.email ?? '—'}
                        </p>
                        {party.phone && (
                          <p className="text-[11px] tabular text-ink-400">
                            {party.phone}
                          </p>
                        )}
                      </td>
                      <td className="td num whitespace-nowrap text-right text-ink-700">
                        {formatCurrency(totals?.settled ?? 0)}
                      </td>
                      <td
                        className={cn(
                          'td num whitespace-nowrap text-right font-medium',
                          (totals?.open ?? 0) > 0 ? 'text-negative' : 'text-ink-400',
                        )}
                      >
                        {formatCurrency(totals?.open ?? 0)}
                      </td>
                      {canEdit && (
                        <td className="td">
                          <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            <button
                              onClick={() => {
                                setCreating(false)
                                setEditing(party)
                              }}
                              title="Editar"
                              className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(party)}
                              title="Excluir"
                              className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-[var(--color-negative-soft)] hover:text-negative"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(creating || editing) && (
        <PartyFormModal
          party={editing}
          saving={create.isPending || update.isPending}
          error={saveError instanceof Error ? saveError.message : null}
          onClose={closeForm}
          onSubmit={submit}
        />
      )}

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Excluir parceiro"
        description="Esta ação não pode ser desfeita."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                confirmDelete &&
                remove.mutate(confirmDelete.id, {
                  onSuccess: () => setConfirmDelete(null),
                })
              }
            >
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-5 text-ink-600">
          O parceiro{' '}
          <strong className="font-semibold text-ink-900">
            {confirmDelete?.name}
          </strong>{' '}
          será removido. Os lançamentos já registrados permanecem no caixa.
        </p>
      </Modal>
    </PageBody>
  )
}

/* -------------------------------------------------------------------------- */
/* Formulário                                                                  */
/* -------------------------------------------------------------------------- */

function PartyFormModal({
  party,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  party: Party | null
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: PartyFormValues) => void
}) {
  const { register, handleSubmit, formState } = useForm<PartyFormValues>({
    defaultValues: party
      ? {
          name: party.name,
          kind: party.kind,
          document: party.document ?? '',
          email: party.email ?? '',
          phone: party.phone ?? '',
          notes: party.notes ?? '',
        }
      : {
          name: '',
          kind: 'cliente',
          document: '',
          email: '',
          phone: '',
          notes: '',
        },
  })

  const { errors } = formState

  return (
    <Modal
      open
      onClose={onClose}
      title={party ? 'Editar parceiro' : 'Novo parceiro'}
      description={
        party
          ? 'Atualize os dados do cadastro.'
          : 'Cadastre um cliente, fornecedor ou ambos.'
      }
      size="md"
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
            {party ? 'Salvar alterações' : 'Cadastrar'}
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

        <Field label="Nome" required error={errors.name?.message}>
          <Input
            {...register('name', {
              validate: (value) =>
                value.trim().length > 0 || 'Informe o nome do parceiro.',
            })}
            placeholder="Ex.: Mega Comércio Ltda."
            invalid={Boolean(errors.name)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo" required>
            <Select {...register('kind')}>
              {KIND_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Documento" hint="CPF ou CNPJ, com ou sem pontuação.">
            <Input {...register('document')} placeholder="00.000.000/0000-00" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="E-mail">
            <Input
              type="email"
              {...register('email')}
              placeholder="contato@empresa.com.br"
            />
          </Field>

          <Field label="Telefone">
            <Input {...register('phone')} placeholder="(11) 99999-0000" />
          </Field>
        </div>

        <Field label="Observações">
          <Textarea
            {...register('notes')}
            placeholder="Condições de pagamento, contato preferencial…"
          />
        </Field>
      </form>
    </Modal>
  )
}
