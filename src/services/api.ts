import { supabase, describeError } from '@/lib/supabase'
import type {
  ChartOfAccount,
  Entry,
  EntryStatus,
  EntryWithRelations,
  MonthlyByAccount,
  MonthlyCashflow,
  Organization,
  OrgOverview,
  Party,
  PartyTotal,
  Wallet,
  WalletBalance,
  DashboardSummary,
} from '@/lib/types'

/* ========================================================================== */
/* Organizações e vínculos                                                     */
/* ========================================================================== */

export interface OrganizationWithRole extends Organization {
  role: string
}

export async function listOrganizations(): Promise<OrganizationWithRole[]> {
  const { data: memberships, error: mErr } = await supabase
    .from('memberships')
    .select('org_id, role')

  if (mErr) throw new Error(describeError(mErr))
  if (!memberships?.length) return []

  const ids = memberships.map((m) => m.org_id)
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .in('id', ids)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })

  if (error) throw new Error(describeError(error))

  const roleByOrg = new Map(memberships.map((m) => [m.org_id, m.role]))
  return (data ?? []).map((org) => ({
    ...org,
    role: roleByOrg.get(org.id) ?? 'viewer',
  }))
}

export interface CreateOrganizationInput {
  name: string
  legal_name?: string | null
  document?: string | null
  segment?: string | null
  opening_balance?: number
  starts_on?: string
}

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<Organization> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    throw new Error('Sessão expirada. Entre novamente.')
  }

  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: input.name.trim(),
      legal_name: input.legal_name?.trim() || null,
      document: input.document?.replace(/\D/g, '') || null,
      segment: input.segment?.trim() || null,
      opening_balance: input.opening_balance ?? 0,
      starts_on: input.starts_on ?? new Date().toISOString().slice(0, 10),
      created_by: userData.user.id,
    })
    .select()
    .single()

  if (error) throw new Error(describeError(error))
  return data
}

export async function updateOrganization(
  id: string,
  patch: Partial<CreateOrganizationInput>,
): Promise<Organization> {
  const payload: Record<string, unknown> = { ...patch }
  if (typeof patch.document === 'string') {
    payload.document = patch.document.replace(/\D/g, '') || null
  }

  const { data, error } = await supabase
    .from('organizations')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(describeError(error))
  return data
}

export async function archiveOrganization(id: string): Promise<void> {
  const { error } = await supabase
    .from('organizations')
    .update({ is_archived: true })
    .eq('id', id)
  if (error) throw new Error(describeError(error))
}

/* ========================================================================== */
/* Plano de contas                                                             */
/* ========================================================================== */

export async function listAccounts(orgId: string): Promise<ChartOfAccount[]> {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(describeError(error))
  return data ?? []
}

export interface AccountInput {
  org_id: string
  name: string
  kind: ChartOfAccount['kind']
  code?: string | null
  color?: string | null
  parent_id?: string | null
  sort_order?: number
}

export async function createAccount(input: AccountInput): Promise<ChartOfAccount> {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .insert({
      ...input,
      name: input.name.trim(),
      code: input.code?.trim() || null,
    })
    .select()
    .single()

  if (error) throw new Error(describeError(error))
  return data
}

export async function updateAccount(
  id: string,
  patch: Partial<AccountInput> & { is_active?: boolean },
): Promise<ChartOfAccount> {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(describeError(error))
  return data
}

/**
 * Desativa uma conta em vez de apagar.
 *
 * Lançamentos apontam para ela por chave estrangeira; excluir quebraria o
 * histórico. Se nunca foi usada, aí sim removemos de fato.
 */
export async function deleteAccount(id: string): Promise<'deleted' | 'archived'> {
  const { count, error: countError } = await supabase
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', id)

  if (countError) throw new Error(describeError(countError))

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from('chart_of_accounts')
      .update({ is_active: false })
      .eq('id', id)
    if (error) throw new Error(describeError(error))
    return 'archived'
  }

  const { error } = await supabase.from('chart_of_accounts').delete().eq('id', id)
  if (error) throw new Error(describeError(error))
  return 'deleted'
}

/* ========================================================================== */
/* Contas bancárias                                                            */
/* ========================================================================== */

export async function listWallets(orgId: string): Promise<Wallet[]> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(describeError(error))
  return data ?? []
}

export async function listWalletBalances(orgId: string): Promise<WalletBalance[]> {
  const { data, error } = await supabase
    .from('wallet_balances')
    .select('*')
    .eq('org_id', orgId)

  if (error) throw new Error(describeError(error))
  return data ?? []
}

export interface WalletInput {
  org_id: string
  name: string
  kind: Wallet['kind']
  bank_name?: string | null
  branch?: string | null
  account_number?: string | null
  opening_balance?: number
  color?: string
}

export async function createWallet(input: WalletInput): Promise<Wallet> {
  const { data, error } = await supabase
    .from('wallets')
    .insert({ ...input, name: input.name.trim() })
    .select()
    .single()

  if (error) throw new Error(describeError(error))
  return data
}

