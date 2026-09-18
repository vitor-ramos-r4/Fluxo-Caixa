import { useState } from 'react'
import { Check, Copy, Database, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const SQL_HINT = `-- No SQL Editor do Supabase, rode os arquivos de:
-- supabase/migrations/20260101000000_core_schema.sql
-- supabase/migrations/20260101000001_rls_and_analytics.sql`

/**
 * Tela exibida quando as variáveis `VITE_SUPABASE_*` ainda não foram
 * preenchidas. Evita a tela em branco e diz exatamente o que fazer.
 */
export function SetupNotice() {
  const [copied, setCopied] = useState(false)

  async function copyHint() {
    await navigator.clipboard.writeText(SQL_HINT)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-100 px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="surface overflow-hidden">
          <div className="border-b border-ink-200 px-6 py-5">
            <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Database className="size-5" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-ink-900">
              Conecte seu projeto Supabase
            </h1>
            <p className="mt-1 text-[13px] leading-5 text-ink-500">
              O sistema está pronto, mas ainda não aponta para um banco de
              dados. Faltam duas variáveis de ambiente.
            </p>
          </div>

          <div className="space-y-5 px-6 py-5">
            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-white">
                  1
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink-800">
                    Crie um projeto no Supabase
                  </p>
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-brand-700 hover:text-brand-800 underline underline-offset-2"
                  >
                    supabase.com/dashboard
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </li>

              <li className="flex gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-white">
                  2
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink-800">
                    Aplique as migrations
                  </p>
                  <p className="mt-0.5 text-[12px] leading-5 text-ink-500">
                    Abra o SQL Editor e execute os dois arquivos da pasta{' '}
                    <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[11px] text-ink-700">
                      supabase/migrations
                    </code>
                    .
                  </p>
                  <button
                    onClick={copyHint}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] text-ink-600 transition-colors hover:bg-ink-50"
                  >
                    {copied ? (
                      <Check className="size-3 text-brand-600" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    {copied ? 'Copiado' : 'Copiar caminhos'}
                  </button>
                </div>
              </li>

              <li className="flex gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-white">
                  3
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink-800">
                    Preencha o <code className="font-mono text-[12px]">.env.local</code>
                  </p>
                  <p className="mt-0.5 text-[12px] leading-5 text-ink-500">
                    Em Project Settings → API, copie a URL e a chave{' '}
                    <em>anon public</em>.
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-950 px-3 py-2.5 text-[11px] leading-5 text-ink-300">
                    <code>{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}</code>
                  </pre>
                </div>
              </li>
            </ol>

            <div className="rounded-lg border border-ink-200 bg-ink-50 px-3.5 py-3">
              <p className="text-[12px] leading-5 text-ink-600">
                Depois de salvar o arquivo, reinicie o servidor de
                desenvolvimento — o Vite só lê variáveis de ambiente no boot.
              </p>
            </div>
          </div>

          <div className="flex justify-end border-t border-ink-200 bg-ink-50 px-6 py-3.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Já configurei, recarregar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
