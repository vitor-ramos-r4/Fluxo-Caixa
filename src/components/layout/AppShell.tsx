import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  ArrowLeftRight,
  BadgeCheck,
  Building2,
  ChevronDown,
  CircleDollarSign,
  FileBarChart,
  Globe,
  LayoutDashboard,
  Layers,
  ListOrdered,
  LogOut,
  Menu,
  Plus,
  Settings,
  Target,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'
import { useAuth, useDisplayName } from '@/contexts/AuthContext'
import { useOrganization } from '@/contexts/OrgContext'

/* -------------------------------------------------------------------------- */
/* Estrutura de navegação                                                      */
/* -------------------------------------------------------------------------- */

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operação',
    items: [
      { to: '/', label: 'Visão geral', icon: LayoutDashboard, end: true },
      { to: '/lancamentos', label: 'Lançamentos', icon: ListOrdered },
      { to: '/transferencias', label: 'Transferências', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { to: '/plano-de-contas', label: 'Plano de contas', icon: Layers },
      { to: '/contas', label: 'Contas e caixas', icon: Wallet },
      { to: '/parceiros', label: 'Clientes e fornecedores', icon: Users },
    ],
  },
  {
    label: 'Análise',
    items: [
      { to: '/relatorios', label: 'Relatórios', icon: FileBarChart },
      { to: '/conciliacao', label: 'Conciliação', icon: BadgeCheck },
      { to: '/metas', label: 'Metas e orçamento', icon: Target },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/equipe', label: 'Equipe', icon: UserCog },
      { to: '/empresas', label: 'Empresas', icon: Building2 },
      { to: '/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
]

/**
 * Item visível apenas para o administrador global da plataforma.
 * Fica fora de NAV_SECTIONS porque depende do privilégio do usuário.
 */
const ADMIN_NAV_ITEM: NavItem = {
  to: '/administracao',
  label: 'Administração',
  icon: Globe,
}

/** Todas as rotas com título, usado pela barra superior. */
const ALL_NAV_ITEMS: NavItem[] = [
  ...NAV_SECTIONS.flatMap((section) => section.items),
  ADMIN_NAV_ITEM,
]

/* -------------------------------------------------------------------------- */
/* Layout principal                                                            */
/* -------------------------------------------------------------------------- */

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // Fecha o menu mobile ao trocar de rota.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <div className="flex min-h-screen bg-ink-100">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink-950/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMobile={() => setMobileOpen(true)} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sidebar                                                                     */
/* -------------------------------------------------------------------------- */

function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const { signOut } = useAuth()
  const { isSuperAdmin } = useOrganization()
  const displayName = useDisplayName()

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-ink-950',
        'transition-transform duration-200 ease-out lg:static lg:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* Marca */}
      <div className="flex items-center gap-2.5 px-4 h-14 shrink-0 border-b border-white/8">
        <div className="flex size-8 items-center justify-center rounded-lg bg-brand-500 text-white">
          <CircleDollarSign className="size-4.5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white leading-4 tracking-tight">
            Fluxo de Caixa
          </p>
          <p className="text-[10px] text-ink-500 leading-3.5">Gestão financeira</p>
        </div>
        <button
          onClick={onCloseMobile}
          className="lg:hidden text-ink-400 hover:text-white p-1"
          aria-label="Fechar menu"
        >
          <X className="size-4" />
        </button>
      </div>

      <OrgSwitcher />

      {/* Navegação */}
      <nav className="scroll-dark flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-600">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={'end' in item ? item.end : false}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2',
                        'text-[13px] transition-colors duration-100',
                        isActive
                          ? 'bg-white/8 text-white font-medium'
                          : 'text-ink-400 hover:bg-white/4 hover:text-ink-100',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span
                            className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2.5px] rounded-r-full bg-brand-400"
                            aria-hidden
                          />
                        )}
                        <item.icon
                          className={cn(
                            'size-4 shrink-0',
                            isActive
                              ? 'text-brand-400'
                              : 'text-ink-500 group-hover:text-ink-300',
                          )}
                          strokeWidth={2}
                        />
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Área do administrador global: só aparece para quem tem o privilégio,
            que é verificado no banco por is_super_admin(). */}
        {isSuperAdmin && (
          <div>
            <p className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-600">
              Plataforma
            </p>
            <ul className="space-y-0.5">
              <li>
                <NavLink
                  to={ADMIN_NAV_ITEM.to}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2',
                      'text-[13px] transition-colors duration-100',
                      isActive
                        ? 'bg-white/8 text-white font-medium'
                        : 'text-ink-400 hover:bg-white/4 hover:text-ink-100',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2.5px] rounded-r-full bg-brand-400"
                          aria-hidden
                        />
                      )}
                      <ADMIN_NAV_ITEM.icon
                        className={cn(
                          'size-4 shrink-0',
                          isActive
                            ? 'text-brand-400'
                            : 'text-ink-500 group-hover:text-ink-300',
                        )}
                        strokeWidth={2}
                      />
                      <span className="truncate">{ADMIN_NAV_ITEM.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            </ul>
          </div>
        )}
      </nav>

      {/* Usuário */}
      <div className="shrink-0 border-t border-white/8 p-2.5">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[11px] font-semibold text-ink-200">
            {initials(displayName) || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-ink-100 leading-4">
              {displayName}
            </p>
            <p className="text-[10px] text-ink-500 leading-3.5">Sessão ativa</p>
          </div>
          <button
            onClick={() => void signOut()}
            title="Sair"
            aria-label="Sair"
            className="rounded-md p-1.5 text-ink-500 transition-colors hover:bg-white/6 hover:text-ink-200"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}

