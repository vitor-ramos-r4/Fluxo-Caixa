/**
 * Diagnóstico do sensitive alto nos specs de UI.
 * Pergunta tipada ao Jev: a causa é a presença de ações destrutivas no
 * conteúdo, ou a falta de um componente de confirmação no catálogo?
 */
import { readFileSync } from 'node:fs'

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
      if (r.ok && text.trim().length === 0) {
        last = new Error('corpo vazio com HTTP 200')
        if (i < attempts) { await new Promise((r2) => setTimeout(r2, 1500 * i)); continue }
      }
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

const state = {
  catálogo_atual: [
    'Button (label, variant primary/secondary/outline/ghost)',
    'Card (title, description, maxWidth)',
    'Stack (direction, gap, align, justify)',
    'Heading (text, level)',
    'Text (text, variant)',
    'Badge (text, variant)',
    'Separator (orientation)',
    'Progress (value, max, label)',
    'Input (label, name, type, placeholder)',
    'Select (label, name, options)',
  ],
  ações_destrutivas_comuns: [
    'excluir lançamento',
    'remover membro da equipe',
    'marcar como pago (liquidação de lançamento)',
    'revogar acesso',
  ],
  observação: 'Specs que contêm ações destrutivas exibem sensitive alto (equipe 0.30, conciliação 0.24, metas 0.16) mesmo quando o spec descreve texto de confirmação.',
}

const { ok, status, text } = await fetchWithRetryBody('https://api.typesafe.ai/v1/systemone', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
  body: JSON.stringify({
    state,
    model: 'jev-latest',
    questions: {
      causa_principal: {
        type: 'choice',
        instructions: 'Qual é a causa principal do sensitive alto nos specs de UI que contêm ações destrutivas (excluir, remover, marcar como pago)?',
        criteria: {
          'falta_componente_confirmacao': 'O catálogo não tem um componente de diálogo/confirmação dedicado, então a confirmação é só um texto dentro de Stack, e o Jev não a reconhece como proteção real',
          'acao_no_conteudo': 'A mera presença de ações destrutivas no conteúdo já sensibiliza o Jev, independente do componente usado para confirmar',
          'ambos': 'As duas causas contribuem de forma significativa',
        },
      },
      adicionar_dialog_ajuda: {
        type: 'noul',
        instructions: 'Adicionar um componente de confirmação dedicado ao catálogo (ex.: Dialog com título, descrição e botões Confirmar/Cancelar) reduziria o sensitive dos specs com ações destrutivas?',
        criteria: {
          true: 'Reduziria: o Jev reconheceria a confirmação como proteção explícita',
          false: 'Não mudaria: o sensitive vem da presença da ação em si',
        },
      },
    },
  }),
  signal: AbortSignal.timeout(120000),
})

if (!ok) { console.error('HTTP ' + status + ': ' + text.slice(0, 400)); process.exit(1) }
console.log(text)