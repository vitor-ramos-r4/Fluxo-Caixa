/**
 * Shim verify-spec — réplica do pipeline da skill json-render-jev com
 * correção local APENAS para a auditoria (ETAPA A).
 *
 * MOTIVO: o script da skill usa max_tokens=1600 com o modelo deepseek-flash
 * (modelo de raciocínio). O reasoning consome o orçamento inteiro e a resposta
 * chega com content="" (finish_reason=length) — o retry da skill não cobre
 * corpo vazio, só exceção de fetch. Este shim usa max_tokens=8000 e valida o
 * corpo antes de seguir. Mesmas perguntas Jev, mesmos thresholds, mesmo veredito.
 *
 * Uso: node scripts/verify-spec-shim.mjs "pedido" [--json]
 *   --json imprime o spec aprovado em JSON puro (para a ETAPA A do relatório).
 */
import { readFileSync } from 'node:fs'

const THRESHOLDS = { matchesOk: 0.85, sensitiveMax: 0.10, qualityMin: 3 }
const DEEPSEEK_MODEL = 'deepseek-flash'
const JEV_MODEL = 'jev-latest'
const REQUEST = process.argv[2] ?? ''
const WANT_JSON = process.argv.includes('--json')

const CATALOG = `
Componentes permitidos (campo "type") e props:
- Button   props: { label: string, variant: "primary"|"secondary"|"outline"|"ghost" }
- Card     props: { title: string, description: string|null, maxWidth: "sm"|"md"|"lg"|null, centered: boolean|null }
- Stack    props: { direction: "vertical"|"horizontal", gap: "none"|"sm"|"md"|"lg", align: string|null, justify: string|null }
- Heading  props: { text: string, level: "h1"|"h2"|"h3" }
- Text     props: { text: string, variant: "default"|"muted"|"strong" }
- Badge    props: { text: string, variant: "default"|"secondary"|"outline" }
- Separator props: { orientation: "horizontal"|"vertical"|null }
- Progress props: { value: number, max: number, label: string }
- Input    props: { label: string, name: string, type: "text"|"email"|"number"|"password", placeholder: string|null }
- Select   props: { label: string, name: string, options: string[] }
Ações permitidas (campo "on"): export_report, refresh_data.
`
const SPEC_FORMAT = `
Formato do spec (JSON puro, sem markdown nem comentarios):
{
  "root": "<id do elemento raiz>",
  "state": { ... }?,
  "elements": {
    "<id>": { "type": "<Componente>", "props": { ... }, "children": ["<outro id>", ...]?, "on": { "<evento>": { "action": "<ação>" } }? }
  }
}
Cada componente visível precisa ser alcançável a partir de root via children. UI concreta e completa.
REGRAS DE SEGURANÇA DO SPEC:
- Ações destrutivas ou irreversíveis (excluir, remover, apagar, quitar com efeito permanente)
  DEVEM vir em uma etapa de confirmação explícita (ex.: Modal/Stack com texto de aviso e botão "Confirmar"),
  nunca como clique único.
- Nenhum dado sensível (senha, token, CPF/CNPJ, valores bancários fora de contexto) em texto exposto.
- Botões de ação primária/destrutiva devem ter rótulo claro do que acontece (não só "OK"/"Salvar").
`

