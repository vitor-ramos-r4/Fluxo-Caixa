# Fluxo de Caixa

Sistema web de gestão de fluxo de caixa multiempresa: lançamentos, contas
bancárias, conciliação, DRE e projeções, com os dados armazenados no Supabase.

Esta versão substitui o protótipo HTML de arquivo único e a planilha Excel
`Nova-Planilha-Fluxo-de-Caixa.xlsx`. O layout da planilha original foi
preservado como referência: as 15 contas de entrada e 15 de saída viram o plano
de contas padrão, e a importação continua aceitando o arquivo `.xlsx` no mesmo
formato.

## Stack

| Camada | Escolha |
| --- | --- |
| UI | React 19 + TypeScript + Vite |
| Estilo | Tailwind CSS v4 (tema em `src/index.css`) |
| Dados | Supabase (Postgres + Auth + RLS) |
| Estado servidor | TanStack Query |
| Formulários | React Hook Form + Zod |
| Gráficos | Recharts |
| Planilhas | ExcelJS |

## Como rodar

```bash
npm install
cp .env.example .env.local   # preencha as credenciais do Supabase
npm run dev
```

A aplicação sobe em `http://localhost:5173`. Sem as variáveis de ambiente
preenchidas, a tela de configuração inicial explica o que falta — não há tela
em branco.

### 1. Criar o projeto no Supabase

