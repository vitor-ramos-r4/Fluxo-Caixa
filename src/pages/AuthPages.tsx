import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { CircleDollarSign, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { isSupabaseConfigured } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { SetupNotice } from '@/components/layout/SetupNotice'

/* -------------------------------------------------------------------------- */
/* Moldura comum das telas de autenticação                                     */
/* -------------------------------------------------------------------------- */

function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      {/* Painel de marca — escondido no mobile para não empurrar o formulário */}
      <div className="relative hidden w-[46%] flex-col justify-between bg-ink-950 p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand-500 text-white">
            <CircleDollarSign className="size-4.5" strokeWidth={2.2} />
          </div>
          <span className="text-[13px] font-semibold tracking-tight text-white">
            Fluxo de Caixa
          </span>
        </div>

        <div className="max-w-sm">
          <h2 className="text-2xl font-semibold leading-9 tracking-tight text-white">
            O caixa da sua empresa, sob controle.
          </h2>
          <p className="mt-3 text-sm leading-6 text-ink-400">
            Lançamentos, conciliação, DRE e projeções num só lugar — atualizados
            em tempo real e acessíveis de qualquer dispositivo.
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5">
            {[
              ['Multiempresa', 'Consolide vários CNPJs'],
              ['Conciliação', 'Extrato x sistema'],
              ['Relatórios', 'DRE e fluxo mensal'],
              ['Segurança', 'RLS por empresa'],
            ].map(([term, desc]) => (
              <div key={term}>
                <dt className="text-[12px] font-medium text-ink-200">{term}</dt>
                <dd className="mt-0.5 text-[11px] leading-4 text-ink-500">
                  {desc}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-[11px] text-ink-600">
          © {new Date().getFullYear()} Fluxo de Caixa
        </p>
      </div>

      {/* Formulário */}
      <div className="flex flex-1 items-center justify-center bg-ink-100 px-4 py-10 sm:px-8">
        <div className="w-full max-w-[380px]">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <CircleDollarSign className="size-4.5" strokeWidth={2.2} />
            </div>
            <span className="text-[13px] font-semibold tracking-tight text-ink-900">
              Fluxo de Caixa
            </span>
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-ink-900">
            {title}
          </h1>
          <p className="mt-1 text-[13px] text-ink-500">{subtitle}</p>

          <div className="mt-6">{children}</div>

          {footer && <div className="mt-5 text-[13px]">{footer}</div>}
        </div>
      </div>
    </div>
  )
}

/** Bloco de erro reutilizado nos formulários de autenticação. */
function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="rounded-lg border border-[color-mix(in_oklch,var(--color-negative)_25%,transparent)] bg-[var(--color-negative-soft)] px-3 py-2.5 text-[13px] text-negative"
    >
      {message}
    </div>
  )
}

/** Bloco de sucesso (confirmação de e-mail, redefinição enviada). */
function FormSuccess({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-[13px] text-brand-800">
      {message}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Login                                                                       */
/* -------------------------------------------------------------------------- */

export function LoginPage() {
  const { signIn, user, loading, linkError, clearLinkError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (!isSupabaseConfigured) {
    return <SetupNotice />
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-100">
        <Loader2 className="size-5 animate-spin text-ink-400" />
      </div>
    )
  }

  if (user) return <Navigate to={from} replace />

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await signIn(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Acesse com as credenciais da sua conta."
      footer={
        <span className="text-ink-500">
          Não tem conta?{' '}
          <Link
            to="/criar-conta"
            className="font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2"
          >
            Criar conta
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Erro vindo do link de confirmação: fica visível até o usuário agir. */}
        {linkError && (
          <div
            role="alert"
            className="rounded-lg border border-[color-mix(in_oklch,var(--color-caution)_32%,transparent)] bg-[var(--color-caution-soft)] px-3 py-2.5 text-[13px] leading-5 text-[color-mix(in_oklch,var(--color-caution)_70%,black)]"
          >
            <p>{linkError}</p>
            <button
              type="button"
              onClick={clearLinkError}
              className="mt-1.5 font-medium underline underline-offset-2"
            >
              Entendi
            </button>
          </div>
        )}

        <FormError message={error} />

        <Field label="E-mail" required>
          <Input
            type="email"
            autoComplete="email"
            required
            autoFocus
            placeholder="voce@empresa.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Senha" required>
          <Input
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <div className="flex justify-end">
          <Link
            to="/esqueci-senha"
            className="text-[12px] text-ink-500 hover:text-ink-800 underline underline-offset-2"
          >
            Esqueci minha senha
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={submitting}
          className="w-full"
        >
          Entrar
        </Button>
      </form>
    </AuthLayout>
  )
}

/* -------------------------------------------------------------------------- */
/* Cadastro                                                                    */
/* -------------------------------------------------------------------------- */

export function SignUpPage() {
  const { signUp, user, loading } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (!isSupabaseConfigured) return <SetupNotice />
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-100">
        <Loader2 className="size-5 animate-spin text-ink-400" />
      </div>
    )
  }
  if (user) return <Navigate to="/" replace />

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }

    setSubmitting(true)
    try {
      const { needsConfirmation } = await signUp(email, password, fullName)
      if (needsConfirmation) setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a conta.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout
        title="Confirme seu e-mail"
        subtitle="Falta pouco para começar."
        footer={
          <Link
            to="/entrar"
            className="font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2"
          >
            Voltar para o login
          </Link>
        }
      >
        <FormSuccess
          message={`Enviamos um link de confirmação para ${email}. Abra a mensagem e clique no link para ativar sua conta.`}
        />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Criar conta"
      subtitle="Comece a organizar o fluxo de caixa da sua empresa."
      footer={
        <span className="text-ink-500">
          Já tem conta?{' '}
          <Link
            to="/entrar"
            className="font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2"
          >
            Entrar
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />

        <Field label="Nome completo" required>
          <Input
            required
            autoFocus
            autoComplete="name"
            placeholder="Maria Silva"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>

        <Field label="E-mail" required>
          <Input
            type="email"
            required
            autoComplete="email"
            placeholder="voce@empresa.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Senha" hint="Mínimo de 6 caracteres." required>
          <Input
            type="password"
            required
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={submitting}
          className="w-full"
        >
          Criar conta
        </Button>
      </form>
    </AuthLayout>
  )
}

/* -------------------------------------------------------------------------- */
/* Recuperação de senha                                                        */
/* -------------------------------------------------------------------------- */

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (!isSupabaseConfigured) return <SetupNotice />

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o e-mail.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Enviaremos um link para você definir uma nova senha."
      footer={
        <Link
          to="/entrar"
          className="font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2"
        >
          Voltar para o login
        </Link>
      }
    >
      {sent ? (
        <FormSuccess
          message={`Se existir uma conta para ${email}, o link de redefinição chegará em instantes.`}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={error} />
          <Field label="E-mail" required>
            <Input
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="voce@empresa.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={submitting}
            className="w-full"
          >
            Enviar link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
