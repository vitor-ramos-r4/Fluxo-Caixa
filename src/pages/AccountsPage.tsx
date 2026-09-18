import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Check, Info, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { useActiveOrg } from '@/contexts/OrgContext'
import { useAccountMutations, useAccounts } from '@/hooks/useCatalog'
import { PageBody, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui/Feedback'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import type { ChartOfAccount } from '@/lib/types'

/** Paleta fixa de identificação — cores livres escapariam do tema. */
const SWATCHES = ['#1c7a50', '#26a269', '#3d7ea6', '#8b6bb1', '#c2503a', '#d98324']

type LedgerKind = 'receita' | 'despesa'

interface AccountFormValues {
  name: string
  kind: LedgerKind
  code: string
  color: string
}

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

export function AccountsPage() {
  const { activeOrgId, canEdit } = useActiveOrg()
  const accountsQuery = useAccounts(activeOrgId)
  const { create, update, remove } = useAccountMutations(activeOrgId)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ChartOfAccount | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ChartOfAccount | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [draftKind, setDraftKind] = useState<LedgerKind>('despesa')

  const accounts = accountsQuery.data ?? []

  // Transferências são geradas pelo sistema e não pertencem ao plano do usuário.
  const { income, expense } = useMemo(() => {
    const visible = accounts.filter((account) => account.kind !== 'transferencia')
    return {
      income: visible.filter((account) => account.kind === 'receita'),
      expense: visible.filter((account) => account.kind === 'despesa'),
    }
  }, [accounts])

  const saveError = create.error ?? update.error
  const saving = create.isPending || update.isPending

  /* -- Handlers ---------------------------------------------------------- */

  function openCreate(kind: LedgerKind = 'despesa') {
    setEditing(null)
    setDraftKind(kind)
    setNotice(null)
    setCreating(true)
  }

  function openEdit(account: ChartOfAccount) {
    setCreating(false)
    setNotice(null)
    setEditing(account)
  }

  function closeForm() {
    setCreating(false)
    setEditing(null)
    create.reset()
    update.reset()
  }

  function submit(values: AccountFormValues) {
    const payload = {
      name: values.name.trim(),
      kind: values.kind,
      code: values.code.trim() || null,
      color: values.color,
    }

    if (editing) {
      update.mutate({ id: editing.id, patch: payload }, { onSuccess: closeForm })
      return
    }

    const siblings = accounts.filter((account) => account.kind === values.kind)
    const lastOrder = siblings.reduce(
      (max, account) => Math.max(max, account.sort_order),
      0,
    )

    create.mutate(
      { org_id: activeOrgId, ...payload, sort_order: lastOrder + 1 },
      { onSuccess: closeForm },
    )
  }

  function handleDelete(account: ChartOfAccount) {
    setNotice(null)
    remove.mutate(account.id, {
      onSuccess: (result) => {
        if (result === 'archived') {
          setNotice(
            'A conta possui lançamentos e foi desativada em vez de excluída.',
          )
        }
        setConfirmDelete(null)
      },
    })
  }

  /* -- Render ------------------------------------------------------------- */

  return (
    <PageBody>
      <PageHeader
        title="Plano de contas"
        description="Categorias de receita e despesa usadas nos lançamentos"
        actions={
          canEdit && (
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => openCreate()}
            >
              Nova conta
            </Button>
          )
        }
      />

      {notice && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-[color-mix(in_oklch,var(--color-info)_25%,transparent)] bg-[var(--color-info-soft)] px-3.5 py-2.5">
          <Info className="mt-0.5 size-4 shrink-0 text-[color-mix(in_oklch,var(--color-info)_85%,black)]" />
          <p className="flex-1 text-[13px] leading-5 text-[color-mix(in_oklch,var(--color-info)_85%,black)]">
            {notice}
          </p>
          <button
            onClick={() => setNotice(null)}
            className="text-[12px] font-medium text-[color-mix(in_oklch,var(--color-info)_85%,black)] underline underline-offset-2 hover:no-underline"
          >
            Fechar
          </button>
        </div>
      )}

      {accountsQuery.isError ? (
        <Card>
          <ErrorState
            message={
              accountsQuery.error instanceof Error
                ? accountsQuery.error.message
                : 'Erro ao carregar o plano de contas.'
            }
            onRetry={() => void accountsQuery.refetch()}
          />
        </Card>
      ) : accountsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AccountsSkeleton />
          <AccountsSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AccountColumn
            title="Receitas"
            subtitle="Entradas de dinheiro"
            accounts={income}
            canEdit={canEdit}
            onCreate={() => openCreate('receita')}
            onEdit={openEdit}
            onDelete={setConfirmDelete}
          />
          <AccountColumn
            title="Despesas"
            subtitle="Saídas de dinheiro"
            accounts={expense}
            canEdit={canEdit}
            onCreate={() => openCreate('despesa')}
            onEdit={openEdit}
            onDelete={setConfirmDelete}
          />
        </div>
      )}

      {(creating || editing) && (
        <AccountFormModal
          account={editing}
          defaultKind={draftKind}
          saving={saving}
          error={saveError instanceof Error ? saveError.message : null}
          onClose={closeForm}
          onSubmit={submit}
        />
      )}

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Excluir conta"
        description="Contas com lançamentos são desativadas, preservando o histórico."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-5 text-ink-600">
          A conta{' '}
          <strong className="font-semibold text-ink-900">
            {confirmDelete?.name}
          </strong>{' '}
          será removida do plano de contas. Se já tiver sido usada em algum
          lançamento, ela apenas deixa de aparecer nas listas.
        </p>
      </Modal>
    </PageBody>
  )
}

