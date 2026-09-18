/**
 * Aplica um arquivo de migration no Supabase pela Management API.
 *
 * A chave `service_role` só alcança dados, via REST — não cria tabelas,
 * funções ou policies. Para DDL é preciso a Management API, que usa um
 * Personal Access Token (`sbp_...`).
 *
 *   npm run db:apply -- supabase/migrations/arquivo.sql
 *   npm run db:apply -- --all        (aplica todas, em ordem)
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i === -1) continue
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
    }
  } catch {
    // Sem .env.local: usa o ambiente do sistema.
  }
  return env
}

const env = loadEnv()

const token = env.SUPABASE_Access_Tokens ?? env.SUPABASE_ACCESS_TOKEN
const projectUrl = env.VITE_SUPABASE_URL ?? ''

// O ref do projeto é o subdomínio da URL: https://<ref>.supabase.co
const projectRef = projectUrl.replace(/^https?:\/\//, '').split('.')[0]

if (!token || !projectRef) {
  console.error(
    '\n  Faltam credenciais.\n' +
      '    SUPABASE_Access_Tokens=sbp_...   (dashboard > Account > Access Tokens)\n' +
      '    VITE_SUPABASE_URL=https://<ref>.supabase.co\n',
  )
  process.exit(1)
}

/** Executa SQL no projeto e devolve o resultado da API. */
async function runSql(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  )

  const text = await response.text()

  if (!response.ok) {
    let detail = text
    try {
      const parsed = JSON.parse(text)
      detail = parsed.message ?? parsed.error ?? text
    } catch {
      // A resposta não era JSON; usamos o texto cru.
    }
    throw new Error(`HTTP ${response.status}: ${detail}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const args = process.argv.slice(2)
const migrationsDir = 'supabase/migrations'

let files
if (args.includes('--all')) {
  files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(migrationsDir, f))
} else {
  files = args.filter((a) => !a.startsWith('--'))
}

if (!files.length) {
  console.error(
    '\n  uso: npm run db:apply -- <arquivo.sql> [outro.sql]\n' +
      '       npm run db:apply -- --all\n',
  )
  process.exit(1)
}

console.log(`\n  Projeto: ${projectRef}`)
console.log(`  Arquivos: ${files.length}\n`)

let applied = 0
for (const file of files) {
  const sql = readFileSync(file, 'utf8')
  const name = file.split(/[\\/]/).pop()

  process.stdout.write(`  ${name} … `)
  try {
    await runSql(sql)
    console.log('aplicado')
    applied += 1
  } catch (error) {
    console.log('FALHOU')
    console.error(`\n  ${error.message}\n`)
    process.exit(1)
  }
}

console.log(`\n  ${applied} arquivo(s) aplicado(s) com sucesso.\n`)
