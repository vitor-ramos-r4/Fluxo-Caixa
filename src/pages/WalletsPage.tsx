import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CreditCard,
  Pencil,
  Plus,
  Trash2,
  Wallet as WalletIcon,
} from 'lucide-react'
import { useActiveOrg } from '@/contexts/OrgContext'
import { useWalletBalances, useWalletMutations, useWallets } from '@/hooks/useCatalog'
import { PageBody, PageHeader, StatCard, StatGrid } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { CurrencyInput, Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import { formatCurrency } from '@/lib/format'
import type { Wallet, WalletBalance, WalletKind } from '@/lib/types'

const KIND_LABELS: Record<WalletKind, string> = {
  corrente: 'Conta corrente',
  poupanca: 'Poupança',
  caixa: 'Caixa',
  investimento: 'Investimento',
  cartao: 'Cartão',
}

const KIND_OPTIONS = Object.entries(KIND_LABELS) as [WalletKind, string][]

/** Paleta fixa de identificação — cores livres escapariam do tema. */
const SWATCHES = ['#1c7a50', '#26a269', '#3d7ea6', '#8b6bb1', '#d98324', '#c2503a']

interface WalletFormValues {
  name: string
  kind: WalletKind
  bank_name: string
  branch: string
  account_number: string
  opening_balance: number | ''
  color: string
}

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

export function WalletsPage() {
  const { activeOrgId, canEdit } = useActiveOrg()
  const walletsQuery = useWallets(activeOrgId)
  const balancesQuery = useWalletBalances(activeOrgId)
  const { create, update, remove } = useWalletMutations(activeOrgId)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Wallet | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Wallet | null>(null)

  const wallets = walletsQuery.data ?? []
  const balances = balancesQuery.data ?? []

  // Os saldos vêm de uma view; quem manda na listagem é a tabela de carteiras.
  const balanceByWallet = useMemo(() => {
    const map = new Map<string, WalletBalance>()
    for (const balance of balances) map.set(balance.wallet_id, balance)
    return map
  }, [balances])

  const totals = useMemo(
    () =>
      balances.reduce(
        (acc, balance) => ({
          current: acc.current + Number(balance.current_balance),
          pendingIncome: acc.pendingIncome + Number(balance.pending_income),
          pendingExpense: acc.pendingExpense + Number(balance.pending_expense),
        }),
        { current: 0, pendingIncome: 0, pendingExpense: 0 },
      ),
    [balances],
  )

  const activeCount = wallets.filter((wallet) => wallet.is_active).length

  const loading = walletsQuery.isLoading || balancesQuery.isLoading
  const error = walletsQuery.error ?? balancesQuery.error
  const saveError = create.error ?? update.error

  /* -- Handlers ---------------------------------------------------------- */

  function closeForm() {
    setCreating(false)
    setEditing(null)
    create.reset()
    update.reset()
  }

  function submit(values: WalletFormValues) {
    const payload = {
      name: values.name.trim(),
      kind: values.kind,
      bank_name: values.bank_name.trim() || null,
      branch: values.branch.trim() || null,
      account_number: values.account_number.trim() || null,
      opening_balance:
        typeof values.opening_balance === 'number' ? values.opening_balance : 0,
      color: values.color,
    }

    if (editing) {
      update.mutate({ id: editing.id, patch: payload }, { onSuccess: closeForm })
      return
    }

    create.mutate({ org_id: activeOrgId, ...payload }, { onSuccess: closeForm })
  }

  /* -- Render ------------------------------------------------------------- */

  return (
    <PageBody>
      <PageHeader
        title="Contas e caixas"
        description="Onde o dinheiro entra, sai e fica parado"
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
              Nova conta
            </Button>
          )
        }
      />

      <StatGrid cols={4}>
        <StatCard
          label="Saldo atual"
          value={formatCurrency(totals.current)}
          tone={totals.current >= 0 ? 'neutral' : 'negative'}
          icon={<WalletIcon className="size-4" />}
          context="Somatório de todas as contas"
        />
        <StatCard
          label="A receber"
          value={formatCurrency(totals.pendingIncome)}
          tone="positive"
          icon={<ArrowUpRight className="size-4" />}
          context="Entradas ainda em aberto"
        />
        <StatCard
          label="A pagar"
          value={formatCurrency(totals.pendingExpense)}
          tone="negative"
          icon={<ArrowDownRight className="size-4" />}
          context="Saídas ainda em aberto"
        />
        <StatCard
          label="Contas ativas"
          value={String(activeCount)}
          context={`${wallets.length} cadastradas`}
        />
      </StatGrid>

      {error ? (
        <Card className="mt-4">
          <ErrorState
            message={error instanceof Error ? error.message : 'Erro ao carregar as contas.'}
            onRetry={() => {
              void walletsQuery.refetch()
              void balancesQuery.refetch()
            }}
          />
        </Card>
      ) : loading ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <WalletSkeleton key={index} />
          ))}
        </div>
      ) : wallets.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={<WalletIcon className="size-5" />}
            title="Nenhuma conta cadastrada"
            description="Cadastre a conta bancária, a poupança ou o caixa onde o dinheiro circula."
            action={
              canEdit ? (
                <Button
                  variant="primary"
                  icon={<Plus className="size-4" />}
                  onClick={() => setCreating(true)}
                >
                  Nova conta
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {wallets.map((wallet) => (
            <WalletCard
              key={wallet.id}
              wallet={wallet}
              balance={balanceByWallet.get(wallet.id) ?? null}
              canEdit={canEdit}
              onEdit={() => {
                setCreating(false)
                setEditing(wallet)
              }}
              onDelete={() => setConfirmDelete(wallet)}
            />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <WalletFormModal
          wallet={editing}
          saving={create.isPending || update.isPending}
          error={saveError instanceof Error ? saveError.message : null}
          onClose={closeForm}
          onSubmit={submit}
        />
      )}

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Excluir conta"
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
              onClick={() => confirmDelete && remove.mutate(confirmDelete.id, {
                onSuccess: () => setConfirmDelete(null),
              })}
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
          será removida. Lançamentos vinculados a ela ficarão sem conta.
        </p>
      </Modal>
    </PageBody>
  )
}

/* -------------------------------------------------------------------------- */
/* Cartão                                                                      */
/* -------------------------------------------------------------------------- */

function WalletCard({
  wallet,
  balance,
  canEdit,
  onEdit,
  onDelete,
}: {
  wallet: Wallet
  balance: WalletBalance | null
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const current = Number(balance?.current_balance ?? wallet.opening_balance)
  const pendingIncome = Number(balance?.pending_income ?? 0)
  const pendingExpense = Number(balance?.pending_expense ?? 0)

  const branchLine = [
    wallet.bank_name,
    wallet.branch ? `Ag. ${wallet.branch}` : null,
    wallet.account_number ? `C/C ${wallet.account_number}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card className="group flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: wallet.color }}
            aria-hidden
          >
            {wallet.kind === 'cartao' ? (
              <CreditCard className="size-4" />
            ) : (
              <WalletIcon className="size-4" />
            )}
          </span>

          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink-900">
              {wallet.name}
            </p>
            <p className="truncate text-[11px] text-ink-400">
              {KIND_LABELS[wallet.kind]}
            </p>
          </div>
        </div>

        {canEdit && (
          <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={onEdit}
              title="Editar"
              className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              onClick={onDelete}
              title="Excluir"
              className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-[var(--color-negative-soft)] hover:text-negative"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {branchLine && (
        <p className="mt-2 truncate text-[11px] tabular text-ink-400">
          {branchLine}
        </p>
      )}

      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-500">
          Saldo atual
        </p>
        <p
          className={cn(
            'mt-0.5 text-[20px] font-semibold leading-7 tabular tracking-tight',
            current < 0 ? 'text-negative' : 'text-ink-900',
          )}
        >
          {formatCurrency(current)}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink-100 pt-2.5">
        <span className="text-[11px] text-ink-500">
          A receber{' '}
          <strong className="tabular font-medium text-brand-700">
            {formatCurrency(pendingIncome)}
          </strong>
        </span>
        <span className="text-[11px] text-ink-500">
          A pagar{' '}
          <strong className="tabular font-medium text-negative">
            {formatCurrency(pendingExpense)}
          </strong>
        </span>
      </div>

      {!wallet.is_active && (
        <Badge tone="caution" className="mt-2.5 self-start">
          Inativa
        </Badge>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Formulário                                                                  */
/* -------------------------------------------------------------------------- */

function WalletFormModal({
  wallet,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  wallet: Wallet | null
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: WalletFormValues) => void
}) {
  const { register, handleSubmit, watch, setValue, formState } =
    useForm<WalletFormValues>({
      defaultValues: wallet
        ? {
            name: wallet.name,
            kind: wallet.kind,
            bank_name: wallet.bank_name ?? '',
            branch: wallet.branch ?? '',
            account_number: wallet.account_number ?? '',
            opening_balance: Number(wallet.opening_balance),
            color: wallet.color,
          }
        : {
            name: '',
            kind: 'corrente',
            bank_name: '',
            branch: '',
            account_number: '',
            opening_balance: '',
            color: SWATCHES[0]!,
          },
    })

  const color = watch('color')
  const openingBalance = watch('opening_balance')
  const { errors } = formState

  return (
    <Modal
      open
      onClose={onClose}
      title={wallet ? 'Editar conta' : 'Nova conta'}
      description={
        wallet
          ? 'Atualize os dados da conta ou caixa.'
          : 'Cadastre onde o dinheiro entra e sai.'
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
            {wallet ? 'Salvar alterações' : 'Criar conta'}
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
                value.trim().length > 0 || 'Informe o nome da conta.',
            })}
            placeholder="Ex.: Banco Inter, Caixa da loja…"
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

          <Field label="Banco">
            <Input {...register('bank_name')} placeholder="Ex.: Banco do Brasil" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Agência">
            <Input {...register('branch')} placeholder="0001" />
          </Field>

          <Field label="Número da conta">
            <Input {...register('account_number')} placeholder="12345-6" />
          </Field>
        </div>

        <Field
          label="Saldo inicial"
          hint="Valor que já existia na conta antes do primeiro lançamento."
        >
          <CurrencyInput
            value={openingBalance}
            onValueChange={(value) => setValue('opening_balance', value)}
            placeholder="0,00"
          />
        </Field>

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

function WalletSkeleton() {
  return (
    <div className="surface p-4">
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="mt-4 h-3 w-16" />
      <Skeleton className="mt-2 h-6 w-32" />
    </div>
  )
}