/* -------------------------------------------------------------------------- */
/* Coluna                                                                      */
/* -------------------------------------------------------------------------- */

function AccountColumn({
  title,
  subtitle,
  accounts,
  canEdit,
  onCreate,
  onEdit,
  onDelete,
}: {
  title: string
  subtitle: string
  accounts: ChartOfAccount[]
  canEdit: boolean
  onCreate: () => void
  onEdit: (account: ChartOfAccount) => void
  onDelete: (account: ChartOfAccount) => void
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {title}
            <Badge tone="neutral">{accounts.length}</Badge>
          </span>
        }
        subtitle={subtitle}
        action={
          canEdit && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus className="size-3.5" />}
              onClick={onCreate}
            >
              Adicionar
            </Button>
          )
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-5" />}
          title={`Nenhuma conta de ${title.toLowerCase()}`}
          description="Crie categorias para classificar seus lançamentos."
        />
      ) : (
        <ul>
          {accounts.map((account) => (
            <li
              key={account.id}
              className="row-hover group flex items-center gap-3 border-b border-ink-100 px-4 py-2.5 last:border-b-0"
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: account.color ?? SWATCHES[0] }}
                aria-hidden
              />

              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[13px] font-medium',
                  account.is_active ? 'text-ink-800' : 'text-ink-400 line-through',
                )}
              >
                {account.name}
              </span>

              {account.code && (
                <span className="shrink-0 rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] tabular text-ink-500">
                  {account.code}
                </span>
              )}

              {!account.is_active && <Badge tone="caution">Inativa</Badge>}

              {canEdit && (
                <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    onClick={() => onEdit(account)}
                    title="Editar"
                    className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(account)}
                    title="Excluir"
                    className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-[var(--color-negative-soft)] hover:text-negative"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Formulário                                                                  */
/* -------------------------------------------------------------------------- */

function AccountFormModal({
  account,
  defaultKind,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  account: ChartOfAccount | null
  defaultKind: LedgerKind
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: AccountFormValues) => void
}) {
  const { register, handleSubmit, watch, setValue, formState } =
    useForm<AccountFormValues>({
      defaultValues: account
        ? {
            name: account.name,
            kind: account.kind === 'receita' ? 'receita' : 'despesa',
            code: account.code ?? '',
            color: account.color ?? SWATCHES[0]!,
          }
        : { name: '', kind: defaultKind, code: '', color: SWATCHES[0]! },
    })

  const color = watch('color')

  // A validação é feita na submissão para o erro só aparecer depois da ação.
  const { errors } = formState

  return (
    <Modal
      open
      onClose={onClose}
      title={account ? 'Editar conta' : 'Nova conta'}
      description={
        account
          ? 'Atualize os dados da categoria.'
          : 'Crie uma categoria de receita ou despesa.'
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
            {account ? 'Salvar alterações' : 'Criar conta'}
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
          label="Nome"
          required
          error={errors.name?.message}
        >
          <Input
            {...register('name', {
              validate: (value) =>
                value.trim().length > 0 || 'Informe o nome da conta.',
            })}
            placeholder="Ex.: Vendas de produtos, Aluguel…"
            invalid={Boolean(errors.name)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo" required>
            <Select {...register('kind')}>
              <option value="receita">Receita</option>
              <option value="despesa">Despesa</option>
            </Select>
          </Field>

          <Field label="Código" hint="Opcional, ajuda a ordenar o plano.">
            <Input {...register('code')} placeholder="Ex.: 3.1.01" />
          </Field>
        </div>

        <Field label="Cor" hint="Usada nos gráficos e nas listagens.">
          <div className="flex flex-wrap gap-2 pt-0.5">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => setValue('color', swatch)}
                aria-label={`Selecionar cor ${swatch}`}
                aria-pressed={color === swatch}
                className={cn(
                  'size-7 rounded-full ring-offset-2 transition-shadow',
                  color === swatch
                    ? 'ring-2 ring-ink-800'
                    : 'ring-1 ring-ink-200 hover:ring-ink-300',
                )}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  )
}

function AccountsSkeleton() {
  return (
    <div className="surface p-4">
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-5 w-full" />
        ))}
      </div>
    </div>
  )
}
