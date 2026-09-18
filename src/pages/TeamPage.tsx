import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  Info,
  Mail,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { useActiveOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/contexts/AuthContext'
import {
  inviteMemberByEmail,
  listOrgMembers,
  removeMember,
  updateMemberRole,
  type OrgMember,
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

/* -------------------------------------------------------------------------- */
/* Papéis                                                                      */
/* -------------------------------------------------------------------------- */

type OrgRole = Exclude<MemberRole, 'super_admin'>

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  member: 'Membro',
  viewer: 'Visualizador',
}

const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner: 'Controle total, inclusive arquivar a empresa e gerenciar a equipe.',
  admin: 'Gerencia lançamentos, cadastros e a equipe.',
  member: 'Cria e edita lançamentos e cadastros.',
  viewer: 'Apenas consulta. Não altera nada.',
}

/** Papéis que o usuário logado pode atribuir, conforme o papel dele. */
function assignableRoles(role: string): OrgRole[] {
  if (role === 'owner' || role === 'super_admin') {
    return ['owner', 'admin', 'member', 'viewer']
  }
  if (role === 'admin') return ['admin', 'member', 'viewer']
  return []
}

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

export function TeamPage() {
  const { activeOrgId, activeOrg, role, canEdit } = useActiveOrg()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [inviting, setInviting] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<OrgMember | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(
    null,
  )

  const isAdmin = role === 'owner' || role === 'admin' || role === 'super_admin'

  const membersQuery = useQuery({
    queryKey: ['org-members', activeOrgId],
    queryFn: () => listOrgMembers(activeOrgId),
  })

  const members = membersQuery.data ?? []

  const stats = useMemo(() => {
    const byRole = (r: MemberRole) => members.filter((m) => m.role === r).length
    return {
      total: members.length,
      owners: byRole('owner'),
      admins: byRole('admin'),
      viewers: byRole('viewer'),
    }
  }, [members])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['org-members', activeOrgId] })
    void queryClient.invalidateQueries({ queryKey: ['organizations'] })
  }

  const inviteMutation = useMutation({
    mutationFn: (input: { email: string; role: MemberRole }) =>
      inviteMemberByEmail(activeOrgId, input.email, input.role),
    onSuccess: (result) => {
      if (result.outcome === 'added') {
        setFeedback({ tone: 'ok', text: result.message })
        setInviting(false)
        invalidate()
      } else {
        setFeedback({ tone: 'warn', text: result.message })
      }
    },
  })

  const roleMutation = useMutation({
    mutationFn: (input: { id: string; role: MemberRole }) =>
      updateMemberRole(input.id, input.role),
    onSuccess: invalidate,
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeMember(id),
    onSuccess: () => {
      setConfirmRemove(null)
      invalidate()
    },
  })

  const roles = assignableRoles(role)

  return (
    <PageBody>
      <PageHeader
        title="Equipe"
        description={`Quem tem acesso a ${activeOrg?.name ?? 'esta empresa'}`}
        actions={
          isAdmin && roles.length > 0 ? (
            <Button
              variant="primary"
              icon={<UserPlus className="size-4" />}
              onClick={() => {
                setFeedback(null)
                setInviting(true)
              }}
            >
              Adicionar membro
            </Button>
          ) : undefined
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
          label="Membros"
          value={String(stats.total)}
          icon={<Users className="size-4" />}
          context="Com acesso à empresa"
        />
        <StatCard
          label="Proprietários"
          value={String(stats.owners)}
          context="Controle total"
        />
        <StatCard label="Administradores" value={String(stats.admins)} context="Gestão da equipe" />
        <StatCard
          label="Somente leitura"
          value={String(stats.viewers)}
          context="Não alteram dados"
        />
      </StatGrid>

      <Card className="mt-4 overflow-hidden">
        <CardHeader
          title="Membros da equipe"
          subtitle="O papel define o que cada pessoa pode fazer nesta empresa"
        />

        {membersQuery.isError ? (
          <ErrorState
            message={
              membersQuery.error instanceof Error
                ? membersQuery.error.message
                : 'Erro ao carregar a equipe.'
            }
            onRetry={() => void membersQuery.refetch()}
          />
        ) : membersQuery.isLoading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : members.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title="Nenhum membro"
            description="Adicione alguém para compartilhar o acesso a esta empresa."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              <thead>
                <tr>
                  <th className="th">Pessoa</th>
                  <th className="th">Papel</th>
                  <th className="th">Desde</th>
                  {isAdmin && <th className="th w-24 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const isMe = member.user_id === user?.id
                  // Só o dono mexe no próprio papel, e ninguém remove a si
                  // mesmo — evita deixar a empresa sem administração.
                  const canChangeRole =
                    isAdmin && roles.length > 0 && !isMe && member.role !== 'owner'
                  const canRemove =
                    isAdmin && !isMe && member.role !== 'owner' &&
                    (role === 'owner' || role === 'super_admin' || member.role !== 'admin')

                  return (
                    <tr key={member.membership_id} className="row-hover">
                      <td className="td">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-semibold text-ink-600">
                            {initials(member.full_name || member.email)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink-800">
                              {member.full_name || member.email.split('@')[0]}
                              {isMe && (
                                <span className="ml-1.5 text-[11px] font-normal text-ink-400">
                                  (você)
                                </span>
                              )}
                            </p>
                            <p className="truncate text-[11px] text-ink-500">
                              {member.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="td">
                        {canChangeRole ? (
                          <Select
                            value={member.role}
                            disabled={roleMutation.isPending}
                            onChange={(event) =>
                              roleMutation.mutate({
                                id: member.membership_id,
                                role: event.target.value as MemberRole,
                              })
                            }
                            className="h-8 py-0 text-[13px]"
                          >
                            {roles.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Badge
                            tone={
                              member.role === 'owner'
                                ? 'brand'
                                : member.role === 'admin'
                                  ? 'info'
                                  : 'neutral'
                            }
                            dot={member.role === 'owner' || member.role === 'admin'}
                          >
                            {ROLE_LABELS[member.role]}
                          </Badge>
                        )}
                      </td>
                      <td className="td text-ink-500">{formatDate(member.created_at)}</td>
                      {isAdmin && (
                        <td className="td">
                          <div className="flex justify-end">
                            {canRemove ? (
                              <button
                                onClick={() => setConfirmRemove(member)}
                                title="Remover da equipe"
                                className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-[var(--color-negative-soft)] hover:text-negative"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            ) : (
                              <span
                                className="p-1.5 text-ink-200"
                                title={
                                  isMe
                                    ? 'Você não pode remover a si mesmo'
                                    : 'Apenas o proprietário remove outro proprietário'
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </span>
                            )}
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

      {/* Explicação dos papéis — evita dúvida na hora de escolher */}
      <Card className="mt-4">
        <CardHeader
          title="O que cada papel pode fazer"
          subtitle="Defina o menor privilégio necessário"
        />
        <ul className="divide-y divide-ink-100">
          {(Object.keys(ROLE_LABELS) as OrgRole[]).map((r) => (
            <li key={r} className="flex items-start gap-3 px-5 py-3">
              <span
                className={cn(
                  'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md',
                  r === 'owner' || r === 'admin'
                    ? 'bg-brand-50 text-brand-600'
                    : 'bg-ink-100 text-ink-500',
                )}
              >
                {r === 'owner' ? (
                  <ShieldCheck className="size-3.5" />
                ) : r === 'admin' ? (
                  <Shield className="size-3.5" />
                ) : (
                  <Users className="size-3.5" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink-800">{ROLE_LABELS[r]}</p>
                <p className="text-[12px] leading-4.5 text-ink-500">
                  {ROLE_DESCRIPTIONS[r]}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {!canEdit && (
        <p className="mt-4 flex items-center gap-2 text-[12px] text-ink-500">
          <AlertTriangle className="size-3.5" />
          Você tem acesso somente leitura a esta empresa.
        </p>
      )}

      <InviteModal
        open={inviting}
        roles={roles}
        loading={inviteMutation.isPending}
        onClose={() => {
          setInviting(false)
          inviteMutation.reset()
        }}
        onSubmit={(email, newRole) =>
          inviteMutation.mutate({ email, role: newRole })
        }
      />

      <Modal
        open={Boolean(confirmRemove)}
        onClose={() => setConfirmRemove(null)}
        title="Remover da equipe"
        description="A pessoa perde o acesso a esta empresa."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRemove(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={removeMutation.isPending}
              onClick={() =>
                confirmRemove && removeMutation.mutate(confirmRemove.membership_id)
              }
            >
              Remover
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-5 text-ink-600">
          <strong className="font-semibold text-ink-900">
            {confirmRemove?.full_name || confirmRemove?.email}
          </strong>{' '}
          deixará de acessar {activeOrg?.name}. Os lançamentos e cadastros que
          essa pessoa criou permanecem intactos.
        </p>
      </Modal>
    </PageBody>
  )
}

/* -------------------------------------------------------------------------- */
/* Modal de convite                                                            */
/* -------------------------------------------------------------------------- */

function InviteModal({
  open,
  roles,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean
  roles: MemberRole[]
  loading: boolean
  onClose: () => void
  onSubmit: (email: string, role: MemberRole) => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('member')

  if (!open) return null

  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar membro"
      description="A pessoa precisa já ter uma conta no sistema."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!email.includes('@')}
            icon={<UserPlus className="size-4" />}
            onClick={() => onSubmit(email, role)}
          >
            Adicionar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="E-mail"
          required
          hint="Use o mesmo e-mail com que a pessoa se cadastrou."
        >
          <div className="relative">
            <Mail className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
            <Input
              type="email"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="pessoa@empresa.com.br"
              className="pl-8"
            />
          </div>
        </Field>

        <Field label="Papel" required hint={ROLE_DESCRIPTIONS[role]}>
          <Select
            value={role}
            onChange={(event) => setRole(event.target.value as MemberRole)}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="rounded-lg border border-ink-200 bg-ink-50 px-3.5 py-3">
          <p className="text-[12px] leading-5 text-ink-600">
            Não enviamos convite por e-mail: o acesso é liberado assim que você
            confirma, e a pessoa entra com a conta que já possui.
          </p>
        </div>
      </div>
    </Modal>
  )
}
