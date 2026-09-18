import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryClient'
import {
  createAccount,
  createParty,
  createWallet,
  deleteAccount,
  deleteParty,
  deleteWallet,
  listAccounts,
  listParties,
  listPartyTotals,
  listWalletBalances,
  listWallets,
  updateAccount,
  updateParty,
  updateWallet,
  type AccountInput,
  type PartyInput,
  type WalletInput,
} from '@/services/api'

/**
 * Hooks de dados dos cadastros.
 *
 * Centralizam queries e mutations para que as páginas fiquem só com a
 * apresentação, e para garantir que toda escrita invalide também as views
 * derivadas (saldos, totais, dashboard).
 */

/* -------------------------------------------------------------------------- */
/* Plano de contas                                                             */
/* -------------------------------------------------------------------------- */

export function useAccounts(orgId: string) {
  return useQuery({
    queryKey: queryKeys.accounts(orgId),
    queryFn: () => listAccounts(orgId),
    enabled: Boolean(orgId),
  })
}

export function useAccountMutations(orgId: string) {
  const queryClient = useQueryClient()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.accounts(orgId) })
    void queryClient.invalidateQueries({ queryKey: ['monthly-by-account'] })
  }

  return {
    create: useMutation({
      mutationFn: (input: AccountInput) => createAccount(input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        patch,
      }: {
        id: string
        patch: Partial<AccountInput> & { is_active?: boolean }
      }) => updateAccount(id, patch),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteAccount(id),
      onSuccess: invalidate,
    }),
    // Recarrega a lista após importação em lote.
    refresh: invalidate,
  }
}

/* -------------------------------------------------------------------------- */
/* Contas e caixas                                                             */
/* -------------------------------------------------------------------------- */

export function useWallets(orgId: string) {
  return useQuery({
    queryKey: queryKeys.wallets(orgId),
    queryFn: () => listWallets(orgId),
    enabled: Boolean(orgId),
  })
}

export function useWalletBalances(orgId: string) {
  return useQuery({
    queryKey: queryKeys.walletBalances(orgId),
    queryFn: () => listWalletBalances(orgId),
    enabled: Boolean(orgId),
  })
}

export function useWalletMutations(orgId: string) {
  const queryClient = useQueryClient()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallets(orgId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.walletBalances(orgId) })
    void queryClient.invalidateQueries({ queryKey: ['transfers'] })
  }

  return {
    create: useMutation({
      mutationFn: (input: WalletInput) => createWallet(input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        patch,
      }: {
        id: string
        patch: Partial<WalletInput> & { is_active?: boolean }
      }) => updateWallet(id, patch),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteWallet(id),
      onSuccess: invalidate,
    }),
  }
}

/* -------------------------------------------------------------------------- */
/* Clientes e fornecedores                                                     */
/* -------------------------------------------------------------------------- */

export function useParties(orgId: string) {
  return useQuery({
    queryKey: queryKeys.parties(orgId),
    queryFn: () => listParties(orgId),
    enabled: Boolean(orgId),
  })
}

export function usePartyTotals(orgId: string) {
  return useQuery({
    queryKey: queryKeys.partyTotals(orgId),
    queryFn: () => listPartyTotals(orgId),
    enabled: Boolean(orgId),
  })
}

export function usePartyMutations(orgId: string) {
  const queryClient = useQueryClient()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.parties(orgId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.partyTotals(orgId) })
  }

  return {
    create: useMutation({
      mutationFn: (input: PartyInput) => createParty(input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        patch,
      }: {
        id: string
        patch: Partial<PartyInput> & { is_active?: boolean }
      }) => updateParty(id, patch),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteParty(id),
      onSuccess: invalidate,
    }),
  }
}
