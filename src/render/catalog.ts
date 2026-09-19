import { defineCatalog } from '@json-render/core'
import { schema } from '@json-render/react/schema'
import { z } from 'zod'

/**
 * Catálogo json-render do fluxo-caixa.
 *
 * Os nomes de componentes/ações BATEM com os declarados na skill
 * `json-render-jev` (verify-spec.mjs) — ou seja, specs aprovados pela
 * verificação com Jev renderizam aqui sem adaptação.
 */
export const catalog = defineCatalog(schema, {
  components: {
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(['primary', 'secondary', 'ghost', 'outline']).nullable().optional(),
      }),
      description: 'Botão clicável',
    },
    Card: {
      props: z.object({
        title: z.string(),
        description: z.string().nullable().optional(),
        maxWidth: z.enum(['sm', 'md', 'lg']).nullable().optional(),
      }),
      description: 'Cartão com título e conteúdo',
    },
    Stack: {
      props: z.object({
        direction: z.enum(['vertical', 'horizontal']),
        gap: z.enum(['none', 'sm', 'md', 'lg']).nullable().optional(),
        align: z.string().nullable().optional(),
        justify: z.string().nullable().optional(),
      }),
      description: 'Contêiner de layout empilhado',
    },
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(['h1', 'h2', 'h3']).optional(),
      }),
      description: 'Título',
    },
    Text: {
      props: z.object({
        text: z.string(),
        variant: z.enum(['default', 'muted', 'strong']).nullable().optional(),
      }),
      description: 'Parágrafo',
    },
    Badge: {
      props: z.object({
        text: z.string(),
        variant: z.enum(['default', 'secondary', 'outline']).nullable().optional(),
      }),
      description: 'Etiqueta de status',
    },
    Separator: {
      props: z.object({
        orientation: z.enum(['horizontal', 'vertical']).nullable().optional(),
      }),
      description: 'Divisor',
    },
    Progress: {
      props: z.object({
        value: z.number(),
        max: z.number(),
        label: z.string().optional(),
      }),
      description: 'Barra de progresso com rótulo',
    },
    Input: {
      props: z.object({
        label: z.string(),
        name: z.string(),
        type: z.enum(['text', 'email', 'number', 'password']).optional(),
        placeholder: z.string().nullable().optional(),
      }),
      description: 'Campo de texto',
    },
    Select: {
      props: z.object({
        label: z.string(),
        name: z.string(),
        options: z.array(z.string()),
      }),
      description: 'Seletor de opções',
    },
  },
  actions: {
    export_report: { description: 'Exporta o relatório' },
    refresh_data: { description: 'Recarrega os dados' },
  },
})

export type AppCatalog = typeof catalog