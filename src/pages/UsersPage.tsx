import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Check,
  ChevronDown,
  Globe,
  Info,
  Plus,
  Search,
  ShieldCheck,
  ShieldPlus,
  Trash2,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react'
import { useOrganization } from '@/contexts/OrgContext'
import {
  grantOrgAccess,
  listUserMemberships,
  listUsers,
  revokeOrgAccess,
  setMemberRole,
  setSuperAdmin,
  type PlatformUser,
} from '@/services/api'
import { formatDate, initials } from '@/lib/format'
import type { MemberRole } from '@/lib/types'
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
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'

type OrgRole = Exclude<MemberRole, 'super_admin'>

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  member: 'Membro',
  viewer: 'Visualizador',
}

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Módulo de usuários.
 *
 * Visão centrada em pessoas: quem existe no sistema, a quais empresas cada um
 * tem acesso e com qual papel. Complementa a tela de Equipe, que parte da
 * empresa em vez da pessoa.
 *
 * O alcance depende de quem está logado, e o recorte é feito no banco: o
 * administrador global vê todos; o administrador de empresa vê apenas quem
 * compartilha uma empresa com ele.
 */
export function UsersPage() {
  const { organizations, isSuperAdmin } = useOrganization()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [granting, setGranting] = useState<PlatformUser | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<{
    membershipId: string
    orgName: string
    userName: string
  } | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(
    null,
  )

  const usersQuery = useQuery({
    queryKey: ['platform-users'],
    queryFn: listUsers,
  })

  const users = usersQuery.data ?? []

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return users
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(term) ||
        u.full_name.toLowerCase().includes(term),
    )
  }, [users, search])

  const stats = useMemo(
    () => ({
      total: users.length,
      adminsGlobais: users.filter((u) => u.is_super_admin).length,
      comAcesso: users.filter((u) => u.org_count > 0).length,
      semAcesso: users.filter((u) => u.org_count === 0).length,
    }),
    [users],
  )

  /** Empresas que o usuário logado pode conceder. */
  const grantableOrgs = useMemo(
    () =>
      organizations.filter(
        (o) =>
          isSuperAdmin ||
          o.role === 'owner' ||
          o.role === 'admin' ||
          o.role === 'super_admin',
      ),
    [organizations, isSuperAdmin],
  )

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['platform-users'] })
    void queryClient.invalidateQueries({ queryKey: ['user-memberships'] })
    void queryClient.invalidateQueries({ queryKey: ['org-members'] })
  }

  const grantMutation = useMutation({
    mutationFn: (input: { userId: string; orgId: string; role: OrgRole }) =>
      grantOrgAccess(input.userId, input.orgId, input.role),
    onSuccess: (result) => {
      setFeedback({
        tone: result.outcome === 'granted' ? 'ok' : 'warn',
        text: result.message,
      })
      if (result.outcome === 'granted') {
        setGranting(null)
        invalidate()
      }
    },
  })

  const roleMutation = useMutation({
    mutationFn: (input: { membershipId: string; role: OrgRole }) =>
      setMemberRole(input.membershipId, input.role),
    onSuccess: (result) => {
      setFeedback({
        tone: result.outcome === 'updated' ? 'ok' : 'warn',
        text: result.message,
      })
      invalidate()
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (membershipId: string) => revokeOrgAccess(membershipId),
    onSuccess: (result) => {
      setFeedback({
        tone: result.outcome === 'revoked' ? 'ok' : 'warn',
        text: result.message,
      })
      setConfirmRevoke(null)
      invalidate()
    },
  })

  const globalMutation = useMutation({
    mutationFn: (input: { email: string; enabled: boolean }) =>
      setSuperAdmin(input.email, input.enabled),
    onSuccess: (result) => {
      const ok = result.outcome === 'granted' || result.outcome === 'revoked'
      setFeedback({
        tone: ok ? 'ok' : 'warn',
        text: result.message,
      })
      invalidate()
      void queryClient.invalidateQueries({ queryKey: ['is-super-admin'] })
    },
  })

  function handleToggleGlobal(user: PlatformUser) {
    setFeedback(null)
    globalMutation.mutate({
      email: user.email,
      enabled: !user.is_super_admin,
    })
  }

  return (
    <PageBody>
      <PageHeader
        title="Usuários"
        description={
          isSuperAdmin
            ? 'Todas as pessoas do sistema e seus acessos'
            : 'Pessoas com acesso às suas empresas'
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
          <button
            onClick={() => setFeedback(null)}
            className="text-[12px] underline underline-offset-2 opacity-70 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      <StatGrid cols={4}>
        <StatCard
          label="Usuários"
          value={String(stats.total)}
          icon={<Users className="size-4" />}
          context={isSuperAdmin ? 'Em todo o sistema' : 'Visíveis para você'}
        />
        <StatCard
          label="Admins globais"
          value={String(stats.adminsGlobais)}
          icon={<Globe className="size-4" />}
          context="Acesso a todas as contas"
        />
        <StatCard
          label="Com acesso"
          value={String(stats.comAcesso)}
          context="Vinculados a alguma empresa"
        />
        <StatCard
          label="Sem acesso"
          value={String(stats.semAcesso)}
          tone={stats.semAcesso > 0 ? 'negative' : 'neutral'}
          icon={<UserX className="size-4" />}
          context="Conta criada, sem empresa"
        />
      </StatGrid>

      <Card className="mt-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Buscar" className="min-w-[240px] flex-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
              <Input
                placeholder="Nome ou e-mail"
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
          title="Pessoas"
          subtitle={`${filtered.length} de ${users.length} ${users.length === 1 ? 'usuário' : 'usuários'} · clique para ver os acessos`}
        />

        {usersQuery.isError ? (
          <ErrorState
            message={
              usersQuery.error instanceof Error
                ? usersQuery.error.message
                : 'Erro ao carregar os usuários.'
            }
            onRetry={() => void usersQuery.refetch()}
          />
        ) : usersQuery.isLoading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title={search ? 'Nenhum usuário encontrado' : 'Nenhum usuário'}
            description={
              search
                ? 'Ajuste a busca para ver outras pessoas.'
                : 'Nenhuma conta cadastrada no sistema ainda.'
            }
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {filtered.map((user) => (
              <UserRow
                key={user.user_id}
                user={user}
                expanded={expanded === user.user_id}
                onToggle={() =>
                  setExpanded((current) =>
                    current === user.user_id ? null : user.user_id,
                  )
                }
                grantableOrgs={grantableOrgs}
                onGrant={() => {
                  setFeedback(null)
                  setGranting(user)
                }}
                onRevoke={(membershipId, orgName) =>
                  setConfirmRevoke({
                    membershipId,
                    orgName,
                    userName: user.full_name || user.email,
                  })
                }
                onRoleChange={(membershipId, role) =>
                  roleMutation.mutate({ membershipId, role })
                }
                onToggleGlobal={handleToggleGlobal}
                canGrantGlobal={isSuperAdmin}
                busy={roleMutation.isPending || revokeMutation.isPending}
              />
            ))}
          </ul>
        )}
      </Card>

      {/* Concessão de acesso */}
      {granting && (
        <GrantAccessModal
          user={granting}
          organizations={grantableOrgs}
          loading={grantMutation.isPending}
          onClose={() => {
            setGranting(null)
            grantMutation.reset()
          }}
          onSubmit={(orgId, role) =>
            grantMutation.mutate({ userId: granting.user_id, orgId, role })
          }
        />
      )}

      {/* Remoção de acesso */}
      <Modal
        open={Boolean(confirmRevoke)}
        onClose={() => setConfirmRevoke(null)}
        title="Remover acesso"
        description="A pessoa deixa de acessar esta empresa."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRevoke(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={revokeMutation.isPending}
              onClick={() =>
                confirmRevoke && revokeMutation.mutate(confirmRevoke.membershipId)
              }
            >
              Remover
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-5 text-ink-600">
          <strong className="font-semibold text-ink-900">{confirmRevoke?.userName}</strong>{' '}
          perderá o acesso a{' '}
          <strong className="font-semibold text-ink-900">{confirmRevoke?.orgName}</strong>.
          Os lançamentos e cadastros que essa pessoa criou permanecem intactos.
        </p>
      </Modal>
    </PageBody>
  )
}

/* -------------------------------------------------------------------------- */
/* Linha expansível                                                            */
/* -------------------------------------------------------------------------- */

function UserRow({
  user,
  expanded,
  onToggle,
  grantableOrgs,
  onGrant,
  onRevoke,
  onRoleChange,
  onToggleGlobal,
  canGrantGlobal,
  busy,
}: {
  user: PlatformUser
  expanded: boolean
  onToggle: () => void
  grantableOrgs: { id: string; name: string }[]
  onGrant: () => void
  onRevoke: (membershipId: string, orgName: string) => void
  onRoleChange: (membershipId: string, role: OrgRole) => void
  onToggleGlobal: (user: PlatformUser) => void
  canGrantGlobal: boolean
  busy: boolean
}) {
  // Os acessos só são buscados quando a linha é aberta: evita uma consulta
  // por usuário numa lista que pode ser longa.
  const membershipsQuery = useQuery({
    queryKey: ['user-memberships', user.user_id],
    queryFn: () => listUserMemberships(user.user_id),
    enabled: expanded,
  })

  const memberships = membershipsQuery.data ?? []

  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3 transition-colors',
          expanded ? 'bg-ink-50' : 'hover:bg-ink-50',
        )}
      >
        <button
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-ink-400 transition-transform duration-150',
              expanded && 'rotate-180',
            )}
          />

          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-semibold text-ink-600">
            {initials(user.full_name || user.email)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-[13px] font-medium text-ink-800">
                {user.full_name || user.email.split('@')[0]}
              </p>
              {user.is_self && (
                <span className="text-[11px] text-ink-400">(você)</span>
              )}
              {user.is_super_admin && (
                <Badge tone="brand" dot>
                  <Globe className="size-3" />
                  Admin global
                </Badge>
              )}
            </div>
            <p className="truncate text-[11px] text-ink-500">{user.email}</p>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-4">
          <div className="hidden text-right sm:block">
            <p className="text-[11px] text-ink-400">Acessos</p>
            <p className="tabular text-[13px] font-medium text-ink-700">
              {user.org_count}
            </p>
          </div>
          <div className="hidden text-right md:block">
            <p className="text-[11px] text-ink-400">Último acesso</p>
            <p className="text-[12px] text-ink-600">
              {user.last_sign_in ? formatDate(user.last_sign_in) : 'nunca'}
            </p>
          </div>

          {/* O privilégio global só é concedido por quem já o tem, e nunca
              sobre si mesmo — evita que alguém se auto-promova. */}
          {canGrantGlobal && !user.is_self && (
            <button
              onClick={() => onToggleGlobal(user)}
              disabled={busy}
              title={
                user.is_super_admin
                  ? 'Revogar acesso global'
                  : 'Conceder acesso global'
              }
              className={cn(
                'rounded-md p-1.5 transition-colors disabled:opacity-40',
                user.is_super_admin
                  ? 'text-brand-600 hover:bg-brand-50'
                  : 'text-ink-400 hover:bg-ink-100 hover:text-ink-700',
              )}
            >
              {user.is_super_admin ? (
                <ShieldCheck className="size-4" />
              ) : (
                <ShieldPlus className="size-4" />
              )}
            </button>
          )}

          {grantableOrgs.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="size-3.5" />}
              onClick={onGrant}
            >
              Conceder
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-ink-100 bg-ink-50/60 px-4 py-3 pl-14">
          {membershipsQuery.isLoading ? (
            <p className="text-[12px] text-ink-500">Carregando acessos…</p>
          ) : memberships.length === 0 ? (
            <p className="flex items-center gap-2 text-[12px] text-ink-500">
              <UserX className="size-3.5" />
              Nenhum acesso. Esta pessoa não enxerga nenhuma empresa.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {memberships.map((m) => (
                <li
                  key={m.membership_id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2"
                >
                  <Building2 className="size-3.5 shrink-0 text-ink-400" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-700">
                    {m.org_name}
                  </span>

                  {m.can_manage ? (
                    <Select
                      value={m.role}
                      disabled={busy}
                      onChange={(event) =>
                        onRoleChange(m.membership_id, event.target.value as OrgRole)
                      }
                      className="h-7 w-[150px] py-0 text-[12px]"
                    >
                      {(Object.keys(ROLE_LABELS) as OrgRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone="neutral">{ROLE_LABELS[m.role as OrgRole]}</Badge>
                  )}

                  {m.can_manage && (
                    <button
                      onClick={() => onRevoke(m.membership_id, m.org_name)}
                      title="Remover acesso"
                      className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-[var(--color-negative-soft)] hover:text-negative"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* Modal de concessão                                                          */
/* -------------------------------------------------------------------------- */

function GrantAccessModal({
  user,
  organizations,
  loading,
  onClose,
  onSubmit,
}: {
  user: PlatformUser
  organizations: { id: string; name: string }[]
  loading: boolean
  onClose: () => void
  onSubmit: (orgId: string, role: OrgRole) => void
}) {
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? '')
  const [role, setRole] = useState<OrgRole>('member')

  return (
    <Modal
      open
      onClose={onClose}
      title="Conceder acesso"
      description={`Dar a ${user.full_name || user.email} acesso a uma empresa.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!orgId}
            icon={<UserCheck className="size-4" />}
            onClick={() => onSubmit(orgId, role)}
          >
            Conceder
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Empresa" required>
          <Select value={orgId} onChange={(event) => setOrgId(event.target.value)}>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Papel" required>
          <Select
            value={role}
            onChange={(event) => setRole(event.target.value as OrgRole)}
          >
            {(Object.keys(ROLE_LABELS) as OrgRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex items-start gap-2.5 rounded-lg border border-ink-200 bg-ink-50 px-3.5 py-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-400" />
          <p className="text-[12px] leading-5 text-ink-600">
            A pessoa passa a ver os dados desta empresa imediatamente. O papel
            define o que ela pode fazer — comece pelo menor privilégio
            necessário.
          </p>
        </div>
      </div>
    </Modal>
  )
}
