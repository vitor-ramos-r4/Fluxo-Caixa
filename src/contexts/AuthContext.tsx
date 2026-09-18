import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, describeError, isSupabaseConfigured } from '@/lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  /** `true` enquanto a sessão persistida é restaurada no boot. */
  loading: boolean
  /**
   * Erro devolvido pelo Supabase no fragmento da URL — link de confirmação
   * expirado, já utilizado ou inválido. A tela de login exibe isso.
   */
  linkError: string | null
  clearLinkError: () => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<{
    needsConfirmation: boolean
  }>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Traduz os erros que o Supabase devolve no fragmento da URL.
 *
 * Eles não vêm como exceção: chegam em `#error=...&error_code=...`, então o
 * cliente precisa lê-los da própria URL. Sem isso, quem clica num link de
 * confirmação expirado aterrissa numa tela de login sem saber o motivo.
 */
function readLinkError(): string | null {
  if (typeof window === 'undefined') return null

  const hash = window.location.hash.replace(/^#/, '')
  const search = window.location.search.replace(/^\?/, '')
  const raw = hash || search
  if (!raw || !raw.includes('error')) return null

  const params = new URLSearchParams(raw)
  const code = params.get('error_code') ?? ''
  const description = params.get('error_description') ?? ''

  if (code === 'otp_expired' || /expired/i.test(description)) {
    return 'Este link de confirmação expirou. Crie a conta novamente ou peça um novo e-mail.'
  }
  if (/invalid/i.test(description)) {
    return 'Este link de confirmação não é mais válido. Ele pode já ter sido usado.'
  }
  if (params.get('error') === 'access_denied') {
    return 'O acesso foi negado. Solicite um novo link de confirmação.'
  }
  if (description) return description.replace(/\+/g, ' ')

  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [linkError, setLinkError] = useState<string | null>(() => readLinkError())

  const clearLinkError = useCallback(() => {
    setLinkError(null)
    // Remove o fragmento de erro para que um recarregamento não o traga de
    // volta — o link já foi consumido e continuaria falhando.
    if (window.location.hash.includes('error')) {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      )
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    let active = true

    // Sessão inicial…
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    // …e atualizações (login, logout, refresh de token).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw new Error(describeError(error))
  }, [])

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/entrar`,
        },
      })
      if (error) throw new Error(describeError(error))

      // Sem sessão após o cadastro significa que a confirmação por e-mail
      // está ligada no projeto Supabase.
      return { needsConfirmation: !data.session }
    },
    [],
  )

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(describeError(error))
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    if (error) throw new Error(describeError(error))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      linkError,
      clearLinkError,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
    }),
    [
      session,
      loading,
      linkError,
      clearLinkError,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth precisa ser usado dentro de <AuthProvider>')
  }
  return context
}

/** Nome de exibição do usuário, com fallbacks sensatos. */
export function useDisplayName(): string {
  const { user } = useAuth()
  if (!user) return ''
  const meta = user.user_metadata as { full_name?: string } | undefined
  if (meta?.full_name?.trim()) return meta.full_name.trim()
  return user.email?.split('@')[0] ?? 'Usuário'
}
