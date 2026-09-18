import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/contexts/OrgContext'
import { ForgotPasswordPage, LoginPage, SignUpPage } from '@/pages/AuthPages'
import { DashboardPage } from '@/pages/DashboardPage'
import { EntriesPage } from '@/pages/EntriesPage'
import { TransfersPage } from '@/pages/TransfersPage'
import { AccountsPage } from '@/pages/AccountsPage'
import { WalletsPage } from '@/pages/WalletsPage'
import { PartiesPage } from '@/pages/PartiesPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { ReconciliationPage } from '@/pages/ReconciliationPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { OrganizationsPage } from '@/pages/OrganizationsPage'
import { SettingsPage } from '@/pages/SettingsPage'

/* -------------------------------------------------------------------------- */
/* Guardas de rota                                                             */
/* -------------------------------------------------------------------------- */

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-100">
      <Loader2 className="size-5 animate-spin text-ink-400" />
    </div>
  )
}

/** Exige sessão. Guarda a rota pretendida para retomar após o login. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenLoader />
  if (!user) {
    return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

/**
 * Espera a lista de empresas carregar.
 *
 * Sem isso, as páginas montariam sem `activeOrgId` e disparariam consultas
 * inúteis antes de saberem de qual empresa buscar os dados.
 */
function RequireOrganization({ children }: { children: React.ReactNode }) {
  const { activeOrgId, loading } = useOrganization()

  if (loading) return <FullScreenLoader />
  // Autenticado, porém sem empresa: manda criar a primeira.
  if (!activeOrgId) return <Navigate to="/empresas" replace />

  return <>{children}</>
}

/** Moldura das páginas internas. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <RequireOrganization>
      <AppShell>{children}</AppShell>
    </RequireOrganization>
  )
}

/** Declara uma rota protegida dentro do layout, sem repetição. */
function protectedRoute(path: string, element: React.ReactNode) {
  return (
    <Route
      key={path}
      path={path}
      element={
        <RequireAuth>
          <Shell>{element}</Shell>
        </RequireAuth>
      }
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Rotas                                                                       */
/* -------------------------------------------------------------------------- */

export function AppRoutes() {
  return (
    <Routes>
      {/* Públicas */}
      <Route path="/entrar" element={<LoginPage />} />
      <Route path="/criar-conta" element={<SignUpPage />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />

      {/* Área logada */}
      {protectedRoute('/', <DashboardPage />)}
      {protectedRoute('/lancamentos', <EntriesPage />)}
      {protectedRoute('/transferencias', <TransfersPage />)}
      {protectedRoute('/plano-de-contas', <AccountsPage />)}
      {protectedRoute('/contas', <WalletsPage />)}
      {protectedRoute('/parceiros', <PartiesPage />)}
      {protectedRoute('/relatorios', <ReportsPage />)}
      {protectedRoute('/conciliacao', <ReconciliationPage />)}
      {protectedRoute('/metas', <GoalsPage />)}
      {protectedRoute('/configuracoes', <SettingsPage />)}

      {/* Empresas: exige login, mas não exige empresa ativa. */}
      <Route
        path="/empresas"
        element={
          <RequireAuth>
            <AppShell>
              <OrganizationsPage />
            </AppShell>
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
