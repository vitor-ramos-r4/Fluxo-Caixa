import type { Spec } from '@json-render/core'

/**
 * Spec de exemplo APROVADO pela verificação com Jev (skill json-render-jev).
 * Substitua por qualquer spec que passar na verificação:
 *   node scripts/verify-spec.mjs "seu pedido"
 */
export const exampleSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Stack',
      props: { direction: 'vertical', gap: 'lg', align: 'stretch', justify: null },
      children: ['header', 'summary'],
    },
    header: {
      type: 'Stack',
      props: { direction: 'vertical', gap: 'sm', align: null, justify: null },
      children: ['title', 'subtitle'],
    },
    title: { type: 'Heading', props: { text: 'Fluxo de Caixa', level: 'h1' } },
    subtitle: {
      type: 'Text',
      props: { text: 'Resumo do mês com status e evolução da meta.', variant: 'muted' },
    },
    summary: {
      type: 'Card',
      props: { title: 'Resumo do mês', description: 'Referência: fluxo consolidado das contas.', maxWidth: 'lg' },
      children: ['content'],
    },
    content: {
      type: 'Stack',
      props: { direction: 'vertical', gap: 'md', align: 'stretch', justify: null },
      children: ['badges', 'divider', 'goal', 'divider2', 'actions'],
    },
    badges: {
      type: 'Stack',
      props: { direction: 'horizontal', gap: 'sm', align: 'center', justify: null },
      children: ['b1', 'b2', 'b3'],
    },
    b1: { type: 'Badge', props: { text: 'Caixa: R$ 24.890', variant: 'default' } },
    b2: { type: 'Badge', props: { text: 'A pagar: R$ 6.200', variant: 'secondary' } },
    b3: { type: 'Badge', props: { text: 'A receber: R$ 12.400', variant: 'outline' } },
    divider: { type: 'Separator', props: { orientation: 'horizontal' } },
    goal: { type: 'Progress', props: { value: 75, max: 100, label: 'Meta mensal de economia' } },
    divider2: { type: 'Separator', props: { orientation: 'horizontal' } },
    actions: {
      type: 'Stack',
      props: { direction: 'horizontal', gap: 'sm', align: null, justify: null },
      children: ['exportBtn'],
    },
    exportBtn: {
      type: 'Button',
      props: { label: 'Exportar relatório', variant: 'primary' },
      on: { press: { action: 'export_report' } },
    },
  },
}