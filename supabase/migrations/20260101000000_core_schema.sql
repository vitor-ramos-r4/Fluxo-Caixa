-- =============================================================================
-- Fluxo de Caixa — 0001 · Estrutura base
-- =============================================================================
-- Modelo multi-empresa (multi-tenant) com isolamento por Row Level Security.
-- Cada usuário pertence a uma ou mais organizações; toda linha de negócio
-- carrega `org_id` e as policies garantem que ninguém enxerga dados de fora.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- Natureza do lançamento. Substitui a coluna "Coluna1" (E/S) da planilha.
create type public.entry_kind as enum ('entrada', 'saida');

-- Situação de liquidação. Substitui a coluna booleana "Pago".
create type public.entry_status as enum ('pago', 'em_aberto');

-- Tipo de conta do plano de contas.
create type public.account_kind as enum ('receita', 'despesa', 'transferencia');

-- Natureza jurídica do parceiro comercial.
create type public.party_kind as enum ('cliente', 'fornecedor', 'ambos');

-- Tipos de conta bancária / caixa.
create type public.wallet_kind as enum ('corrente', 'poupanca', 'caixa', 'investimento', 'cartao');

-- Período de apuração das metas.
create type public.goal_period as enum ('mensal', 'trimestral', 'anual');

-- -----------------------------------------------------------------------------
-- Função utilitária: updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- organizations — a "empresa" da planilha. Agrupa todos os dados.
-- -----------------------------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null check (length(trim(name)) between 1 and 160),
  legal_name    text,
  -- Guardamos o documento só com dígitos para permitir validação e busca.
  document      text        check (document is null or document ~ '^[0-9]{11,14}$'),
  segment       text,
  -- Saldo de abertura do caixa, tal como "Saldo Inicial Caixa" na planilha.
  opening_balance numeric(16,2) not null default 0,
  -- Mês/ano em que o acompanhamento começa (a planilha tinha "Selecione o mês/ano").
  starts_on     date        not null default date_trunc('year', current_date)::date,
  accent        text        not null default 'emerald',
  is_archived   boolean     not null default false,
  created_by    uuid        not null references auth.users (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table  public.organizations is 'Empresa/CNPJ. Raiz do isolamento multi-tenant.';
comment on column public.organizations.opening_balance is 'Saldo de caixa antes do primeiro lançamento registrado.';
comment on column public.organizations.document is 'CNPJ (14) ou CPF (11), apenas dígitos.';

create unique index organizations_document_key
  on public.organizations (document)
  where document is not null;

-- -----------------------------------------------------------------------------
-- memberships — quem acessa qual empresa e com qual papel
-- -----------------------------------------------------------------------------
create table public.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index memberships_user_idx on public.memberships (user_id);

comment on table public.memberships is 'Vínculo usuário↔empresa. Base de todas as policies de RLS.';

-- -----------------------------------------------------------------------------
-- Helper: as policies precisam checar participação sem recursão infinita.
-- `security definer` faz a função rodar fora do RLS da própria tabela.
--
-- `service_role` é reconhecido como confiável: é a chave usada apenas no
-- servidor (scripts administrativos e rotinas de manutenção) e que, por
-- definição, ignora o RLS. Sem essa cláusula, qualquer RPC que valide
-- permissão falharia para ela — a chave de serviço não tem `membership`.
--
-- Para os demais papéis nada muda: continua valendo o vínculo em
-- `memberships`.
-- -----------------------------------------------------------------------------
create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or (auth.jwt() ->> 'role') = 'service_role',
    false
  );
