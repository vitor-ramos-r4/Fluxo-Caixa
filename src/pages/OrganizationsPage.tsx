import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Building2,
  Check,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useOrganization } from '@/contexts/OrgContext'
import {
  archiveOrganization,
  createOrganization,
  importOrganizationFromSpreadsheet,
  seedDemoData,
  updateOrganization,
} from '@/services/api'
import {
  parseEntriesWorkbook,
  parseOrganizationWorkbook,
  type ParsedOrganization,
} from '@/services/excel'
import { formatCurrency, formatDate, initials, onlyDigits } from '@/lib/format'
import { PageBody, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Badge, Card, EmptyState, ErrorState } from '@/components/ui/Feedback'
import { CurrencyInput, Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'

/* -------------------------------------------------------------------------- */
/* Validação                                                                   */
/* -------------------------------------------------------------------------- */

const orgSchema = z.object({
  name: z.string().trim().min(2, 'Informe a razão social ou o nome fantasia.'),
  legal_name: z.string().optional(),
  document: z
    .string()
    .optional()
    .refine(
      (value) => {
        if (!value) return true
        const digits = onlyDigits(value)
        return digits.length === 0 || digits.length === 11 || digits.length === 14
      },
      { message: 'Informe um CNPJ (14 dígitos) ou CPF (11 dígitos) válido.' },
    ),
  segment: z.string().optional(),
  opening_balance: z.union([z.number(), z.literal('')]).optional(),
})

type OrgFormValues = z.infer<typeof orgSchema>

export function OrganizationsPage() {
  const queryClient = useQueryClient()
  const { organizations, activeOrgId, setActiveOrgId, loading } = useOrganization()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<(typeof organizations)[number] | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<(typeof organizations)[number] | null>(
    null,
  )
  const [seedingId, setSeedingId] = useState<string | null>(null)

  // Importação por planilha
  const [importPreview, setImportPreview] = useState<ParsedOrganization | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importFileName, setImportFileName] = useState<string | null>(null)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['organizations'] })
    void queryClient.invalidateQueries({ queryKey: ['accounts'] })
    void queryClient.invalidateQueries({ queryKey: ['wallet-balances'] })
    void queryClient.invalidateQueries({ queryKey: ['entries'] })
  }

  const saveMutation = useMutation({
    mutationFn: async ({ values, id }: { values: OrgFormValues; id?: string }) => {
      const payload = {
        name: values.name,
        legal_name: values.legal_name || null,
        document: values.document ? onlyDigits(values.document) : null,
        segment: values.segment || null,
        opening_balance:
          typeof values.opening_balance === 'number' ? values.opening_balance : 0,
      }

      return id ? updateOrganization(id, payload) : createOrganization(payload)
    },
    onSuccess: (org) => {
      invalidate()
      setCreating(false)
      setEditing(null)
      // Ao criar, já entra na empresa nova.
      if (!editing) setActiveOrgId(org.id)
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveOrganization(id),
    onSuccess: () => {
      invalidate()
      setConfirmArchive(null)
    },
  })

  const seedMutation = useMutation({
    mutationFn: (id: string) => seedDemoData(id, 12),
    onSuccess: () => {
      invalidate()
      setSeedingId(null)
    },
  })

  /** Lê a planilha (cadastro + lançamentos) e mostra a prévia antes de criar. */
  async function handleImportFile(file: File) {
    setImportError(null)
    setImportPreview(null)
    setImportFileName(null)

    try {
      const org = await parseOrganizationWorkbook(file)
      const entries = await parseEntriesWorkbook(file)
      setImportPreview({ ...org, lançamentos: entries.entries.length, contas: entries.accounts.length })
      setImportFileName(file.name)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Não foi possível ler a planilha.')
    }
  }

  const importMutation = useMutation({
    mutationFn: async (preview: ParsedOrganization) => {
      // Re-lê os lançamentos do arquivo original, pois a prévia só guarda os
      // totais — evita guardar 69 objetos em estado.
      const input = document.getElementById('import-empresa-input') as HTMLInputElement | null
      const file = input?.files?.[0]
      if (!file) throw new Error('Arquivo não encontrado. Selecione a planilha novamente.')

      const entries = await parseEntriesWorkbook(file)
      return importOrganizationFromSpreadsheet(
        {
          name: preview.name,
          legal_name: preview.legalName || undefined,
          document: preview.document ? onlyDigits(preview.document) : undefined,
          segment: preview.segment || undefined,
        },
        entries.accounts.map((a) => ({ name: a.name, kind: a.kind })),
        entries.entries.map((e) => ({
          date: e.date,
          description: e.description,
          accountName: e.accountName,
          amount: e.amount,
          kind: e.kind,
          status: e.paid ? 'pago' : 'em_aberto',
          reference: e.reference,
        })),
      )
    },
    onSuccess: (result) => {
      invalidate()
      // Entra direto na empresa recém-importada.
      setActiveOrgId(result.organization.id)
      setImportPreview(null)
      setImportFileName(null)
      setImporting(false)
    },
  })

  function confirmImport() {
    if (!importPreview) return
    setImporting(true)
    importMutation.mutate(importPreview)
  }

  return (
    <PageBody>
      <PageHeader
        title="Empresas"
        description="Cada empresa tem seu próprio plano de contas, contas bancárias e lançamentos"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet className="size-4" />}
              onClick={() => document.getElementById('import-empresa-input')?.click()}
            >
              Importar empresa
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => setCreating(true)}
            >
              Nova empresa
            </Button>
            <input
              id="import-empresa-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleImportFile(file)
                event.target.value = ''
              }}
            />
          </>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-ink-400" />
        </div>
      ) : organizations.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="size-5" />}
            title="Nenhuma empresa cadastrada"
            description="Cadastre sua primeira empresa para começar a registrar lançamentos. O plano de contas padrão é criado automaticamente."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                Cadastrar empresa
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {organizations.map((org) => {
            const isActive = org.id === activeOrgId

            return (
              <Card
                key={org.id}
                className={cn(
                  'p-4 transition-shadow',
                  isActive && 'ring-2 ring-brand-500/25 border-brand-300',
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold',
                      isActive
                        ? 'bg-brand-600 text-white'
                        : 'bg-ink-100 text-ink-600',
                    )}
                  >
                    {initials(org.name, 1)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-semibold text-ink-900">
                        {org.name}
                      </p>
                      {isActive && <Badge tone="positive">Ativa</Badge>}
                    </div>
                    {org.legal_name && org.legal_name !== org.name && (
                      <p className="truncate text-[12px] text-ink-500">
                        {org.legal_name}
                      </p>
                    )}
                  </div>
                </div>

                <dl className="mt-3.5 space-y-1.5 text-[12px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">CNPJ/CPF</dt>
                    <dd className="truncate font-medium text-ink-700">
                      {org.document
                        ? org.document.replace(
                            /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
                            '$1.$2.$3/$4-$5',
                          )
                        : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">Saldo inicial</dt>
                    <dd className="tabular font-medium text-ink-700">
                      {formatCurrency(Number(org.opening_balance))}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">Início</dt>
                    <dd className="font-medium text-ink-700">
                      {formatDate(org.starts_on)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">Seu papel</dt>
                    <dd className="font-medium capitalize text-ink-700">
                      {org.role === 'owner' ? 'Proprietário' : org.role}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center gap-2 border-t border-ink-100 pt-3">
                  {isActive ? (
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-brand-700">
                      <Check className="size-3.5" />
                      Em uso
                    </span>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setActiveOrgId(org.id)}
                    >
                      Usar esta empresa
                    </Button>
                  )}

                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => setEditing(org)}
                      title="Editar"
                      className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmArchive(org)}
                      title="Arquivar"
                      className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-[var(--color-negative-soft)] hover:text-negative"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            )
          })}

          {/* Atalho para popular dados de demonstração */}
          <Card className="border-dashed p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                <Sparkles className="size-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-ink-900">
                  Dados de demonstração
                </p>
                <p className="mt-0.5 text-[12px] leading-4.5 text-ink-500">
                  Gera 12 meses de lançamentos sintéticos na empresa ativa para
                  você explorar relatórios e gráficos.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  loading={seedMutation.isPending && seedingId === activeOrgId}
                  disabled={!activeOrgId}
                  onClick={() => {
                    if (!activeOrgId) return
                    setSeedingId(activeOrgId)
                    seedMutation.mutate(activeOrgId)
                  }}
                >
                  Gerar lançamentos
                </Button>
                {seedMutation.isError && (
                  <p className="mt-2 text-[11px] text-negative">
                    {seedMutation.error instanceof Error
                      ? seedMutation.error.message
                      : 'Falha ao gerar dados.'}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Modal de criação/edição */}
      {(creating || editing) && (
        <OrganizationModal
          organization={editing}
          saving={saveMutation.isPending}
          error={
            saveMutation.error instanceof Error ? saveMutation.error.message : null
          }
          onClose={() => {
            setCreating(false)
            setEditing(null)
            saveMutation.reset()
          }}
          onSubmit={(values) =>
            saveMutation.mutate({ values, id: editing?.id })
          }
        />
      )}

      {/* Confirmação de arquivamento */}
      <Modal
        open={Boolean(confirmArchive)}
        onClose={() => setConfirmArchive(null)}
        title="Arquivar empresa"
        description="A empresa sai da listagem, mas os dados permanecem no banco."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmArchive(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={archiveMutation.isPending}
              onClick={() =>
                confirmArchive && archiveMutation.mutate(confirmArchive.id)
              }
            >
              Arquivar
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-5 text-ink-600">
          A empresa{' '}
          <strong className="font-semibold text-ink-900">
            {confirmArchive?.name}
          </strong>{' '}
          deixará de aparecer na seleção. Nenhum lançamento é apagado — é
          possível reativá-la depois direto no banco, se necessário.
        </p>
      </Modal>

      {/* Prévia da importação por planilha */}
      <Modal
        open={Boolean(importPreview) || Boolean(importError)}
        onClose={() => {
          setImportPreview(null)
          setImportError(null)
          setImportFileName(null)
        }}
        title="Importar empresa da planilha"
        description={
          importPreview
            ? `Dados lidos de ${importFileName ?? 'planilha'} — confira antes de criar.`
            : undefined
        }
        footer={
          importPreview ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setImportPreview(null)
                  setImportFileName(null)
                }}
                disabled={importing}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                loading={importing || importMutation.isPending}
                icon={<Check className="size-4" />}
                onClick={confirmImport}
              >
                Criar empresa
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setImportError(null)}>
              Fechar
            </Button>
          )
        }
      >
        {importError ? (
          <div
            role="alert"
            className="rounded-lg border border-[color-mix(in_oklch,var(--color-caution)_32%,transparent)] bg-[var(--color-caution-soft)] px-3.5 py-3 text-[13px] leading-5 text-[color-mix(in_oklch,var(--color-caution)_70%,black)]"
          >
            {importError}
          </div>
        ) : importPreview ? (
          <div className="space-y-4">
            {importMutation.isError && (
              <div className="rounded-lg border border-[color-mix(in_oklch,var(--color-negative)_25%,transparent)] bg-[var(--color-negative-soft)] px-3.5 py-2.5 text-[13px] text-negative">
                {importMutation.error instanceof Error
                  ? importMutation.error.message
                  : 'Não foi possível criar a empresa.'}
              </div>
            )}

            <dl className="space-y-2.5 text-[13px]">
              <div className="flex items-start gap-3">
                <dt className="w-28 shrink-0 text-[12px] text-ink-500">Nome</dt>
                <dd className="font-semibold text-ink-900">{importPreview.name}</dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="w-28 shrink-0 text-[12px] text-ink-500">Razão social</dt>
                <dd className="text-ink-700">{importPreview.legalName ?? '—'}</dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="w-28 shrink-0 text-[12px] text-ink-500">CNPJ/CPF</dt>
                <dd className="text-ink-700">
                  {importPreview.document
                    ? importPreview.document.replace(
                        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
                        '$1.$2.$3/$4-$5',
                      )
                    : '—'}
                </dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="w-28 shrink-0 text-[12px] text-ink-500">Segmento</dt>
                <dd className="text-ink-700">{importPreview.segment ?? '—'}</dd>
              </div>
              {(importPreview.lançamentos !== undefined || importPreview.contas !== undefined) && (
                <div className="flex items-start gap-3 border-t border-ink-100 pt-3">
                  <dt className="w-28 shrink-0 text-[12px] text-ink-500">Movimentos</dt>
                  <dd className="text-ink-700">
                    {importPreview.lançamentos ?? 0} lançamento
                    {(importPreview.lançamentos ?? 0) === 1 ? '' : 's'} em{' '}
                    {importPreview.contas ?? 0} conta
                    {(importPreview.contas ?? 0) === 1 ? '' : 's'}
                  </dd>
                </div>
              )}
            </dl>

            <div className="flex items-start gap-2.5 rounded-lg border border-ink-200 bg-ink-50 px-3.5 py-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-ink-400" />
              <p className="text-[12px] leading-5 text-ink-600">
                O plano de contas padrão é criado automaticamente; as contas da
                planilha que ainda não existem também entram, e{' '}
                {importPreview.lançamentos ?? 0} movimentos serão importados
                junto com a empresa.
              </p>
            </div>
          </div>
        ) : null}
      </Modal>

      {archiveMutation.isError && (
        <Card className="mt-4">
          <ErrorState
            message={
              archiveMutation.error instanceof Error
                ? archiveMutation.error.message
                : 'Não foi possível arquivar.'
            }
          />
        </Card>
      )}
    </PageBody>
  )
}