/* -------------------------------------------------------------------------- */
/* Seletor de empresa                                                          */
/* -------------------------------------------------------------------------- */

function OrgSwitcher() {
  const { organizations, activeOrg, setActiveOrgId } = useOrganization()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!activeOrg) return null

  return (
    <div ref={ref} className="relative shrink-0 border-b border-white/8 p-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2 text-left transition-colors hover:bg-white/8"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-600 text-[11px] font-semibold text-white">
          {initials(activeOrg.name, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] uppercase tracking-[0.07em] text-ink-500 leading-3">
            Empresa
          </p>
          <p className="truncate text-[12px] font-medium text-white leading-4">
            {activeOrg.name}
          </p>
        </div>
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 text-ink-500 transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-2.5 right-2.5 top-[calc(100%-4px)] z-50 overflow-hidden rounded-lg border border-white/10 bg-ink-900 shadow-pop"
        >
          <div className="max-h-64 overflow-y-auto scroll-dark">
            {organizations.map((org) => (
              <button
                key={org.id}
                role="option"
                aria-selected={org.id === activeOrg.id}
                onClick={() => {
                  setActiveOrgId(org.id)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors',
                  org.id === activeOrg.id ? 'bg-white/8' : 'hover:bg-white/5',
                )}
              >
                <div className="flex size-6 shrink-0 items-center justify-center rounded bg-ink-700 text-[10px] font-semibold text-ink-200">
                  {initials(org.name, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-white">{org.name}</p>
                  <p className="truncate text-[10px] capitalize text-ink-500">
                    {org.role === 'owner' ? 'Proprietário' : org.role}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <NavLink
            to="/empresas"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 border-t border-white/8 px-2.5 py-2 text-[12px] text-brand-400 transition-colors hover:bg-white/5"
          >
            <Plus className="size-3.5" />
            Gerenciar empresas
          </NavLink>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Barra superior                                                              */
/* -------------------------------------------------------------------------- */

function TopBar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const { pathname } = useLocation()
  const { activeOrg } = useOrganization()

  const title =
    ALL_NAV_ITEMS.find((item) => item.to === pathname)?.label ?? 'Visão geral'

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-ink-200 bg-white/85 px-4 backdrop-blur-md sm:px-6">
      <button
        onClick={onOpenMobile}
        className="-ml-1 rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="size-4.5" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h1 className="truncate text-[15px] font-semibold text-ink-900">
          {title}
        </h1>
        {activeOrg && (
          <>
            <span className="hidden text-ink-300 sm:inline">·</span>
            <span className="hidden truncate text-[13px] text-ink-500 sm:inline">
              {activeOrg.name}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        <NavLink
          to="/relatorios"
          className="hidden rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 sm:block"
          title="Relatórios"
        >
          <TrendingUp className="size-4.5" />
        </NavLink>
        <NavLink
          to="/empresas"
          className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
          title="Empresas"
        >
          <Building2 className="size-4.5" />
        </NavLink>
      </div>
    </header>
  )
}