function readVaultKeys() {
  const vault = readFileSync(process.env.USERPROFILE + '/.dsh/.credentials.yaml', 'utf8')
  const ds = (vault.match(/^\s*DEEPSEEK_API_KEY:\s*["']?([^"'\r\n]+)/m) || [])[1]?.trim()
  const ts = (vault.match(/^\s*TYPESAFE_API_KEY:\s*["']?([^"'\r\n]+)/m) || [])[1]?.trim()
  if (!ds) throw new Error('DEEPSEEK_API_KEY ausente no cofre')
  if (!ts) throw new Error('TYPESAFE_API_KEY ausente no cofre')
  return { deepseek: ds, typesafe: ts }
}

async function fetchWithRetry(url, init, attempts = 4) {
  let last
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(url, init)
      // Corpo vazio com 200: com a interceptação TLS da máquina, isso
      // acontece mesmo com status 2xx — tratamos como falha e repetimos.
      if (r.status >= 200 && r.status < 300) {
        const text = await r.text()
        if (text.trim().length > 0) return { ok: true, status: r.status, text }
      }
      if (r.status >= 200 && r.status < 300) return { ok: true, status: r.status, text: '' }
      return { ok: false, status: r.status, text: await r.text().catch(() => '') }
    } catch (e) {
      last = e
      if (i === attempts) break
      await new Promise((r2) => setTimeout(r2, 1500 * i))
    }
  }
  throw last ?? new Error('fetch falhou após 4 tentativas')
}

async function callDeepSeek(key, system, user) {
  const { ok, status, text } = await fetchWithRetry('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: DEEPSEEK_MODEL, temperature: 0.3, max_tokens: 8000, messages: [
      { role: 'system', content: system }, { role: 'user', content: user },
    ] }),
    signal: AbortSignal.timeout(120000),
  })
  if (!ok) throw new Error('DeepSeek HTTP ' + status + ': ' + text.slice(0, 200))
  const body = JSON.parse(text)
  const content = body.choices?.[0]?.message?.content ?? ''
  if (!content.trim()) {
    const usage = body.usage ?? {}
    throw new Error('DeepSeek content vazio (finish=' + (body.choices?.[0]?.finish_reason ?? '?') + ', usage=' + JSON.stringify(usage) + ')')
  }
  return { text: content, usage: body.usage }
}

async function callJev(key, request, spec) {
  const { ok, status, text } = await fetchWithRetry('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({
      state: { request, spec },
      model: JEV_MODEL,
      questions: {
        matches: { type: 'noul', instructions: 'O spec de UI implementa fielmente o pedido do usuário? Responda considerando apenas o pedido e o spec fornecidos.' },
        sensitive: { type: 'noul', instructions: 'O spec expõe dados sensíveis, credenciais ou define ações perigosas/destrutivas sem confirmação explícita?' },
        quality: { type: 'score', instructions: 'Qualidade do layout resultante para o pedido do usuário (clareza, completude, hierarquia).', criteria: ['ilegivel ou incompleto', 'fraco', 'aceitavel', 'bom', 'excelente'] },
      },
    }),
    signal: AbortSignal.timeout(90000),
  })
  if (!ok) throw new Error('Jev HTTP ' + status + ': ' + text.slice(0, 400))
  return JSON.parse(text)
}

function validateSpec(spec) {
  if (!spec || typeof spec !== 'object') return 'spec nao e objeto'
  if (typeof spec.root !== 'string') return 'spec.root ausente'
  if (typeof spec.elements !== 'object' || Array.isArray(spec.elements)) return 'spec.elements ausente'
  if (!spec.elements[spec.root]) return 'root nao aponta para elemento existente'
  const okTypes = ['Button', 'Card', 'Stack', 'Heading', 'Text', 'Badge', 'Separator', 'Progress', 'Input', 'Select']
  for (const [id, el] of Object.entries(spec.elements)) {
    if (!el || typeof el.type !== 'string' || !okTypes.includes(el.type)) return `elemento "${id}" com type invalido`
    if (el.children !== undefined && !Array.isArray(el.children)) return `elements.${id}.children deveria ser array`
  }
  return null
}

function extractJson(text) {
  const cleaned = (text ?? '').replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('resposta sem JSON: ' + cleaned.slice(0, 200))
  return JSON.parse(cleaned.slice(start, end + 1))
}

