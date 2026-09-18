import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
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

/**
 * Espera do carregamento inicial.
 *
 * O banco do plano gratuito hiberna após um período sem uso e leva alguns
 * segundos para responder à primeira consulta. Um indicador girando sozinho
 * faz parecer que travou, então a mensagem só aparece depois de um tempo.
 */
function LoadingScreen() {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 2500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-100">
      <Loader2 className="size-5 animate-spin text-ink-400" />
      {slow && (
        <p className="animate-rise px-6 text-center text-[13px] leading-5 text-ink-500">
          Ainda carregando…
          <br />
          <span className="text-ink-400">
            O banco pode estar acordando após um período sem uso.
          </span>
        </p>
      )}
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
 *
 * O primeiro acesso após um período ocioso pode demorar: o Postgres do plano
 * gratuito hiberna e o banco leva alguns segundos para acordar. Por isso a
 * espera passa a explicar o que está acontecendo em vez de mostrar apenas um
 * indicador girando.
 */
function RequireOrganization({ children }: { children: React.ReactNode }) {
  const { activeOrgId, loading, error, refetch } = useOrganization()

  if (loading) return <LoadingScreen />

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-100 px-4">
        <div className="surface w-full max-w-sm p-6 text-center">
          <p className="text-sm font-semibold text-ink-900">
            Não foi possível carregar suas empresas
          </p>
          <p className="mt-1.5 text-[13px] leading-5 text-ink-500">{error}</p>
          <Button
            variant="primary"
            className="mt-4 w-full"
            onClick={() => void refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

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
