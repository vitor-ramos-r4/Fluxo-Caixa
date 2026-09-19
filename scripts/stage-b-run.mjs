/**
 * ETAPA B — roda as perguntas Jev para cada excerto de tela e consolida.
 * Mesma política de retry + validação de corpo vazio do shim.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

function vaultKey() {
  const raw = readFileSync(process.env.USERPROFILE + '/.dsh/.credentials.yaml', 'utf8')
  const m = raw.match(/^\s*TYPESAFE_API_KEY:\s*["']?([^"'\r\n]+)/m)
  if (!m) throw new Error('TYPESAFE_API_KEY ausente')
  return m[1].trim()
}

async function fetchWithRetryBody(url, init, attempts = 5) {
  let last
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(url, init)
      const text = await r.text().catch(() => '')
      if (r.ok && text.trim().length > 0) return { ok: true, status: r.status, text }
      if (r.ok && text.trim().length === 0) { last = new Error('corpo vazio com HTTP 200'); if (i < attempts) { await new Promise(r2 => setTimeout(r2, 1500 * i)); continue } }
      return { ok: false, status: r.status, text }
    } catch (e) {
      last = e
      if (i === attempts) break
      await new Promise((r2) => setTimeout(r2, 1500 * i))
    }
  }
  throw last ?? new Error('fetch falhou')
}

const key = vaultKey()
const files = readdirSync('.audit').filter((f) => f.endsWith('.json') && f !== 'results.json')
const results = {}

const jobs = files.map(async (file) => {
  const payload = JSON.parse(readFileSync(`.audit/${file}`, 'utf8'))
  const id = payload.state.componente
  const { ok, status, text } = await fetchWithRetryBody('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({ state: payload.state, model: payload.model, questions: payload.questions }),
    signal: AbortSignal.timeout(120000),
  })
  if (!ok) throw new Error(`${id}: HTTP ${status} ${text.slice(0, 200)}`)
  const body = JSON.parse(text)
  return { id, answers: body.answers, usage: body.usage }
})

const settled = await Promise.allSettled(jobs)
for (const s of settled) {
  if (s.status === 'fulfilled') {
    results[s.value.id] = { answers: s.value.answers, usage: s.value.usage }
  } else {
    if (!Array.isArray(results['ERROS'])) results['ERROS'] = []
    results['ERROS'].push(s.reason?.message ?? String(s.reason))
  }
}

writeFileSync('.audit/results.json', JSON.stringify(results, null, 2), 'utf8')
console.log(JSON.stringify(results, null, 2))