export async function updateWallet(
  id: string,
  patch: Partial<WalletInput> & { is_active?: boolean },
): Promise<Wallet> {
  const { data, error } = await supabase
    .from('wallets')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(describeError(error))
  return data
}

export async function deleteWallet(id: string): Promise<void> {
  const { error } = await supabase.from('wallets').delete().eq('id', id)
  if (error) throw new Error(describeError(error))
}

/* ========================================================================== */
/* Clientes e fornecedores                                                     */
/* ========================================================================== */

export async function listParties(orgId: string): Promise<Party[]> {
  const { data, error } = await supabase
    .from('parties')
    .select('*')
    .eq('org_id', orgId)
    .order('name', { ascending: true })

  if (error) throw new Error(describeError(error))
  return data ?? []
}

export async function listPartyTotals(orgId: string): Promise<PartyTotal[]> {
  const { data, error } = await supabase
    .from('party_totals')
    .select('*')
    .eq('org_id', orgId)
    .order('name', { ascending: true })

  if (error) throw new Error(describeError(error))
  return data ?? []
}

export interface PartyInput {
  org_id: string
  name: string
  kind: Party['kind']
  document?: string | null
  email?: string | null
  phone?: string | null
  notes?: string | null
}

export async function createParty(input: PartyInput): Promise<Party> {
  const { data, error } = await supabase
    .from('parties')
    .insert({
      ...input,
      name: input.name.trim(),
      document: input.document?.replace(/\D/g, '') || null,
      email: input.email?.trim() || null,
    })
    .select()
    .single()

  if (error) throw new Error(describeError(error))
  return data
}

export async function updateParty(
  id: string,
  patch: Partial<PartyInput> & { is_active?: boolean },
): Promise<Party> {
  const payload: Record<string, unknown> = { ...patch }
  if (typeof patch.document === 'string') {
    payload.document = patch.document.replace(/\D/g, '') || null
  }

  const { data, error } = await supabase
    .from('parties')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(describeError(error))
  return data
}

export async function deleteParty(id: string): Promise<void> {
  const { error } = await supabase.from('parties').delete().eq('id', id)
  if (error) throw new Error(describeError(error))
}

/* ========================================================================== */
/* Lançamentos                                                                 */
/* ========================================================================== */

export interface EntryFilters {
  orgId: string
  from?: string
  to?: string
  kind?: Entry['kind']
  status?: EntryStatus
  accountId?: string
  walletId?: string
  partyId?: string
  search?: string
  includeTransfers?: boolean
}

const ENTRY_SELECT = `
  *,
  chart_of_accounts (id, name, kind, color),
  wallets (id, name, color),
  parties (id, name, kind)
`

export async function listEntries(
  filters: EntryFilters,
  options: { limit?: number; offset?: number } = {},
): Promise<{ rows: EntryWithRelations[]; total: number }> {
  const limit = options.limit ?? 50
  const offset = options.offset ?? 0

  let query = supabase
    .from('entries')
    .select(ENTRY_SELECT, { count: 'exact' })
    .eq('org_id', filters.orgId)

  if (filters.from) query = query.gte('issued_on', filters.from)
  if (filters.to) query = query.lte('issued_on', filters.to)
  if (filters.kind) query = query.eq('kind', filters.kind)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.accountId) query = query.eq('account_id', filters.accountId)
  if (filters.walletId) query = query.eq('wallet_id', filters.walletId)
  if (filters.partyId) query = query.eq('party_id', filters.partyId)
  if (!filters.includeTransfers) query = query.eq('is_transfer', false)

  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[%,]/g, '')
    query = query.or(
      `description.ilike.%${term}%,reference.ilike.%${term}%,notes.ilike.%${term}%`,
    )
  }

  const { data, error, count } = await query
    .order('issued_on', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(describeError(error))
  return { rows: (data ?? []) as EntryWithRelations[], total: count ?? 0 }
}

export interface EntryInput {
  org_id: string
  account_id: string
  wallet_id?: string | null
  party_id?: string | null
  status: EntryStatus
  description: string
  amount: number
  issued_on: string
  settled_on?: string | null
  reference?: string | null
  notes?: string | null
}

