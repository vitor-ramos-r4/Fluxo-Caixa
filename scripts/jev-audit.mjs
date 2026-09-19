/**
 * Helper de auditoria Jev (TypeSafe System One) — FERRAMENTA DE VERIFICAÇÃO.
 *
 * Adição isolada para a auditoria; NÃO altera nada do app (src/).
 *
 * Uso:
 *   node scripts/jev-audit.mjs <arquivo-state.json> [<arquivo-perguntas.json>]
 *
 * state.json:  { "state": {...}, "model": "jev-latest", "questions": {...} }
 * perguntas:   { "qid": { "type":"noul"|"score"|"choice", "instructions":"...", "criteria": ... } }
 *
 * Imprime no stdout as respostas (JSON) e o uso de tokens. A chave sai do
 * cofre do DSH e nunca é impressa. Retry para a camada de interceptação TLS
 * intermitente da máquina (mesma política do verify-spec da skill).
 */
import { readFileSync } from 'node:fs'

function loadVaultKey() {
  const raw = readFileSync(process.env.USERPROFILE + '/.dsh/.credentials.yaml', 'utf8')
  const m = raw.match(/^\s*TYPESAFE_API_KEY:\s*["']?([^"'\r\n]+)/m)
  if (!m) throw new Error('TYPESAFE_API_KEY ausente no cofre do DSH')
  return m[1].trim()
}

async function fetchWithRetry(url, init, attempts = 4) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch(url, init)
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt))
    }
  }
  throw lastError
}

function firstArg() {
  const a = process.argv[2]
  if (!a) {
    console.error('uso: node scripts/jev-audit.mjs <state.json> [questions.json]')
    process.exit(1)
  }
  return a
}

const statePath = firstArg()
const statePayload = JSON.parse(readFileSync(statePath, 'utf8'))

const key = loadVaultKey()
const response = await fetchWithRetry('https://api.typesafe.ai/v1/systemone', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
  body: JSON.stringify({
    state: statePayload.state,
    model: statePayload.model ?? 'jev-latest',
    questions: statePayload.questions,
  }),
  signal: AbortSignal.timeout(90000),
})

const body = await response.json()
if (!response.ok) {
  console.error('Jev ' + response.status + ': ' + JSON.stringify(body).slice(0, 400))
  process.exit(1)
}

console.log(JSON.stringify(body, null, 2))