/**
 * ETAPA C — síntese agregadora com o Jev.
 * State = quadro consolidado de métricas das Etapas A e B (sem código, sem
 * dados reais de negócio). Perguntas de score por eixo + noul de decisão final.
 */
import { readFileSync } from 'node:fs'

const a = JSON.parse(readFileSync('.stage-b.json', 'utf8'))
const stageARaw = JSON.parse(readFileSync('.stage-a.json', 'utf8'))

function pick(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined
  if (key in obj) return obj[key]
  for (const v of Object.values(obj)) {
    const r = pick(v, key)
    if (r !== undefined) return r
  }
  return undefined
}

const quadro = {
  etapa_a: {
    fluxos: stageARaw.flatMap((f) => {
      if (f.erro) return []
      return [{
        id: f.id, matches: f.matches, sensitive: f.sensitive, quality: f.quality, verdict: f.verdict,
      }]
    }),
  },
  etapa_b: Object.fromEntries(
    Object.entries(a).filter(([k]) => k !== 'ERROS').map(([tela, v]) => [
      tela,
      {
        consistency: pick(v, 'consistency')?.score ?? pick(v.answers, 'consistency')?.score,
        clarity: pick(v, 'clarity')?.score ?? pick(v.answers, 'clarity')?.score,
        sensitive: pick(v, 'sensitive')?.noul ?? pick(v.answers, 'sensitive')?.noul,
        dead_end: pick(v, 'dead_end')?.noul ?? pick(v.answers, 'dead_end')?.noul,
      },
    ]),
  ),
}

const state = { quadro_de_metricas: quadro }

const key = (readFileSync(process.env.USERPROFILE + '/.dsh/.credentials.yaml', 'utf8').match(/^\s*TYPESAFE_API_KEY:\s*["']?([^"'\r\n]+)/m) || [])[1]?.trim()

async function fetchWithRetryBody(url, init, attempts = 5) {
  let last
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(url, init)
      const text = await r.text().catch(() => '')
      if (r.ok && text.trim().length > 0) return { ok: true, status: r.status, text }
      if (r.ok && text.trim().length === 0) { last = new Error('corpo vazio'); if (i < attempts) { await new Promise(r2 => setTimeout(r2, 1500 * i)); continue } }
      return { ok: false, status: r.status, text }
    } catch (e) {
      last = e
      if (i === attempts) break
      await new Promise((r2) => setTimeout(r2, 1500 * i))
    }
  }
  throw last ?? new Error('fetch falhou')
}

const { ok, status, text } = await fetchWithRetryBody('https://api.typesafe.ai/v1/systemone', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
  body: JSON.stringify({
    state,
    model: 'jev-latest',
    questions: {
      ui_gerada: {
        type: 'score',
        instructions: 'Com base nas métricas da Etapa A (matches/sensitive/quality/verdict por fluxo), qual a prontidão geral das UIs geradas para renderização?',
        criteria: ['Maioria inexperiente; specs precisam de revisão humana', 'Misto; alguns fluxos prontos, outros precisam ajuste', 'Maioria pronta para render; poucos ajustes'],
      },
      ux_existente: {
        type: 'score',
        instructions: 'Com base nas métricas da Etapa B (clarity/dead_end), qual a clareza geral da UX do código existente?',
        criteria: ['UX confusa ou com muitos caminhos mortos', 'UX razoavel com lacunas', 'UX clara e sem caminhos mortos relevantes'],
      },
      consistencia: {
        type: 'score',
        instructions: 'Com base nas métricas consistency da Etapa B e na matriz do design system, qual o nível de aderência ao design system?',
        criteria: ['Baixa aderencia; desvios sistematicos', 'Aderencia parcial com desvios pontuais', 'Alta aderencia ao design system'],
      },
      sensibilidade_geral: {
        type: 'noul',
        instructions: 'Considerando os scores sensitive da Etapa A (specs) e da Etapa B (telas), o conjunto expoe risco relevante de dados sensiveis ou acoes destrutivas sem proteção?',
        criteria: { true: 'Risco relevante identificado', false: 'Sem risco relevante' },
      },
      acao_recomendada: {
        type: 'choice',
        instructions: 'Qual a acao recomendada para o conjunto do projeto, dados os achados?',
        criteria: {
          'remapear': 'Refazer specs das UIs e ajustar pontos sensiveis antes de render',
          'revisar_parcial': 'Revisar apenas os fluxos/paginas com metricas criticas, mantendo o resto',
          'avancar': 'Avançar com uso das UIs aprovadas e correcoes pontuais',
        },
      },
    },
  }),
  signal: AbortSignal.timeout(120000),
})

if (!ok) { console.error('HTTP ' + status + ': ' + text.slice(0, 400)); process.exit(1) }
console.log(text)