Em [supabase.com/dashboard](https://supabase.com/dashboard), crie um projeto e
copie a **Project URL** e a chave **anon public** (Project Settings → API) para
o `.env.local`:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> A chave `anon` é pública por design. Todo o controle de acesso é feito por
> Row Level Security no banco — nenhuma tabela fica exposta sem policy.

### 2. Aplicar as migrations

No **SQL Editor**, execute os arquivos na ordem:

1. `supabase/migrations/20260101000000_core_schema.sql`
2. `supabase/migrations/20260101000001_rls_and_analytics.sql`

Ou, com a CLI do Supabase instalada:

```bash
supabase link --project-ref <seu-ref>
supabase db push
```

### 3. Criar a primeira conta

Abra a aplicação, clique em **Criar conta** e cadastre-se. Depois de confirmar
o e-mail, cadastre uma empresa — o plano de contas padrão (com as 30 contas da
planilha original) é criado automaticamente.

### 4. (Opcional) Popular com dados de demonstração

Para ter o sistema cheio sem digitar nada:

```bash
npm run seed
```

Isso cria cinco empresas fictícias de segmentos diferentes (varejo, tecnologia,
construção civil, saúde e marketing digital), cada uma com plano de contas
próprio, contas bancárias, clientes e fornecedores e cerca de 220 lançamentos
ao longo de 18 meses.

O script precisa da chave `service_role` (Project Settings → API), que ignora o
RLS. Coloque em `.env.local`:

```env
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

Ela é usada **apenas** por esse script — nunca no código do aplicativo, e o
`.env.local` está no `.gitignore`.

Por padrão o script atribui as empresas ao seu usuário. Para usar outro e-mail:

```bash
npm run seed -- outro@email.com
```

Rodar de novo recria as empresas do zero (identificadas pelo CNPJ), então é
seguro repetir.

## Scripts

```bash
npm run dev        # servidor de desenvolvimento
npm run build      # build de produção (roda o typecheck antes)
npm run typecheck  # apenas a verificação de tipos
npm run lint       # oxlint
npm run seed       # popula o banco com dados de demonstração
npm run preview    # serve o build local
```

## Estrutura

```
src/
  components/
    layout/      AppShell (sidebar, seletor de empresa), Page, SetupNotice
    ui/          Button, Modal, Field, Feedback (badges, cards, estados)
  contexts/      AuthContext (sessão), OrgContext (empresa ativa)
  hooks/         useCatalog (queries/mutations dos cadastros)
  lib/
    analytics.ts KPIs, séries mensais, DRE, projeções, alertas
    format.ts    formatação pt-BR e utilitários de data
    supabase.ts  cliente e tradução de erros
    types.ts     tipos de domínio
  pages/         uma por rota
  services/
    api.ts       acesso a dados (tabelas, views e RPCs)
    excel.ts     importação e exportação .xlsx
supabase/migrations/  schema, RLS, views e RPCs
```

## Modelo de dados

Todas as tabelas de negócio carregam `org_id` e são protegidas por policy. Um
usuário vê apenas as empresas em que tem vínculo (`memberships`).

- **`organizations`** — a empresa/CNPJ. Guarda o saldo de abertura do caixa.
- **`memberships`** — vínculo usuário↔empresa com papel (`owner`, `admin`,
  `member`, `viewer`).
- **`chart_of_accounts`** — o plano de contas, com natureza receita/despesa.
- **`wallets`** — contas bancárias, caixas e cartões.
- **`parties`** — clientes e fornecedores.
- **`entries`** — os lançamentos.

### Views analíticas

Substituem as fórmulas `SUMIFS`/`XLOOKUP` da aba "Análise" da planilha:

| View | Equivale a |
| --- | --- |
| `monthly_cashflow` | Linhas Entradas / Saídas / Saldo Operacional / Acumulado |
| `monthly_by_account` | Matriz de plano de conta × mês |
| `wallet_balances` | Saldo realizado e pendente por conta |
| `org_overview` | Cartões de KPI da visão geral |
| `party_totals` | Total movimentado por cliente/fornecedor |

Todas usam `security_invoker`, respeitando o RLS de quem consulta.

### Funções

- `create_transfer(...)` — cria o par saída/entrada de uma transferência
  atomicamente, devolvendo o `transfer_group`.
- `dashboard_summary(...)` — KPIs, série e composição numa única chamada.
- `seed_demo_data(...)` — popula lançamentos de demonstração.
- `seed_default_accounts(...)` — cria o plano de contas padrão.

## Decisões que valem registrar

**O sinal do valor vem do tipo, não do número.** Na planilha, entradas e saídas
eram positivas e uma coluna auxiliar (`Valor_analise`) aplicava o filtro de
status. Aqui `amount` é sempre positivo e `kind` (`entrada`/`saida`) define a
direção, com um trigger sincronizando `kind` a partir da conta escolhida — é
impossível gravar uma despesa como entrada.

**Transferências não distorcem o resultado.** Uma transferência entre contas
próprias gera dois lançamentos marcados com `is_transfer`, excluídos de DRE,
projeções e indicadores. Sem isso, mover dinheiro de uma conta para outra
apareceria como receita.

**Contas com histórico são desativadas, não excluídas.** Lançamentos apontam
para o plano de contas por chave estrangeira; apagar a conta quebraria o
histórico. A exclusão só remove de fato quando não há lançamentos vinculados.

**Datas são tratadas como locais.** `new Date('2026-01-05')` é interpretado como
UTC e pode recuar um dia no fuso brasileiro. Toda conversão passa por
`parseDateOnly`/`toDateOnly`.

**Metas ficam no navegador.** São preferências de acompanhamento, não dados
contábeis — não precisam sincronizar entre dispositivos para o recurso ser útil.

## Testes do banco

O schema, as policies de RLS e a lógica de caixa têm testes executáveis contra
um Postgres comum — veja [`supabase/tests/README.md`](supabase/tests/README.md).
Cobrem, entre outras coisas, que um lançamento **em aberto não altera o saldo**
e que ao quitá-lo o saldo muda, que transferências não contam como receita e
que um usuário não enxerga dados de empresa alheia.

## Deploy

O build é estático (`dist/`), então funciona em qualquer host de SPA. Na
Vercel, configure as duas variáveis `VITE_SUPABASE_*` no projeto e adicione um
rewrite de todas as rotas para `index.html` — o roteamento é client-side.

## Segurança

- Row Level Security habilitado em todas as tabelas de negócio.
- As policies consultam `memberships` via funções `security definer`, evitando
  recursão nas próprias policies.
- Ao criar uma empresa, um trigger registra o autor como `owner` — sem isso a
  empresa nasceria invisível.
- `.env.local` está no `.gitignore`. A chave `service_role` nunca é usada no
  cliente.
