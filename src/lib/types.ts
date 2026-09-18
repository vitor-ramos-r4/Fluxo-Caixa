/**
 * Tipos de domínio do sistema de fluxo de caixa.
 *
 * Espelham o schema em `supabase/migrations`. Foram escritos à mão em vez de
 * gerados para que os campos possam ser documentados e para manter os enums
 * como uniões de string — bem mais ergonômicas no front.
 */

/** Natureza do lançamento. Substitui a coluna "Coluna1" (E/S) da planilha. */
export type EntryKind = 'entrada' | 'saida'

/** Situação de liquidação. Substitui a coluna booleana "Pago". */
export type EntryStatus = 'pago' | 'em_aberto'

export type AccountKind = 'receita' | 'despesa' | 'transferencia'

export type PartyKind = 'cliente' | 'fornecedor' | 'ambos'

export type WalletKind =
  | 'corrente'
  | 'poupanca'
  | 'caixa'
  | 'investimento'
  | 'cartao'

export type GoalPeriod = 'mensal' | 'trimestral' | 'anual'

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer'

/* -------------------------------------------------------------------------- */
/* Entidades                                                                   */
/* -------------------------------------------------------------------------- */

export interface Organization {
  id: string
  name: string
  legal_name: string | null
  document: string | null
  segment: string | null
  opening_balance: number
  starts_on: string
  accent: string
  is_archived: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface Membership {
  id: string
  org_id: string
  user_id: string
  role: MemberRole
  created_at: string
}

export interface ChartOfAccount {
  id: string
  org_id: string
  parent_id: string | null
  name: string
  kind: AccountKind
  code: string | null
  color: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Wallet {
  id: string
  org_id: string
  name: string
  kind: WalletKind
  bank_name: string | null
  bank_code: string | null
  branch: string | null
  account_number: string | null
  opening_balance: number
  color: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Party {
  id: string
  org_id: string
  name: string
  kind: PartyKind
  document: string | null
  email: string | null
  phone: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Entry {
  id: string
  org_id: string
  account_id: string
  wallet_id: string | null
  party_id: string | null
  kind: EntryKind
  status: EntryStatus
  description: string
  amount: number
  issued_on: string
  settled_on: string | null
  reference: string | null
  notes: string | null
  is_transfer: boolean
  transfer_group: string | null
  reconciled_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Lançamento com as relações já resolvidas (join do PostgREST). */
export interface EntryWithRelations extends Entry {
  chart_of_accounts: Pick<ChartOfAccount, 'id' | 'name' | 'kind' | 'color'> | null
  wallets: Pick<Wallet, 'id' | 'name' | 'color'> | null
  parties: Pick<Party, 'id' | 'name' | 'kind'> | null
}

/* -------------------------------------------------------------------------- */
/* Views analíticas                                                            */
/* -------------------------------------------------------------------------- */

export interface MonthlyCashflow {
  org_id: string
  month: string
  /** Entradas liquidadas no mês. */
  income: number
  /** Saídas liquidadas no mês. */
  expense: number
  /** Entradas ainda em aberto — não afetam o saldo realizado. */
  pending_income: number
  /** Saídas ainda em aberto. */
  pending_expense: number
  operational_result: number
  accumulated_balance: number
}

export interface MonthlyByAccount {
  org_id: string
  month: string
  account_id: string
  account_name: string
  account_kind: AccountKind
  /** Quantidade de lançamentos liquidados. */
  entry_count: number
  /** Total liquidado na conta no mês. */
  total: number
  /** Total ainda em aberto. */
  pending_total: number
  pending_count: number
}

export interface WalletBalance {
  wallet_id: string
  org_id: string
  name: string
  kind: WalletKind
  color: string
  opening_balance: number
  current_balance: number
  pending_income: number
  pending_expense: number
}

export interface OrgOverview {
  org_id: string
  name: string
  opening_balance: number
  received: number
  paid: number
  receivable: number
  payable: number
  balance: number
  open_entries: number
  last_entry_on: string | null
}

export interface PartyTotal {
  party_id: string
  org_id: string
  name: string
  kind: PartyKind
  settled_total: number
  open_total: number
  entry_count: number
  last_entry_on: string | null
}

/* -------------------------------------------------------------------------- */
/* RPC                                                                         */
/* -------------------------------------------------------------------------- */

export interface DashboardSeriesPoint {
  month: string
  income: number
  expense: number
}

export interface DashboardAccountSlice {
  name: string
  kind: AccountKind
  total: number
  entry_count: number
}

export interface DashboardSummary {
  range: { from: string; to: string }
  totals: {
    received: number
    paid: number
    receivable: number
    payable: number
    open_count: number
    entry_count: number
  }
  series: DashboardSeriesPoint[]
  by_account: DashboardAccountSlice[]
}

/* -------------------------------------------------------------------------- */
/* Metas e alertas (calculados no cliente a partir do fluxo)                    */
/* -------------------------------------------------------------------------- */

export interface BudgetGoal {
  id: string
  org_id: string
  account_id: string | null
  kind: EntryKind
  period: GoalPeriod
  /** Período no formato YYYY-MM (mensal), YYYY-Qn (trimestral) ou YYYY (anual). */
  reference: string
  target_amount: number
  created_at: string
}

export type AlertSeverity = 'critico' | 'atencao' | 'info'

export interface Alert {
  id: string
  severity: AlertSeverity
  title: string
  detail: string
  /** Rota sugerida para resolver o alerta. */
  action?: { label: string; to: string }
}
