import { QueryClient } from '@tanstack/react-query'

/**
 * Cliente React Query compartilhado.
 *
 * Dados financeiros mudam por ação do próprio usuário, então não faz sentido
 * revalidar a cada foco de janela: preferimos cache curto + invalidação
 * explícita nas mutations.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Erros de permissão e validação não melhoram com nova tentativa.
        const message = error instanceof Error ? error.message : ''
        if (/permissão|não tem acesso|inválid|inexistente/i.test(message)) {
          return false
        }
        return failureCount < 2
      },
    },
    mutations: {
      retry: false,
    },
  },
})

/** Chaves de cache centralizadas — evita strings soltas pelo código. */
export const queryKeys = {
  organizations: ['organizations'] as const,
  accounts: (orgId: string) => ['accounts', orgId] as const,
  wallets: (orgId: string) => ['wallets', orgId] as const,
  walletBalances: (orgId: string) => ['wallet-balances', orgId] as const,
  parties: (orgId: string) => ['parties', orgId] as const,
  partyTotals: (orgId: string) => ['party-totals', orgId] as const,
  entries: (params: unknown) => ['entries', params] as const,
  monthlyCashflow: (orgId: string, from: string, to: string) =>
    ['monthly-cashflow', orgId, from, to] as const,
  monthlyByAccount: (orgId: string, from: string, to: string) =>
    ['monthly-by-account', orgId, from, to] as const,
  overview: (orgId: string) => ['overview', orgId] as const,
  dashboard: (orgId: string, from: string, to: string) =>
    ['dashboard', orgId, from, to] as const,
  transfers: (orgId: string) => ['transfers', orgId] as const,
}
