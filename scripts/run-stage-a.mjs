/**
 * ETAPA A — roda o pipeline verify-spec (shim) para os 6 fluxos e consolida
 * fluxo | matches | sensitive | quality | decisão | motivos.
 *
 * Uso: node scripts/run-stage-a.mjs
 * Saída: JSON em stdout, com o spec aprovado (RENDER) quando houver.
 */
import { spawnSync } from 'node:child_process'

const FLOWS = [
  {
    id: 'dashboard',
    nome: 'Visão Geral',
    pedido: 'Fluxo Visão Geral do fluxo de caixa: card de resumo com saldo disponivel, grade com 4 KPIs (entradas, saidas, resultado, saldo), grafico de barras entradas vs saidas por mes, alertas e lista dos ultimos lancamentos com status pago/em aberto. Layout em coluna com cabecalho e botao "Novo lançamento".',
  },
  {
    id: 'lancamentos',
    nome: 'Lançamentos',
    pedido: 'Fluxo Lançamentos: filtros por periodo, tipo (entrada/saida) e situacao (pago/em aberto), campo de busca, tabela de lancamentos com data, descricao, plano de conta, situacao, valor; botoes para novo lancamento, editar e excluir. Layout com cabecalho e paginacao.',
  },
  {
    id: 'relatorios',
    nome: 'Relatórios',
    pedido: 'Fluxo Relatórios: DRE gerencial com receitas e despesas, fluxo por trimestre em grafico, projecao de entradas e detalhamento mensal com saldo acumulado. Layout em coluna com seletor de periodo e botao exportar.',
  },
  {
    id: 'conciliacao',
    nome: 'Conciliação',
    pedido: 'Fluxo Conciliação bancária: filtros de periodo e conta, lista de lancamentos pendentes com botoes "Conciliar" e "Marcar como pago", indicadores de total pendente, e alternancia entre pendentes e conciliados. Layout em coluna.',
  },
  {
    id: 'metas',
    nome: 'Metas',
    pedido: 'Fluxo Metas e orcamento: grade de indicadores (meta de entradas, teto de despesas, entradas no mes, despesas no mes), progresso de cada meta com barra de progresso, historico mensal e formulario para nova meta. Layout em coluna.',
  },
  {
    id: 'equipe',
    nome: 'Equipe',
    pedido: 'Fluxo Equipe: lista de membros com nome, email, papel e desde quando; seletor para trocar papel; botao adicionar membro (modal com email e papel); explicação dos papeis. Layout em coluna.',
  },
]

const results = []
for (const flow of FLOWS) {
  const r = spawnSync(process.execPath, ['scripts/verify-spec-shim.mjs', flow.pedido, '--json'], {
    encoding: 'utf8',
    timeout: 400000,
  })
  if (r.status !== 0) {
    results.push({ id: flow.id, nome: flow.nome, erro: (r.stderr ?? r.stdout).slice(0, 300) })
    continue
  }
  try {
    const parsed = JSON.parse(r.stdout)
    results.push({ id: flow.id, nome: flow.nome, ...parsed, pedido: flow.pedido })
  } catch {
    results.push({ id: flow.id, nome: flow.nome, erro: 'saida nao-JSON' })
  }
}

console.log(JSON.stringify(results, null, 2))