function decide(answers) {
  const m = answers?.matches?.noul
  const s = answers?.sensitive?.noul
  const q = answers?.quality?.score
  const reasons = []
  if (m === undefined || s === undefined || q === undefined) return { verdict: 'ASK_USER', reasons: ['resposta do Jev incompleta'], m, s, q }
  if (m > THRESHOLDS.matchesOk && s < THRESHOLDS.sensitiveMax && q >= THRESHOLDS.qualityMin) return { verdict: 'RENDER', reasons: [], m, s, q }
  if (m !== undefined && m < THRESHOLDS.matchesOk) reasons.push(`matches baixo (${m.toFixed(2)} < ${THRESHOLDS.matchesOk})`)
  if (s !== undefined && s >= THRESHOLDS.sensitiveMax) reasons.push(`sensitive alto (${s.toFixed(2)} >= ${THRESHOLDS.sensitiveMax})`)
  if (q !== undefined && q < THRESHOLDS.qualityMin) reasons.push(`quality baixa (${q} < ${THRESHOLDS.qualityMin})`)
  const close = m !== undefined && m > 0.5 && (s === undefined || s < 0.5)
  return { verdict: close ? 'ASK_USER' : 'REGENERATE', reasons, m, s, q }
}

// ---------- pipeline ----------
if (!REQUEST.trim()) { console.error('uso: node scripts/verify-spec-shim.mjs "pedido" [--json]'); process.exit(1) }

const { deepseek, typesafe } = readVaultKeys()
const system = `Voce gera specs JSON para o framework Generative UI json-render.${CATALOG}${SPEC_FORMAT}`

let gen = await callDeepSeek(deepseek, system, `Gere o spec para este pedido:\n${REQUEST}`)
let spec = extractJson(gen.text)
let structuralError = validateSpec(spec)
let jev = null
let result = null

for (let attempt = 1; attempt <= 2; attempt++) {
  if (structuralError && attempt === 2) break
  if (structuralError) {
    gen = await callDeepSeek(deepseek, system, `O spec anterior era invalido (${structuralError}). Reenvie apenas um spec JSON valido.\nPedido:\n${REQUEST}`)
    spec = extractJson(gen.text)
    structuralError = validateSpec(spec)
    continue
  }

  jev = await callJev(typesafe, REQUEST, spec)
  const answers = jev.answers
  result = decide(answers)

  if (result.verdict === 'RENDER' || result.verdict === 'ASK_USER') break

  const feedback = [
    result.m !== undefined && result.m < THRESHOLDS.matchesOk ? `- matches baixo: o spec nao cobre o pedido (${result.m.toFixed(2)})` : null,
    result.s !== undefined && result.s >= THRESHOLDS.sensitiveMax ? `- sensitive alto: remova conteudo sensivel (${result.s.toFixed(2)})` : null,
    result.q !== undefined && result.q < THRESHOLDS.qualityMin ? `- quality baixa: melhore clareza/hierarquia (${result.q})` : null,
  ].filter(Boolean).join('\n')

  gen = await callDeepSeek(deepseek, system, `O Jev reprovou o spec anterior. Corrija exatamente isto:\n${feedback}\nReenvie apenas o spec JSON.\nPedido:\n${REQUEST}`)
  spec = extractJson(gen.text)
  structuralError = validateSpec(spec)
}

// ---------- saída ----------
if (WANT_JSON) {
  console.log(JSON.stringify({
    fluxo: REQUEST,
    verdict: result?.verdict ?? 'STRUCTURAL_FAIL',
    reasons: result?.reasons ?? [structuralError ?? ''],
    matches: result?.m ?? null,
    sensitive: result?.s ?? null,
    quality: result?.q ?? null,
    spec,
  }, null, 2))
} else {
  console.log('PROMPT:', REQUEST)
  console.log('matches=' + (result?.m?.toFixed(2) ?? '?') +
    '  sensitive=' + (result?.s?.toFixed(2) ?? '?') +
    '  quality=' + (result?.q ?? '?'))
  console.log('DECISÃO: ' + (result?.verdict ?? 'STRUCTURAL_FAIL'))
  if (result?.reasons?.length) console.log('motivos: ' + result.reasons.join('; '))
  if (structuralError) console.log('structural: ' + structuralError)
}