$$;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_service_role() or exists (
    select 1
    from public.memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_org(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_service_role() or exists (
    select 1
    from public.memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'member')
  );
$$;

create or replace function public.org_role(target_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.memberships m
  where m.org_id = target_org and m.user_id = auth.uid()
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- chart_of_accounts — o "Plano de Contas" (Cadastros!B11:C27)
-- A planilha tinha 15 receitas e 15 despesas fixas; aqui é livre e hierárquico.
-- -----------------------------------------------------------------------------
create table public.chart_of_accounts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  parent_id   uuid references public.chart_of_accounts (id) on delete set null,
  name        text not null check (length(trim(name)) between 1 and 120),
  kind        public.account_kind not null,
  -- Código opcional para relatórios (ex.: 1.01.02).
  code        text,
  color       text,
  -- Ordem de exibição; a planilha dependia da posição da linha.
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Uma conta não pode ser pai de si mesma.
  constraint chart_of_accounts_no_self_parent check (parent_id is null or parent_id <> id)
);

create unique index chart_of_accounts_org_name_key
  on public.chart_of_accounts (org_id, lower(name));
create index chart_of_accounts_org_kind_idx
  on public.chart_of_accounts (org_id, kind, sort_order);

-- -----------------------------------------------------------------------------
-- wallets — contas bancárias, caixa e cartões
-- -----------------------------------------------------------------------------
create table public.wallets (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 120),
  kind           public.wallet_kind not null default 'corrente',
  bank_name      text,
  bank_code      text,
  branch         text,
  account_number text,
  opening_balance numeric(16,2) not null default 0,
  -- Cor de destaque na UI.
  color          text not null default 'slate',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index wallets_org_idx on public.wallets (org_id) where is_active;

-- -----------------------------------------------------------------------------
-- parties — clientes e fornecedores (unificados, como o HTML já sugeria)
-- -----------------------------------------------------------------------------
create table public.parties (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 160),
  kind       public.party_kind not null default 'cliente',
  document   text check (document is null or document ~ '^[0-9]{11,14}$'),
  email      citext,
  phone      text,
  notes      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index parties_org_idx on public.parties (org_id, kind) where is_active;
create unique index parties_org_document_key
  on public.parties (org_id, document)
  where document is not null;

-- -----------------------------------------------------------------------------
-- entries — os lançamentos (a tabela "Lançamentos"/Tabela1 da planilha)
-- -----------------------------------------------------------------------------
create table public.entries (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  account_id    uuid not null references public.chart_of_accounts (id) on delete restrict,
  wallet_id     uuid references public.wallets (id) on delete set null,
  party_id      uuid references public.parties (id) on delete set null,
  kind          public.entry_kind   not null,
  status        public.entry_status not null default 'pago',
  description   text not null check (length(trim(description)) between 1 and 240),
  -- Valor sempre positivo; o sinal vem de `kind`. Evita a ambiguidade da planilha,
  -- que usava uma coluna auxiliar "Valor_analise" para aplicar o filtro de status.
  amount        numeric(16,2) not null check (amount > 0),
  issued_on     date not null default current_date,
  settled_on    date,
  -- Documento de origem (NF, boleto, comprovante).
  reference     text,
  notes         text,
  -- Marca lançamentos criados por transferência entre contas, para não
  -- contarem como receita/despesa nos relatórios.
  is_transfer   boolean not null default false,
  transfer_group uuid,
  reconciled_at timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Coerência de datas: liquidação não pode ser anterior à emissão.
  constraint entries_settled_after_issued
    check (settled_on is null or settled_on >= issued_on),
  -- Status e data de liquidação andam juntos.
  constraint entries_settled_matches_status
    check ((status = 'pago' and settled_on is not null)
        or (status = 'em_aberto' and settled_on is null))
);

create index entries_org_date_idx    on public.entries (org_id, issued_on desc);
create index entries_org_kind_idx    on public.entries (org_id, kind, issued_on desc);
create index entries_org_status_idx  on public.entries (org_id, status) where status = 'em_aberto';
create index entries_account_idx     on public.entries (account_id);
create index entries_wallet_idx      on public.entries (wallet_id);
create index entries_party_idx       on public.entries (party_id) where party_id is not null;
create index entries_transfer_idx    on public.entries (transfer_group) where transfer_group is not null;
-- Fila de conciliação: só interessa o que ainda não foi conciliado.
create index entries_pending_reconciliation_idx
  on public.entries (org_id, issued_on desc)
  where reconciled_at is null and is_transfer = false;

-- -----------------------------------------------------------------------------
-- Triggers de updated_at
-- -----------------------------------------------------------------------------
create trigger organizations_touch     before update on public.organizations     for each row execute function public.touch_updated_at();
create trigger chart_of_accounts_touch before update on public.chart_of_accounts for each row execute function public.touch_updated_at();
create trigger wallets_touch           before update on public.wallets           for each row execute function public.touch_updated_at();
create trigger parties_touch           before update on public.parties           for each row execute function public.touch_updated_at();
create trigger entries_touch           before update on public.entries           for each row execute function public.touch_updated_at();
