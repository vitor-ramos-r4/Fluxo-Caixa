/**
 * Promove um usuário a administrador global da plataforma.
 *
 * A primeira concessão não pode vir do aplicativo: exigiria que já existisse
 * um super_admin para autorizá-la. Por isso é feita aqui, com a chave de
 * serviço, que ignora o RLS.
 *
 *   npm run grant-admin -- vitor.vital@gmail.com
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

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
    // Sem .env.local: confiamos nas variáveis do sistema.
  }
  return env
}

const env = loadEnv()
const url = env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error(
    '\n  Faltam VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.\n',
  )
  process.exit(1)
}

const email = process.argv[2]
if (!email) {
  console.error('\n  uso: npm run grant-admin -- email@dominio.com\n')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

const { data: usersData, error: listError } = await db.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
})
if (listError) {
  console.error('  Erro ao listar usuários:', listError.message)
  process.exit(1)
}

const user = usersData.users.find(
  (u) => u.email?.toLowerCase() === email.toLowerCase(),
)

if (!user) {
  console.error(`\n  Nenhuma conta com o e-mail ${email}.`)
  console.error('  A pessoa precisa se cadastrar antes de virar administradora.\n')
  process.exit(1)
}

const { error } = await db
  .from('platform_admins')
  .upsert({ user_id: user.id, note: 'concedido via script' }, {
    onConflict: 'user_id',
  })

if (error) {
  console.error('  Erro ao conceder:', error.message)
  process.exit(1)
}

console.log(`\n  ${email} agora é administrador global da plataforma.`)
console.log('  Enxerga e administra todas as empresas do sistema.\n')

const { data: admins } = await db
  .from('platform_admins')
  .select('user_id, granted_at')

console.log(`  Administradores globais: ${admins?.length ?? 0}`)
for (const a of admins ?? []) {
  const u = usersData.users.find((x) => x.id === a.user_id)
  console.log(`    · ${u?.email ?? a.user_id}`)
}
console.log('')
