# Testes do banco

Os arquivos desta pasta validam o schema, as policies de RLS e a lógica de
negócio diretamente no Postgres, sem depender do front-end.

## Por que existe um "stub"

As migrations referenciam `auth.users`, `auth.uid()` e os papéis `anon` /
`authenticated` — objetos que o Supabase fornece prontos. Num Postgres comum
eles não existem, então `00_supabase_stub.sql` recria o mínimo necessário
para que as migrations possam ser aplicadas e testadas fora do Supabase.

**O stub não faz parte do produto.** Nunca o aplique num projeto Supabase.

## Como rodar

Com um Postgres acessível (Docker, local ou remoto):

```bash
export PGHOST=localhost PGPORT=5432 PGUSER=postgres

createdb fc_test
psql -d fc_test -f 00_supabase_stub.sql
psql -d fc_test -f ../migrations/20260101000000_core_schema.sql
psql -d fc_test -f ../migrations/20260101000001_rls_and_analytics.sql
psql -d fc_test -f ../migrations/20260101000002_fix_service_role.sql
psql -d fc_test -f 01_schema_test.sql
psql -d fc_test -f 02_service_role_test.sql
```

O script usa `ON_ERROR_STOP` e cada bloco levanta exceção quando uma asserção
falha, então o `psql` sai com código diferente de zero. A última linha
impressa é `TODOS OS TESTES ... PASSARAM`.

## O que é verificado

### `01_schema_test.sql`

| Bloco | Garantia |
| --- | --- |
| Criação de empresa | Trigger registra a autora como `owner` |
| Plano de contas padrão | As 30+ contas da planilha são semeadas automaticamente |
| RLS | Um usuário externo não enxerga empresa, lançamento ou conta alheia |
| Derivação de tipo | Gravar uma despesa como "entrada" é corrigido pelo trigger |
| Liquidação | Lançamento pago recebe data; `em_aberto` tem a data limpa |
| Transferências | Geram exatamente 2 lançamentos e ficam fora do fluxo |
| Transferência inválida | Origem igual a destino é rejeitada |
| Saldo realizado | Lançamento em aberto **não** altera o saldo; ao quitar, altera |
| Dashboard | `dashboard_summary` devolve totais e série só com o realizado |
| Integridade | Valor negativo, CNPJ duplicado e auto-parentesco são barrados |
| Dados de demonstração | `seed_demo_data` popula a empresa corretamente |

### `02_service_role_test.sql`

Cobre a correção do reconhecimento de `service_role`:

| Bloco | Garantia |
| --- | --- |
| Membro | Quem tem vínculo pode editar a própria empresa |
| Não-membro | Continua **bloqueado** — a correção não afrouxou o RLS |
| `service_role` | É reconhecido como confiável, mesmo sem vínculo |
| RPCs | `create_transfer` e `seed_demo_data` funcionam com a chave de serviço |
