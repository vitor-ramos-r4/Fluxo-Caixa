import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LogOut,
  Upload,
  User,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useActiveOrg } from '@/contexts/OrgContext'
import { queryKeys } from '@/lib/queryClient'
import {
  bulkCreateEntries,
  createAccount,
  listAccounts,
  listEntries,
} from '@/services/api'
import {
  describeImport,
  exportMonthlyCashflow,
  parseEntriesWorkbook,
  type ParseResult,
} from '@/services/excel'
import { buildMonthSeries, cashflowFromEntries } from '@/lib/analytics'
import { currentYearRange, formatCurrency } from '@/lib/format'
import { PageBody, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Badge, Card, CardHeader } from '@/components/ui/Feedback'
import { cn } from '@/lib/cn'

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const { activeOrgId, activeOrg } = useActiveOrg()
  const queryClient = useQueryClient()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)

  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts(activeOrgId),
    queryFn: () => listAccounts(activeOrgId),
  })

  const importMutation = useMutation({
    mutationFn: async (result: ParseResult) => {
      const existing = accountsQuery.data ?? []
      const byName = new Map(existing.map((a) => [a.name.toLowerCase(), a]))

      // Cria as contas que ainda não existem, preservando a natureza
      // detectada na planilha.
      const missing = result.accounts.filter(
        (account) => !byName.has(account.name.toLowerCase()),
      )

      for (const account of missing) {
        const created = await createAccount({
          org_id: activeOrgId,
          name: account.name,
          kind: account.kind,
        })
        byName.set(created.name.toLowerCase(), created)
      }

      const rows = result.entries.map((entry) => {
        const account = byName.get(entry.accountName.toLowerCase())
        if (!account) {
          throw new Error(`Conta "${entry.accountName}" não pôde ser criada.`)
        }

        return {
          org_id: activeOrgId,
          account_id: account.id,
          wallet_id: null,
          party_id: null,
          description: entry.description,
          amount: entry.amount,
          issued_on: entry.date,
          status: (entry.paid ? 'pago' : 'em_aberto') as 'pago' | 'em_aberto',
          reference: entry.reference,
          notes: 'Importado de planilha',
        }
      })

      return bulkCreateEntries(rows)
    },
    onSuccess: (count) => {
      setImportResult(`${count} lançamentos importados com sucesso.`)
      setParsed(null)
      void queryClient.invalidateQueries({ queryKey: ['entries'] })
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      void queryClient.invalidateQueries({ queryKey: ['monthly-by-account'] })
      void queryClient.invalidateQueries({ queryKey: ['wallet-balances'] })
    },
    onError: (error) => {
      setParseError(
        error instanceof Error ? error.message : 'Falha ao importar os dados.',
      )
    },
  })

  async function handleFile(file: File) {
    setParseError(null)
    setImportResult(null)
    setParsed(null)

    try {
      const result = await parseEntriesWorkbook(file)
      setParsed(result)
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : 'Não foi possível ler o arquivo.',
      )
    }
  }

  /** Exporta o fluxo mensal do ano corrente, montado a partir dos lançamentos. */
  async function handleExportYear() {
    const { from, to } = currentYearRange()
    const { rows } = await listEntries(
      { orgId: activeOrgId, from, to },
      { limit: 2000 },
    )

    const series = buildMonthSeries(
      cashflowFromEntries(rows, activeOrgId),
      from,
      to,
      Number(activeOrg?.opening_balance ?? 0),
    )

    await exportMonthlyCashflow(activeOrg?.name ?? 'Empresa', series)
  }

  return (
    <PageBody>
      <PageHeader
        title="Configurações"
        description="Importação de dados, conta do usuário e preferências"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Importação */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Importar planilha"
            subtitle="Aceita o layout da planilha original (abas Lançamentos e Cadastros) ou qualquer arquivo com as colunas Data e Valor"
          />

          <div className="p-5">
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const file = event.dataTransfer.files[0]
                if (file) void handleFile(file)
              }}
              className={cn(
                'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                'border-ink-300 hover:border-brand-400 hover:bg-brand-50/40',
              )}
            >
              <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-ink-100 text-ink-500">
                <FileSpreadsheet className="size-5" />
              </div>
              <p className="text-[14px] font-medium text-ink-800">
                Arraste a planilha aqui
              </p>
              <p className="mt-1 max-w-md text-[12px] leading-5 text-ink-500">
                Formatos .xlsx e .xlsm. As contas que não existirem no plano de
                contas serão criadas automaticamente.
              </p>
              <Button
                variant="secondary"
                className="mt-4"
                icon={<Upload className="size-4" />}
                onClick={() => fileInputRef.current?.click()}
              >
                Selecionar arquivo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleFile(file)
                  event.target.value = ''
                }}
              />
            </div>

            {parseError && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[color-mix(in_oklch,var(--color-negative)_25%,transparent)] bg-[var(--color-negative-soft)] px-3.5 py-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negative" />
                <p className="text-[13px] leading-5 text-negative">{parseError}</p>
              </div>
            )}

            {importResult && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" />
                <p className="text-[13px] leading-5 text-brand-800">{importResult}</p>
              </div>
            )}

            {/* Prévia da importação */}
            {parsed && (
              <div className="mt-4 rounded-xl border border-ink-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
                  <div>
                    <p className="text-[13px] font-semibold text-ink-800">
                      Prévia da importação
                    </p>
                    <p className="text-[12px] text-ink-500">{describeImport(parsed)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setParsed(null)}
                      disabled={importMutation.isPending}
                    >
                      Descartar
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={importMutation.isPending}
                      onClick={() => importMutation.mutate(parsed)}
                      icon={<Download className="size-3.5 rotate-180" />}
                    >
                      Confirmar importação
                    </Button>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="th">Data</th>
                        <th className="th">Descrição</th>
                        <th className="th">Plano de conta</th>
                        <th className="th text-center">Tipo</th>
                        <th className="th text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.entries.slice(0, 50).map((entry, index) => (
                        <tr key={`${entry.date}-${index}`} className="row-hover">
                          <td className="td whitespace-nowrap">{entry.date}</td>
                          <td className="td max-w-[240px] truncate">
                            {entry.description}
                          </td>
                          <td className="td text-ink-500">{entry.accountName}</td>
                          <td className="td text-center">
                            {entry.kind === 'entrada' ? (
                              <Badge tone="positive">Entrada</Badge>
                            ) : (
                              <Badge tone="negative">Saída</Badge>
                            )}
                          </td>
                          <td className="td num text-right font-medium">
                            {formatCurrency(entry.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.entries.length > 50 && (
                    <p className="px-4 py-2.5 text-center text-[12px] text-ink-500">
                      Exibindo os primeiros 50 de {parsed.entries.length} lançamentos.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Exportação */}
        <Card>
          <CardHeader
            title="Exportar dados"
            subtitle="Baixe o fluxo mensal consolidado em Excel"
          />
          <div className="p-5">
            <p className="text-[13px] leading-5 text-ink-600">
              Gera um arquivo .xlsx com entradas, saídas, resultado e saldo
              acumulado de cada mês — no mesmo espírito da aba "Análise" da
              planilha original.
            </p>
            <Button
              variant="secondary"
              className="mt-4"
              icon={<Download className="size-4" />}
              onClick={() => void handleExportYear()}
            >
              Exportar fluxo mensal
            </Button>
            <p className="mt-2 text-[11px] text-ink-400">
              Para exportações com período personalizado e DRE completo, use a
              página de Relatórios.
            </p>
          </div>
        </Card>

        {/* Conta */}
        <Card>
          <CardHeader title="Sua conta" subtitle="Dados de acesso e sessão" />
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-ink-100 text-ink-500">
                <User className="size-4.5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink-800">
                  {(user?.user_metadata as { full_name?: string } | undefined)
                    ?.full_name ?? 'Usuário'}
                </p>
                <p className="truncate text-[12px] text-ink-500">{user?.email}</p>
              </div>
            </div>

            <dl className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-[12px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Empresa ativa</dt>
                <dd className="font-medium text-ink-700">{activeOrg?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Contas no plano</dt>
                <dd className="tabular font-medium text-ink-700">
                  {accountsQuery.data?.length ?? 0}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Último acesso</dt>
                <dd className="font-medium text-ink-700">
                  {user?.last_sign_in_at
                    ? new Date(user.last_sign_in_at).toLocaleString('pt-BR')
                    : '—'}
                </dd>
              </div>
            </dl>

            <Button
              variant="secondary"
              className="mt-4"
              icon={<LogOut className="size-4" />}
              onClick={() => void signOut()}
            >
              Sair da conta
            </Button>
          </div>
        </Card>
      </div>
    </PageBody>
  )
}