/* -------------------------------------------------------------------------- */
/* Formulário                                                                  */
/* -------------------------------------------------------------------------- */

function OrganizationModal({
  organization,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  organization: { id: string; name: string; legal_name: string | null; document: string | null; segment: string | null; opening_balance: number } | null
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: OrgFormValues) => void
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: organization
      ? {
          name: organization.name,
          legal_name: organization.legal_name ?? '',
          document: organization.document ?? '',
          segment: organization.segment ?? '',
          opening_balance: Number(organization.opening_balance),
        }
      : {
          name: '',
          legal_name: '',
          document: '',
          segment: '',
          opening_balance: 0,
        },
  })

  const openingBalance = watch('opening_balance')

  return (
    <Modal
      open
      onClose={onClose}
      title={organization ? 'Editar empresa' : 'Nova empresa'}
      description={
        organization
          ? 'Atualize os dados cadastrais.'
          : 'Ao criar, o plano de contas padrão é gerado automaticamente.'
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
          >
            {organization ? 'Salvar' : 'Criar empresa'}
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

        <Field label="Nome da empresa" required error={errors.name?.message}>
          <Input
            {...register('name')}
            placeholder="Ex.: Mega Comércio"
            invalid={Boolean(errors.name)}
            autoFocus
          />
        </Field>

        <Field label="Razão social" hint="Opcional — se for diferente do nome fantasia.">
          <Input {...register('legal_name')} placeholder="Mega Comércio S.A." />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="CNPJ ou CPF" error={errors.document?.message} hint="Somente números.">
            <Input
              {...register('document')}
              placeholder="00.000.000/0000-00"
              invalid={Boolean(errors.document)}
            />
          </Field>

          <Field label="Segmento" hint="Opcional.">
            <Input {...register('segment')} placeholder="Comércio, serviços…" />
          </Field>
        </div>

        <Field
          label="Saldo inicial de caixa"
          hint="Quanto havia em caixa antes do primeiro lançamento registrado."
        >
          <CurrencyInput
            value={openingBalance ?? ''}
            onValueChange={(value) => setValue('opening_balance', value)}
            placeholder="0,00"
          />
        </Field>
      </form>
    </Modal>
  )
}
