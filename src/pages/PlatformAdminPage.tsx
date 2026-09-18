import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Building2,
  Check,
  Globe,
  Info,
  Search,
  Shield,
  ShieldOff,
  UserCog,
} from 'lucide-react'
import { useOrganization } from '@/contexts/OrgContext'
import { listAllOrganizations, setSuperAdmin } from '@/services/api'
import { formatDate, onlyDigits } from '@/lib/format'
import { PageBody, PageHeader, StatCard, StatGrid } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  TableSkeleton,
} from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'

/** Formata CNPJ/CPF a partir dos dígitos crus. */
function formatDoc(doc: string | null): string {
  if (!doc) return '—'
  const d = onlyDigits(doc)
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return doc
}

/**
 * Administração da plataforma.
 *
 * Visível apenas para o super_admin: enxerga todas as empresas do sistema,
 * de qualquer conta. É um painel de operação — serve para suporte e visão
 * consolidada, não para o trabalho do dia a dia.
 */
export function PlatformAdminPage() {
  const { setActiveOrgId } = useOrganization()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [granting, setGranting] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(
    null,
  )

  /*
   * A verificação de privilégio é feita pelo banco: `list_all_organizations`
   * levanta exceção para quem não é administrador global. Assim não existe
   * um estado de "tela liberada no cliente, bloqueada no servidor" — a única
   * fonte de verdade é a RPC.
   */
  const orgsQuery = useQuery({
    queryKey: ['platform-organizations'],
    queryFn: listAllOrganizations,
  })

  const all = orgsQuery.data ?? []

  const orgs = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return all
    return all.filter(
      (o) =>
        o.name.toLowerCase().includes(term) ||
        (o.document ?? '').includes(onlyDigits(term)) ||
        o.owner_email.toLowerCase().includes(term),
    )
  }, [all, search])

  const stats = useMemo(
    () => ({
      total: all.length,
      mine: all.filter((o) => o.is_mine).length,
      others: all.filter((o) => !o.is_mine).length,
      entries: all.reduce((sum, o) => sum + Number(o.entry_count), 0),
    }),
    [all],
  )

  const grantMutation = useMutation({
    mutationFn: (input: { email: string; enabled: boolean }) =>
      setSuperAdmin(input.email, input.enabled),
    onSuccess: (result) => {
      if (result.outcome === 'granted' || result.outcome === 'revoked') {
        setFeedback({ tone: 'ok', text: result.message })
        setGranting(false)
        void queryClient.invalidateQueries({ queryKey: ['platform-organizations'] })
      } else {
        setFeedback({ tone: 'warn', text: result.message })
      }
    },
  })

  // A verificação de acesso vem depois de todos os hooks: um `return`
  // antecipado mudaria a ordem das chamadas entre renders, o que o React
  // proíbe. A fonte de verdade continua sendo o banco, que levanta exceção
  // em `list_all_organizations` para quem não é administrador global.
  const denied =
    orgsQuery.isError &&
    /administradores da plataforma|permission|permiss/i.test(
      orgsQuery.error instanceof Error ? orgsQuery.error.message : '',
    )

  if (denied) {
    return (
      <PageBody>
        <PageHeader
          title="Administração da plataforma"
          description="Área restrita a administradores globais"
        />
        <Card>
          <EmptyState
            icon={<ShieldOff className="size-5" />}
            title="Acesso restrito"
            description="Esta área é exclusiva de administradores globais da plataforma. Suas empresas continuam disponíveis normalmente no restante do sistema."
            action={
              <Link to="/">
                <Button variant="secondary">Voltar para a visão geral</Button>
              </Link>
            }
          />
        </Card>
      </PageBody>
    )
  }

  return (
    <PageBody>
      <PageHeader
        title="Administração da plataforma"
        description="Todas as empresas do sistema, de todas as contas"
        actions={
          <Button
            variant="secondary"
            icon={<UserCog className="size-4" />}
            onClick={() => {
              setFeedback(null)
              setGranting(true)
            }}
          >
            Conceder acesso global
          </Button>
        }
      />

      {feedback && (
        <div
          className={cn(
            'mb-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-3',
            feedback.tone === 'ok'
              ? 'border-brand-200 bg-brand-50 text-brand-800'
              : 'border-[color-mix(in_oklch,var(--color-caution)_32%,transparent)] bg-[var(--color-caution-soft)] text-[color-mix(in_oklch,var(--color-caution)_70%,black)]',
          )}
        >
          {feedback.tone === 'ok' ? (
            <Check className="mt-0.5 size-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0" />
          )}
          <p className="flex-1 text-[13px] leading-5">{feedback.text}</p>
        </div>
      )}

      <StatGrid cols={4}>
        <StatCard
          label="Empresas"
          value={String(stats.total)}
          icon={<Building2 className="size-4" />}
          context="Em todo o sistema"
        />
        <StatCard
          label="Suas"
          value={String(stats.mine)}
          context="Onde você é membro"
        />
        <StatCard
          label="De outras contas"
          value={String(stats.others)}
          context="Acesso via privilégio global"
        />
        <StatCard
          label="Lançamentos"
          value={String(stats.entries)}
          context="Somando todas as empresas"
        />
      </StatGrid>

      <Card className="mt-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Buscar" className="min-w-[240px] flex-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
              <Input
                placeholder="Nome, CNPJ ou e-mail do responsável"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-8"
              />
            </div>
          </Field>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <CardHeader
          title="Todas as empresas"
          subtitle={`${orgs.length} de ${all.length} ${all.length === 1 ? 'empresa' : 'empresas'}`}
        />

        {orgsQuery.isError ? (
          <ErrorState
            message={
              orgsQuery.error instanceof Error
                ? orgsQuery.error.message
                : 'Erro ao carregar as empresas.'
            }
            onRetry={() => void orgsQuery.refetch()}
          />
        ) : orgsQuery.isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : orgs.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-5" />}
            title={search ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa no sistema'}
            description={
              search
                ? 'Ajuste a busca para ver outros resultados.'
                : 'Nenhuma conta cadastrou empresas ainda.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr>
                  <th className="th">Empresa</th>
                  <th className="th">Responsável</th>
                  <th className="th text-center">Equipe</th>
                  <th className="th text-center">Lançamentos</th>
                  <th className="th">Origem</th>
                  <th className="th w-24 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => (
                  <tr key={org.id} className="row-hover">
                    <td className="td">
                      <p className="font-medium text-ink-800">{org.name}</p>
                      <p className="text-[11px] text-ink-500">
                        {formatDoc(org.document)}
                        {org.segment && ` · ${org.segment}`}
                      </p>
                    </td>
                    <td className="td">
                      <p className="truncate text-[13px] text-ink-700">
                        {org.owner_email}
                      </p>
                      <p className="text-[11px] text-ink-400">
                        criada em {formatDate(org.created_at)}
                      </p>
                    </td>
                    <td className="td text-center tabular text-ink-600">
                      {org.member_count}
                    </td>
                    <td className="td text-center tabular text-ink-600">
                      {org.entry_count}
                    </td>
                    <td className="td">
                      {org.is_mine ? (
                        <Badge tone="positive">Sua</Badge>
                      ) : (
                        <Badge tone="info" dot>
                          <Globe className="size-3" />
                          Outra conta
                        </Badge>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex justify-end">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setActiveOrgId(org.id)}
                        >
                          Abrir
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Níveis de administração"
          subtitle="Como o acesso funciona neste sistema"
        />
        <ul className="divide-y divide-ink-100">
          <li className="flex items-start gap-3 px-5 py-3.5">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
              <Globe className="size-3.5" />
            </span>
            <div>
              <p className="text-[13px] font-medium text-ink-800">
                Administrador global
              </p>
              <p className="text-[12px] leading-4.5 text-ink-500">
                Enxerga e administra todas as empresas, de qualquer conta. É o
                privilégio que dá acesso a esta tela.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3 px-5 py-3.5">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-500">
              <Shield className="size-3.5" />
            </span>
            <div>
              <p className="text-[13px] font-medium text-ink-800">
                Administrador da empresa
              </p>
              <p className="text-[12px] leading-4.5 text-ink-500">
                Vê apenas as empresas em que tem vínculo, mas gerencia a equipe
                e os dados delas. É o nível definido na tela de Equipe.
              </p>
            </div>
          </li>
        </ul>
        <div className="border-t border-ink-200 px-5 py-3">
          <Link
            to="/empresas"
            className="text-[12px] font-medium text-brand-700 hover:text-brand-800"
          >
            Gerenciar suas empresas →
          </Link>
        </div>
      </Card>

      <GrantModal
        open={granting}
        loading={grantMutation.isPending}
        onClose={() => {
          setGranting(false)
          grantMutation.reset()
        }}
        onSubmit={(email, enabled) => grantMutation.mutate({ email, enabled })}
      />
    </PageBody>
  )
}

/* -------------------------------------------------------------------------- */
/* Modal de concessão de acesso global                                          */
/* -------------------------------------------------------------------------- */

function GrantModal({
  open,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean
  loading: boolean
  onClose: () => void
  onSubmit: (email: string, enabled: boolean) => void
}) {
  const [email, setEmail] = useState('')
  const [enabled, setEnabled] = useState(true)

  if (!open) return null

  return (
    <Modal
      open
      onClose={onClose}
      title="Acesso global"
      description="Concede ou revoga o privilégio de administrar todas as empresas."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant={enabled ? 'primary' : 'danger'}
            loading={loading}
            disabled={!email.includes('@')}
            icon={enabled ? <Shield className="size-4" /> : <ShieldOff className="size-4" />}
            onClick={() => onSubmit(email, enabled)}
          >
            {enabled ? 'Conceder' : 'Revogar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="E-mail da pessoa" required hint="A conta precisa já existir.">
          <Input
            type="email"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="pessoa@empresa.com.br"
          />
        </Field>

        <Field label="Ação">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEnabled(true)}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors',
                enabled
                  ? 'border-brand-300 bg-brand-50 text-brand-800'
                  : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50',
              )}
            >
              Conceder
            </button>
            <button
              type="button"
              onClick={() => setEnabled(false)}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors',
                !enabled
                  ? 'border-[color-mix(in_oklch,var(--color-negative)_30%,transparent)] bg-[var(--color-negative-soft)] text-negative'
                  : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50',
              )}
            >
              Revogar
            </button>
          </div>
        </Field>

        <div className="rounded-lg border border-[color-mix(in_oklch,var(--color-caution)_32%,transparent)] bg-[var(--color-caution-soft)] px-3.5 py-3">
          <p className="text-[12px] leading-5 text-[color-mix(in_oklch,var(--color-caution)_70%,black)]">
            Quem tem este privilégio enxerga os dados financeiros de{' '}
            <strong>todas as contas</strong> do sistema. Conceda apenas a quem
            precisa dar suporte ou consolidar a operação.
          </p>
        </div>
      </div>
    </Modal>
  )
}