export async function createEntry(input: EntryInput): Promise<Entry> {
  const { data: userData } = await supabase.auth.getUser()

  // `kind` é derivado da conta por um trigger no banco; enviamos um valor
  // provisório só para satisfazer a restrição NOT NULL.
  const { data, error } = await supabase
    .from('entries')
    .insert({
      ...input,
      kind: 'entrada',
      description: input.description.trim(),
      reference: input.reference?.trim() || null,
      settled_on: input.status === 'pago' ? (input.settled_on ?? input.issued_on) : null,
      created_by: userData.user?.id ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(describeError(error))
  return data
}

export async function updateEntry(
  id: string,
  patch: Partial<EntryInput> & { reconciled_at?: string | null },
): Promise<Entry> {
  const payload: Record<string, unknown> = { ...patch }
  if (patch.status === 'pago' && !patch.settled_on) {
    payload.settled_on = patch.issued_on ?? new Date().toISOString().slice(0, 10)
  }
  if (patch.status === 'em_aberto') {
    payload.settled_on = null
  }

  const { data, error } = await supabase
    .from('entries')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(describeError(error))
  return data
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('entries').delete().eq('id', id)
  if (error) throw new Error(describeError(error))
}

/** Marca/desmarca um lançamento como conciliado. */
export async function setReconciled(id: string, reconciled: boolean): Promise<void> {
  const { error } = await supabase
    .from('entries')
    .update({ reconciled_at: reconciled ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(describeError(error))
}

/** Alterna rapidamente entre pago e em aberto, direto na listagem. */
export async function toggleEntryStatus(
  id: string,
  current: EntryStatus,
  issuedOn: string,
): Promise<void> {
  const next: EntryStatus = current === 'pago' ? 'em_aberto' : 'pago'
  const { error } = await supabase
    .from('entries')
    .update({
      status: next,
      settled_on: next === 'pago' ? issuedOn : null,
    })
    .eq('id', id)
  if (error) throw new Error(describeError(error))
}

/** Inserção em lote — usada pela importação de planilha. */
export async function bulkCreateEntries(rows: EntryInput[]): Promise<number> {
  if (!rows.length) return 0

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id ?? null

  const chunkSize = 400
  let inserted = 0

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((row) => ({
      ...row,
      kind: 'entrada' as const,
      description: row.description.trim(),
      settled_on:
        row.status === 'pago' ? (row.settled_on ?? row.issued_on) : null,
      created_by: userId,
    }))

    const { error } = await supabase.from('entries').insert(chunk)
    if (error) throw new Error(describeError(error))
    inserted += chunk.length
  }

  return inserted
}

/* ========================================================================== */
/* Transferências                                                              */
/* ========================================================================== */

export interface TransferInput {
  orgId: string
  fromWalletId: string
  toWalletId: string
  amount: number
  date: string
  description?: string
}

/** Cria o par saída/entrada de forma atômica via RPC. */
export async function createTransfer(input: TransferInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_transfer', {
    p_org_id: input.orgId,
    p_from: input.fromWalletId,
    p_to: input.toWalletId,
    p_amount: input.amount,
    p_date: input.date,
    p_description: input.description?.trim() || 'Transferência entre contas',
  })

  if (error) throw new Error(describeError(error))
  return data as string
}

/** Lista os pares de transferência agrupados. */
export async function listTransfers(orgId: string, limit = 100) {
  const { data, error } = await supabase
    .from('entries')
    .select('*, wallets (id, name, color)')
    .eq('org_id', orgId)
    .eq('is_transfer', true)
    .order('issued_on', { ascending: false })
    .limit(limit * 2)

  if (error) throw new Error(describeError(error))

  const groups = new Map<
    string,
    {
      group: string
      date: string
      amount: number
      description: string
      from: string | null
      to: string | null
    }
  >()

  for (const row of data ?? []) {
    const key = row.transfer_group
    if (!key) continue

    const existing = groups.get(key) ?? {
      group: key,
      date: row.issued_on,
      amount: row.amount,
      description: row.description,
      from: null,
      to: null,
    }

    const walletName = (row as { wallets?: { name?: string } }).wallets?.name ?? null
    if (row.kind === 'saida') existing.from = walletName
    else existing.to = walletName

    groups.set(key, existing)
  }

  return [...groups.values()].slice(0, limit)
}

/* ========================================================================== */
/* Analytics                                                                   */
/* ========================================================================== */

export async function listMonthlyCashflow(
  orgId: string,
  from: string,
  to: string,
): Promise<MonthlyCashflow[]> {
  const { data, error } = await supabase
    .from('monthly_cashflow')
    .select('*')
    .eq('org_id', orgId)
    .gte('month', from)
    .lte('month', to)
    .order('month', { ascending: true })

  if (error) throw new Error(describeError(error))
  return data ?? []
}

export async function listMonthlyByAccount(
  orgId: string,
  from: string,
  to: string,
): Promise<MonthlyByAccount[]> {
  const { data, error } = await supabase
    .from('monthly_by_account')
    .select('*')
    .eq('org_id', orgId)
    .gte('month', from)
    .lte('month', to)

  if (error) throw new Error(describeError(error))
  return data ?? []
}

export async function getOrgOverview(orgId: string): Promise<OrgOverview | null> {
  const { data, error } = await supabase
    .from('org_overview')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw new Error(describeError(error))
  return data
}

/** Resumo completo do dashboard numa única chamada. */
export async function getDashboardSummary(
  orgId: string,
  from: string,
  to: string,
): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc('dashboard_summary', {
    p_org_id: orgId,
    p_from: from,
    p_to: to,
  })

  if (error) throw new Error(describeError(error))
  return data as DashboardSummary
}

/** Gera lançamentos de demonstração para a empresa. */
export async function seedDemoData(orgId: string, months = 12): Promise<number> {
  const { data, error } = await supabase.rpc('seed_demo_data', {
    p_org_id: orgId,
    p_months: months,
  })

  if (error) throw new Error(describeError(error))
  return data as number
}
