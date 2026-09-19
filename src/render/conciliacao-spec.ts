import type { Spec } from '@json-render/core'
import conciliacaoJson from './specs/conciliacao.spec.json'

/**
 * Spec APROVADO pela verificacao com Jev (ETAPA A da auditoria de 2026-09-18):
 * fluxo Conciliacao — verdict RENDER (matches 0.86, sensitive 0.07, quality 3.79).
 *
 * Validacao: todos os componentes estao no catalogo (src/render/catalog.ts) e
 * as acoes (refresh_data/export_report) existem. Renderizado em /ai-render.
 */
export const conciliacaoSpec = conciliacaoJson as unknown as Spec
