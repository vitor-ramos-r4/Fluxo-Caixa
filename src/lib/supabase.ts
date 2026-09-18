import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase único da aplicação.
 *
 * As credenciais vêm de variáveis `VITE_*`, que ficam embutidas no bundle.
 * Isso é seguro e esperado: a chave `anon` é pública por design, e todo o
 * controle de acesso é feito por Row Level Security no banco.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * `true` quando o projeto ainda não foi configurado.
 * A UI usa isso para mostrar instruções de setup em vez de uma tela em branco.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

function createSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    // Não lançamos erro aqui: o app precisa montar para exibir o aviso de
    // configuração. As chamadas é que vão falhar, com mensagem clara.
    return createClient('http://localhost:54321', 'missing-anon-key', {
      auth: { persistSession: false },
    })
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'fluxo-caixa.auth',
    },
    db: { schema: 'public' },
    global: {
      headers: { 'x-application-name': 'fluxo-caixa' },
    },
  })
}

export const supabase = createSupabaseClient()

/**
 * Traduz erros do PostgREST/Postgres para mensagens em português.
 *
 * O usuário final não deve ver "duplicate key value violates unique
 * constraint". Aqui mapeamos os casos que realmente acontecem no sistema.
 */
export function describeError(error: unknown): string {
  if (!error) return 'Erro desconhecido.'

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ((error as { message?: string }).message ?? 'Erro desconhecido.')

  const code = (error as { code?: string }).code ?? ''

  // Postgres
  if (code === '23505' || message.includes('duplicate key')) {
    if (message.includes('chart_of_accounts')) {
      return 'Já existe uma conta com esse nome nesta empresa.'
    }
    if (message.includes('parties')) {
      return 'Já existe um cliente ou fornecedor com esse documento.'
    }
    if (
      message.includes('organizations_owner_document_key') ||
      message.includes('organizations_document_key')
    ) {
      return 'Você já cadastrou uma empresa com esse CNPJ/CPF.'
    }
    return 'Esse registro já existe.'
  }

  if (code === '23503' || message.includes('violates foreign key')) {
    return 'O registro está vinculado a outros dados e não pode ser removido.'
  }

  if (code === '23514' || message.includes('violates check constraint')) {
    if (message.includes('entries_settled_matches_status')) {
      return 'Um lançamento pago precisa ter data de liquidação; um em aberto, não.'
    }
    if (message.includes('entries_settled_after_issued')) {
      return 'A data de liquidação não pode ser anterior à data do lançamento.'
    }
    return 'Os dados informados não passaram na validação.'
  }

  if (code === '42501' || message.includes('row-level security')) {
    return 'Você não tem permissão para essa operação nesta empresa.'
  }

  if (code === 'PGRST116') {
    return 'Registro não encontrado.'
  }

  // Auth
  if (message.includes('Invalid login credentials')) {
    return 'E-mail ou senha incorretos.'
  }
  if (message.includes('Email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'
  }
  if (message.includes('User already registered')) {
    return 'Já existe uma conta com esse e-mail.'
  }
  if (message.includes('Password should be at least')) {
    return 'A senha precisa ter pelo menos 6 caracteres.'
  }
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet.'
  }

  return message
}
