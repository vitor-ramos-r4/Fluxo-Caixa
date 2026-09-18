import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRightLeft, Check, Info, Plus } from 'lucide-react'
import { useActiveOrg } from '@/contexts/OrgContext'
import { createTransfer, listTransfers } from '@/services/api'
import { useWallets } from '@/hooks/useCatalog'
import { formatCurrency, formatDate, toDateOnly } from '@/lib/format'
import { PageBody, PageHeader, StatCard, StatGrid } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import { CurrencyInput, Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'

/* -------------------------------------------------------------------------- */
/* Validação                                                                   */
/* -------------------------------------------------------------------------- */

const transferSchema = z
  .object({
    from_wallet_id: z.string().min(1, 'Selecione a conta de origem.'),
    to_wallet_id: z.string().min(1, 'Selecione a conta de destino.'),
    amount: z
      .union([z.number(), z.literal('')])
      .refine((v) => typeof v === 'number' && v > 0, {
        message: 'Informe um valor maior que zero.',
      }),
    date: z.string().min(1, 'Informe a data.'),
    description: z.string().optional(),
  })
  // Origem igual a destino zeraria o saldo sem mover nada: barramos aqui.
  .refine((values) => values.from_wallet_id !== values.to_wallet_id, {
    message: 'A conta de destino precisa ser diferente da origem.',
    path: ['to_wallet_id'],
  })

type TransferFormValues = z.infer<typeof transferSchema>

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

export function TransfersPage() {
  const { activeOrgId, canEdit } = useActiveOrg()
  const queryClient = useQueryClient()

  const [creating, setCreating] = useState(false)

  const transfersQuery = useQuery({
    queryKey: ['transfers', activeOrgId],
    queryFn: () => listTransfers(activeOrgId),
  })

  const walletsQuery = useWallets(activeOrgId)

  const transfers = transfersQuery.data ?? []
  const wallets = walletsQuery.data ?? []
  const activeWallets = wallets.filter((wallet) => wallet.is_active)

  const total = useMemo(
    () =>
      (transfersQuery.data ?? []).reduce(
        (sum, transfer) => sum + Number(transfer.amount),
        0,
      ),
    [transfersQuery.data],
  )

  const createMutation = useMutation({
    mutationFn: (values: TransferFormValues) =>
      createTransfer({
        orgId: activeOrgId,
        fromWalletId: values.from_wallet_id,
        toWalletId: values.to_wallet_id,
        amount: values.amount as number,
        date: values.date,
        description: values.description?.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transfers'] })
      void queryClient.invalidateQueries({ queryKey: ['wallet-balances'] })
      void queryClient.invalidateQueries({ queryKey: ['entries'] })
      void queryClient.invalidateQueries({ queryKey: ['monthly-by-account'] })
      setCreating(false)
      createMutation.reset()
    },
  })

  return (
    <PageBody>
      <PageHeader
        title="Transferências"
        description="Movimentações entre as suas próprias contas"
        actions={
          canEdit && (
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => setCreating(true)}
              disabled={activeWallets.length < 2}
            >
              Nova transferência
            </Button>
          )
        }
      />

      <StatGrid cols={3}>
        <StatCard
          label="Transferências"
          value={String(transfers.length)}
          context="Pares registrados"
        />
        <StatCard
          label="Valor total"
          value={formatCurrency(total)}
          context="Somatório das transferências"
        />
        <StatCard
          label="Contas ativas"
          value={String(activeWallets.length)}
          context="Disponíveis para movimentar"
        />
      </StatGrid>

      {/* Nota explicativa */}
      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[color-mix(in_oklch,var(--color-info)_22%,transparent)] bg-[var(--color-info-soft)] px-3.5 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-[color-mix(in_oklch,var(--color-info)_85%,black)]" />
        <p className="text-[13px] leading-5 text-ink-700">
          Transferências movem dinheiro entre as suas próprias contas e
          <strong className="font-semibold"> não afetam o resultado</strong>:
          ficam fora do DRE e dos relatórios de receita e despesa.
        </p>
      </div>

      {/* Histórico */}
      <Card className="mt-4 overflow-hidden">
        {transfersQuery.isError ? (
          <ErrorState
            message={
              transfersQuery.error instanceof Error
                ? transfersQuery.error.message
                : 'Erro ao carregar transferências.'
            }
            onRetry={() => void transfersQuery.refetch()}
          />
        ) : transfersQuery.isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : transfers.length === 0 ? (
          <EmptyState
            icon={<ArrowRightLeft className="size-5" />}
            title="Nenhuma transferência registrada"
            description="Transferências movem valores entre as suas contas — por exemplo, um aporte do caixa para o banco — sem alterar o resultado da empresa, pois ficam fora do DRE e dos relatórios."
            action={
              canEdit && activeWallets.length >= 2 ? (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Nova transferência
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <th className="th">Data</th>
                  <th className="th">Origem</th>
                  <th className="th">Destino</th>
                  <th className="th">Descrição</th>
                  <th className="th text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((transfer) => (
                  <tr key={transfer.group} className="row-hover">
                    <td className="td whitespace-nowrap">
                      {formatDate(transfer.date)}
                    </td>
                    <td className="td text-ink-600">{transfer.from ?? '—'}</td>
                    <td className="td text-ink-600">{transfer.to ?? '—'}</td>
                    <td className="td max-w-[280px]">
                      <p className="truncate text-ink-700">
                        {transfer.description}
                      </p>
                    </td>
                    <td className="td num whitespace-nowrap text-right font-semibold text-ink-800">
                      {formatCurrency(Number(transfer.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <TransferFormModal
          wallets={activeWallets.map((wallet) => ({
            id: wallet.id,
            name: wallet.name,
          }))}
          saving={createMutation.isPending}
          error={
            createMutation.error instanceof Error
              ? createMutation.error.message
              : null
          }
          onClose={() => {
            setCreating(false)
            createMutation.reset()
          }}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      )}
    </PageBody>
  )
}

/* -------------------------------------------------------------------------- */
/* Formulário                                                                  */
/* -------------------------------------------------------------------------- */

function TransferFormModal({
  wallets,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  wallets: { id: string; name: string }[]
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: TransferFormValues) => void
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      from_wallet_id: wallets[0]?.id ?? '',
      to_wallet_id: wallets[1]?.id ?? '',
      amount: '',
      date: toDateOnly(new Date()),
      description: '',
    },
  })

  const amount = watch('amount')

  return (
    <Modal
      open
      onClose={onClose}
      title="Nova transferência"
      description="Mova um valor entre as suas contas sem passar pelo resultado."
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
            Transferir
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Conta de origem"
            required
            error={errors.from_wallet_id?.message}
          >
            <Select
              {...register('from_wallet_id')}
              invalid={Boolean(errors.from_wallet_id)}
            >
              <option value="">Selecione…</option>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Conta de destino"
            required
            error={errors.to_wallet_id?.message}
          >
            <Select
              {...register('to_wallet_id')}
              invalid={Boolean(errors.to_wallet_id)}
            >
              <option value="">Selecione…</option>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

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

          <Field label="Data" required error={errors.date?.message}>
            <Input
              type="date"
              {...register('date')}
              invalid={Boolean(errors.date)}
            />
          </Field>
        </div>

        <Field label="Descrição" hint="Opcional — ajuda a identificar a origem do valor.">
          <Input
            {...register('description')}
            placeholder="Transferência entre contas"
          />
        </Field>

        {/* Efeito contábil: dois lançamentos ligados, ambos fora do resultado. */}
        <div
          className={cn(
            'flex items-start gap-2.5 rounded-lg px-3.5 py-3',
            'border border-[color-mix(in_oklch,var(--color-info)_22%,transparent)] bg-[var(--color-info-soft)]',
          )}
        >
          <Info className="mt-0.5 size-4 shrink-0 text-[color-mix(in_oklch,var(--color-info)_85%,black)]" />
          <p className="text-[12px] leading-5 text-ink-700">
            A transferência cria dois lançamentos vinculados — uma saída na
            conta de origem e uma entrada na conta de destino. Os dois ficam
            marcados como transferência e são excluídos dos relatórios de
            receita e despesa.
          </p>
        </div>
      </form>
    </Modal>
  )
}
