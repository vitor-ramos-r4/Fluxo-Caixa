/**
 * Re-auditoria ETAPA A pós-fix: roda a skill corrigida (verify-spec) para
 * cada fluxo e consolida matches/sensitive/quality/decisao.
 * Uso: node scripts/run-stage-a-fix.mjs
 */
import { spawnSync } from 'node:child_process'

const FLOWS = [
  {
    id: 'dashboard', nome: 'Visão Geral',
    pedido: 'Fluxo Visão Geral do fluxo de caixa: card de resumo com saldo disponivel, grade com 4 KPIs (entradas, saidas, resultado, saldo), grafico de barras entradas vs saidas por mes, alertas e lista dos ultimos lancamentos com status pago/em aberto. Layout em coluna com cabecalho e botao "Novo lançamento".',
  },
  {
    id: 'lancamentos', nome: 'Lançamentos',
    pedido: 'Fluxo Lançamentos: filtros por periodo, tipo (entrada/saida) e situacao (pago/em aberto), campo de busca, tabela de lancamentos com data, descricao, plano de conta, situacao, valor; botoes para novo lancamento, editar lancamento com confirmacao no excluir. Layout com cabecalho e paginacao.',
  },
  {
    id: 'relatorios', nome: 'Relatórios',
    pedido: 'Fluxo Relatórios: DRE gerencial com receitas e despesas, fluxo por trimestre em grafico, projecao de entradas e detalhamento mensal com saldo acumulado. Layout em coluna com seletor de periodo e botao exportar.',
  },
  {
    id: 'conciliacao', nome: 'Conciliação',
    pedido: 'Fluxo Conciliação bancária: filtros de periodo e conta, lista de lancamentos pendentes com botoes "Conciliar" e "Marcar como pago" (este com confirmacao), indicadores de total pendente, e alternancia entre pendentes e conciliados. Layout em coluna.',
  },
  {
    id: 'metas', nome: 'Metas',
    pedido: 'Fluxo Metas e orcamento: grade de indicadores (meta de entradas, teto de despesas, entradas no mes, despesas no mes), progresso de cada meta com barra de progresso, historico mensal e formulario para nova meta com confirmacao ao remover. Layout em coluna.',
  },
  {
    id: 'equipe', nome: 'Equipe',
    pedido: 'Fluxo Equipe: lista de membros com nome, email, papel e desde quando; seletor para trocar papel; botao adicionar membro (modal com email e papel); remover membro com confirmacao; explicação dos papeis. Layout em coluna.',
  },
]

const results = []
for (const flow of FLOWS) {
  const r = spawnSync('npm', ['run', 'verify-spec', '--', flow.pedido], {
    encoding: 'utf8', timeout: 400000, shell: true,
  })
  const out = (r.stdout ?? '') + '\n' + (r.stderr ?? '')
  const m = out.match(/matches=([\d.]+)\s+sensitive=([\d.]+)\s+quality=([\d.]+)/)
  const d = out.match(/DECISÃO:\s*(\w+)/)
  const reasons = out.match(/motivos:\s*([^\n]+)/)
  if (m && d) {
    results.push({
      id: flow.id, nome: flow.nome,
      matches: parseFloat(m[1]), sensitive: parseFloat(m[2]), quality: parseFloat(m[3]),
      verdict: d[1], reasons: reasons?.[1] ?? '',
    })
  } else {
    results.push({ id: flow.id, nome: flow.nome, erro: out.includes('content vazio') ? 'content vazio' : (r.status !== 0 ? `exit ${r.status}` : 'saida sem metricas') })
  }
}

console.log(JSON.stringify(results, null, 2))