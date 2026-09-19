/**
 * ETAPA B — prepara excertos de código por tela (estrutura, não dados) e
 * grava o state JSON para o helper jev-audit.
 *
 * Excerto = props/tipos de entrada, handlers principais, blocos de render com
 * classes do design system, e descrição do fluxo. Objetivo: manter o pedido
 * "código, fixtures e descrições — nunca dados reais de negócio".
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const PAGES = [
  { file: 'src/pages/DashboardPage.tsx', nome: 'Visão Geral', fluxo: 'painel com KPIs, gráficos, alertas e lançamentos recentes' },
  { file: 'src/pages/EntriesPage.tsx', nome: 'Lançamentos', fluxo: 'CRUD de lançamentos com filtros, busca e paginação' },
  { file: 'src/pages/ReportsPage.tsx', nome: 'Relatórios', fluxo: 'DRE, fluxo por trimestre, projeção e detalhamento mensal' },
  { file: 'src/pages/ReconciliationPage.tsx', nome: 'Conciliação', fluxo: 'conciliação bancária com ações conciliar/marcar pago' },
  { file: 'src/pages/GoalsPage.tsx', nome: 'Metas', fluxo: 'metas mensais, progresso e histórico' },
  { file: 'src/pages/TeamPage.tsx', nome: 'Equipe', fluxo: 'gestão de membros por empresa' },
  { file: 'src/pages/UsersPage.tsx', nome: 'Usuários', fluxo: 'gestão de usuários e permissões (admin global)' },
  { file: 'src/pages/OrganizationsPage.tsx', nome: 'Empresas', fluxo: 'cadastro e listagem de empresas' },
]

mkdirSync('.audit', { recursive: true })

function excerpt(raw, maxLines = 140) {
  const lines = raw.split('\n')
  // Pega do topo até o limite, removendo linhas de import para reduzir ruído.
  let body = lines.filter((l) => !l.startsWith('import ')).slice(0, maxLines)
  return body.join('\n')
}

for (const page of PAGES) {
  const raw = readFileSync(page.file, 'utf8')
  const code = excerpt(raw)
  const entry = {
    state: {
      componente: `Page:${page.nome}`,
      fluxo: page.fluxo,
      design_system: 'PageHeader/PageBody; Button (primary/secondary/ghost/danger); Modal; Field/Input/Select/CurrencyInput; Badge; Card; StatCard/StatGrid; cores ink-* e brand-* (Tailwind v4), tokens bem/var(--color-negative-soft).',
      codigo_excerto: code,
    },
    model: 'jev-latest',
    questions: {
      consistency: {
        type: 'score',
        instructions: 'O componente segue o design system do app (PageHeader/PageBody, Button, Modal, Badge, Card, cores ink/brand, numeros tabulares) ou usa classes/tokens fora do tema?',
        criteria: ['Fora do tema; classes/tokens nao pertencem ao design system', 'Desvios pontuais menores nao sistematicos', 'Segue o design system de forma consistente'],
      },
      clarity: {
        type: 'score',
        instructions: 'A UX da tela e clara e completa para o fluxo (estados de carregando, vazio, erro, acoes claras, sem caminho sem saida)?',
        criteria: ['Confusa ou incompleta; faltam estados/acoes', 'Razoavel, com lacunas menores', 'Clara e completa para o fluxo'],
      },
      sensitive: {
        type: 'noul',
        instructions: 'A tela expoe dados sensiveis em locais indevidos (valores financeiros sem contexto, dados fiscais, credenciais, acoes destrutivas sem confirmacao)?',
        criteria: { true: 'Expoe dado sensivel ou acao destrutiva sem protecao', false: 'Nao expoe dado sensivel indevidamente' },
      },
      dead_end: {
        type: 'noul',
        instructions: 'Existe caminho de navegacao ou estado que nao leva a lugar nenhum (ex.: botao que faz nada, acao que falha em silencio, estado vazio sem saida)?',
        criteria: { true: 'Ha caminho morto identificavel', false: 'Nao ha caminho morto visivel' },
      },
    },
  }
  writeFileSync(`.audit/${page.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`, JSON.stringify(entry, null, 2), 'utf8')
}

console.log('excertos gravados em .audit/')
for (const page of PAGES) console.log('  -', page.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json')