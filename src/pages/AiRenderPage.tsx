import { useState } from 'react'
import { AiRenderer } from '@/render/registry'
import { conciliacaoSpec } from '@/render/conciliacao-spec'
import { exampleSpec } from '@/render/example-spec'
import { PageBody, PageHeader } from '@/components/layout/Page'

/**
 * Preview de UI gerada por IA (json-render + Jev).
 *
 * Renderiza o spec APROVADO (verdict RENDER) do fluxo de Conciliação, gerado
 * na auditoria com Jev. O spec de exemplo permanece disponível para teste.
 */
export function AiRenderPage() {
  const [lastAction, setLastAction] = useState<string | null>(null)
  const [useApproved, setUseApproved] = useState(true)

  const spec = useApproved ? conciliacaoSpec : exampleSpec

  return (
    <>
      <PageHeader title="Preview de UI gerada por IA" />
      <PageBody>
        <div className="max-w-xl space-y-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUseApproved(true)}
            className={
              useApproved
                ? 'rounded-md bg-ink-900 px-2.5 py-1.5 text-[12px] font-medium text-white'
                : 'rounded-md px-2.5 py-1.5 text-[12px] font-medium text-ink-500 hover:text-ink-800'
            }
          >
            Conciliação (aprovado RENDER)
          </button>
          <button
            onClick={() => setUseApproved(false)}
            className={
              !useApproved
                ? 'rounded-md bg-ink-900 px-2.5 py-1.5 text-[12px] font-medium text-white'
                : 'rounded-md px-2.5 py-1.5 text-[12px] font-medium text-ink-500 hover:text-ink-800'
            }
          >
            Exemplo
          </button>
        </div>

        <div className="rounded-lg border border-ink-200 bg-white p-5">
          <AiRenderer
            spec={spec}
            onAction={(name) => {
              console.info('[ai-render] action:', name)
              setLastAction(name)
            }}
          />
        </div>

        <div className="space-y-1 text-[13px] text-ink-500">
          <p>
            Fluxo: a skill <code className="rounded bg-ink-100 px-1">json-render-jev</code> gera o spec
            com DeepSeek e verifica com o Jev antes de liberar o RENDER. O spec aprovado pode ser
            salvo e renderizado aqui via{' '}
            <code className="rounded bg-ink-100 px-1">{'<AiRenderer spec={...}/>'}</code>.
          </p>
          <p>
            Verificação manual (CLI):{' '}
            <code className="rounded bg-ink-100 px-1">npm run verify-spec -- "seu pedido"</code>
          </p>
          {lastAction ? (
            <p className="text-brand-600">Última ação disparada: {lastAction}</p>
          ) : null}
        </div>
        </div>
      </PageBody>
    </>
  )
}