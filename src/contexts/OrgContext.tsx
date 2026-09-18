import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  isSuperAdmin as checkSuperAdmin,
  listOrganizations,
  type OrganizationWithRole,
} from '@/services/api'

interface OrgContextValue {
  organizations: OrganizationWithRole[]
  activeOrg: OrganizationWithRole | null
  activeOrgId: string | null
  /** Papel do usuário na empresa ativa — controla o que a UI libera. */
  role: string
  canEdit: boolean
  /**
   * Administrador global da plataforma: enxerga e administra todas as
   * empresas, de qualquer conta. Distinto do `admin` por empresa.
   */
  isSuperAdmin: boolean
  loading: boolean
  /** Mensagem legível quando a listagem falha; `null` em caso de sucesso. */
  error: string | null
  setActiveOrgId: (id: string) => void
  refetch: () => void
}

const OrgContext = createContext<OrgContextValue | null>(null)

const STORAGE_KEY = 'fluxo-caixa.active-org'

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  )

  const { data, isLoading, error: queryError, refetch } = useQuery({
    queryKey: ['organizations'],
    queryFn: listOrganizations,
    staleTime: 60_000,
  })

  // Consulta separada: o privilégio global não muda com a empresa ativa, e
  // uma falha aqui não deve impedir o uso normal do sistema.
  const { data: superAdminFlag } = useQuery({
    queryKey: ['is-super-admin'],
    queryFn: checkSuperAdmin,
    staleTime: 5 * 60_000,
  })

  const isSuperAdmin = superAdminFlag === true

  const organizations = useMemo(() => data ?? [], [data])

  // Mantém uma empresa válida selecionada: se a salva sumiu (ou é a primeira
  // visita), cai para a primeira da lista.
  useEffect(() => {
    if (!organizations.length) return

    const stillValid = organizations.some((org) => org.id === activeOrgId)
    if (!stillValid) {
      setActiveOrgIdState(organizations[0]!.id)
    }
  }, [organizations, activeOrgId])

  const setActiveOrgId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id)
    setActiveOrgIdState(id)
  }, [])

  const activeOrg = useMemo(
    () => organizations.find((org) => org.id === activeOrgId) ?? null,
    [organizations, activeOrgId],
  )

  const role = activeOrg?.role ?? 'viewer'

  const value = useMemo<OrgContextValue>(
    () => ({
      organizations,
      activeOrg,
      activeOrgId: activeOrg?.id ?? null,
      role,
      canEdit:
        isSuperAdmin ||
        role === 'owner' ||
        role === 'admin' ||
        role === 'member',
      isSuperAdmin,
      loading: isLoading,
      error: queryError
        ? queryError instanceof Error
          ? queryError.message
          : 'Falha ao consultar o servidor.'
        : null,
      setActiveOrgId,
      refetch: () => void refetch(),
    }),
    [
      organizations,
      activeOrg,
      role,
      isSuperAdmin,
      isLoading,
      queryError,
      setActiveOrgId,
      refetch,
    ],
  )

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrganization() {
  const context = useContext(OrgContext)
  if (!context) {
    throw new Error(
      'useOrganization precisa ser usado dentro de <OrganizationProvider>',
    )
  }
  return context
}

/**
 * Igual a `useOrganization`, mas garante que exista uma empresa ativa.
 * Use nas páginas — elas só renderizam dentro do layout autenticado.
 */
export function useActiveOrg() {
  const context = useOrganization()
  if (!context.activeOrgId) {
    throw new Error('Nenhuma empresa ativa selecionada')
  }
  return { ...context, activeOrgId: context.activeOrgId }
}
