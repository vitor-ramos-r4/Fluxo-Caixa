-- =============================================================================
-- Fluxo de Caixa — 0002 · Segurança (RLS), automações e views analíticas
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Habilitar RLS em todas as tabelas de negócio
-- -----------------------------------------------------------------------------
alter table public.organizations      enable row level security;
alter table public.memberships        enable row level security;
alter table public.chart_of_accounts  enable row level security;
alter table public.wallets            enable row level security;
alter table public.parties            enable row level security;
alter table public.entries            enable row level security;

-- -----------------------------------------------------------------------------
-- Privilégios.
--
-- No Supabase, os papéis `anon` e `authenticated` NÃO recebem acesso a tabelas
-- criadas por migration — o padrão é negar. Sem estes grants, toda consulta do
-- app falha com "permission denied" antes mesmo de o RLS ser avaliado.
-- O RLS continua sendo a camada que decide *quais linhas* cada um vê.
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete
  on public.organizations, public.memberships, public.chart_of_accounts,
     public.wallets, public.parties, public.entries
  to authenticated;

-- `anon` não recebe nada: o sistema exige autenticação até para ler.
revoke all on all tables in schema public from anon;

-- -----------------------------------------------------------------------------
-- organizations
--   · membro lê
--   · quem cria vira owner (via trigger abaixo)
--   · owner/admin alteram
-- -----------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (created_by = auth.uid());

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.org_role(id) in ('owner', 'admin'))
  with check (public.org_role(id) in ('owner', 'admin'));

create policy organizations_delete on public.organizations
  for delete to authenticated
  using (public.org_role(id) = 'owner');

-- -----------------------------------------------------------------------------
-- memberships — usuário vê seus vínculos; owner/admin gerenciam a equipe.
-- -----------------------------------------------------------------------------
create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = auth.uid() or public.org_role(org_id) in ('owner', 'admin'));

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (public.org_role(org_id) in ('owner', 'admin'));

create policy memberships_update on public.memberships
  for update to authenticated
  using (public.org_role(org_id) in ('owner', 'admin'))
  with check (public.org_role(org_id) in ('owner', 'admin'));

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (public.org_role(org_id) in ('owner', 'admin'));

-- -----------------------------------------------------------------------------
-- Tabelas de dados: leitura para membros, escrita para quem pode editar.
-- -----------------------------------------------------------------------------
create policy chart_of_accounts_select on public.chart_of_accounts
  for select to authenticated using (public.is_org_member(org_id));
create policy chart_of_accounts_write on public.chart_of_accounts
  for all to authenticated
  using (public.can_edit_org(org_id))
  with check (public.can_edit_org(org_id));

create policy wallets_select on public.wallets
  for select to authenticated using (public.is_org_member(org_id));
create policy wallets_write on public.wallets
  for all to authenticated
  using (public.can_edit_org(org_id))
  with check (public.can_edit_org(org_id));

create policy parties_select on public.parties
  for select to authenticated using (public.is_org_member(org_id));
create policy parties_write on public.parties
  for all to authenticated
  using (public.can_edit_org(org_id))
  with check (public.can_edit_org(org_id));

create policy entries_select on public.entries
  for select to authenticated using (public.is_org_member(org_id));
create policy entries_write on public.entries
  for all to authenticated
  using (public.can_edit_org(org_id))
  with check (public.can_edit_org(org_id));

-- -----------------------------------------------------------------------------
-- Trigger: ao criar uma empresa, o autor entra como owner.
-- Sem isso, a policy de insert deixaria a empresa órfã e invisível.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.memberships (org_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (org_id, user_id) do nothing;
  return new;
end;
$$;

create trigger organizations_add_owner
  after insert on public.organizations
  for each row execute function public.handle_new_organization();

-- -----------------------------------------------------------------------------
-- Trigger: mantém `kind` e `settled_on` coerentes com o plano de conta.
-- Garante que uma despesa nunca seja gravada como entrada, mesmo por API.
-- -----------------------------------------------------------------------------
create or replace function public.sync_entry_from_account()
returns trigger
language plpgsql
as $$
declare
  acct_kind public.account_kind;
begin
  select kind into acct_kind
  from public.chart_of_accounts
  where id = new.account_id;

  -- Garante que a conta pertence à mesma empresa do lançamento.
  if not exists (
    select 1 from public.chart_of_accounts
    where id = new.account_id and org_id = new.org_id
  ) then
    raise exception 'Conta % não pertence à empresa %', new.account_id, new.org_id
      using errcode = 'foreign_key_violation';
  end if;

  if acct_kind = 'receita' then
    new.kind := 'entrada';
  elsif acct_kind = 'despesa' then
    new.kind := 'saida';
  end if;

  -- Preenche/limpa a data de liquidação conforme o status.
  if new.status = 'pago' and new.settled_on is null then
    new.settled_on := new.issued_on;
  elsif new.status = 'em_aberto' then
    new.settled_on := null;
  end if;

  return new;
end;
$$;

create trigger entries_sync_account
  before insert or update of account_id, kind, status, settled_on, issued_on, org_id
  on public.entries
  for each row execute function public.sync_entry_from_account();

-- -----------------------------------------------------------------------------
-- Plano de contas padrão para novas empresas.
-- Espelha as 15 receitas e 15 despesas de Cadastros!B11:C27 da planilha original.
-- -----------------------------------------------------------------------------
create or replace function public.seed_default_accounts(target_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chart_of_accounts (org_id, name, kind, sort_order)
  select target_org, name, kind, ord
  from (values
    ('Dinheiro',              'receita'::public.account_kind,  1),
    ('PIX / Transferência',   'receita',                       2),
    ('Cartão de Débito',      'receita',                       3),
    ('Cartão de Crédito',     'receita',                       4),
    ('Outros Recebimentos 1', 'receita',                       5),
    ('Outros Recebimentos 2', 'receita',                       6),
    ('Outros Recebimentos 3', 'receita',                       7),
    ('Outros Recebimentos 4', 'receita',                       8),
    ('Outros Recebimentos 5', 'receita',                       9),
    ('Outros Recebimentos 6', 'receita',                      10),
    ('Outros Recebimentos 7', 'receita',                      11),
    ('Outros Recebimentos 8', 'receita',                      12),
    ('Outros Recebimentos 9', 'receita',                      13),
    ('Outros Recebimentos 10','receita',                      14),
    ('Outros Recebimentos 11','receita',                      15),
    ('Outros Recebimentos 12','receita',                      16),
    ('Outros Recebimentos 13','receita',                      17),
    ('Retirada de Sócio',     'despesa',                       1),
    ('Transferências Bancárias','despesa',                     2),
    ('Fornecedores',          'despesa',                       3),
    ('Despesas Financeiras',  'despesa',                       4),
    ('Impostos',              'despesa',                       5),
    ('Despesas com Pessoal',  'despesa',                       6),
    ('Despesas Administrativas','despesa',                     7),
    ('Contador',              'despesa',                       8),
    ('Outras Saídas 1',       'despesa',                       9),
    ('Outras Saídas 2',       'despesa',                      10),
    ('Outras Saídas 3',       'despesa',                      11),
    ('Outras Saídas 4',       'despesa',                      12),
    ('Outras Saídas 5',       'despesa',                      13),
    ('Outras Saídas 6',       'despesa',                      14),
    ('Outras Saídas 7',       'despesa',                      15),
    ('Outras Saídas 8',       'despesa',                      16),
    ('Outras Saídas 9',       'despesa',                      17)
  ) as t (name, kind, ord)
  on conflict do nothing;
end;
$$;

create or replace function public.handle_new_organization_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_accounts(new.id);
  return new;
end;
$$;

create trigger organizations_seed_accounts
  after insert on public.organizations
  for each row execute function public.handle_new_organization_accounts();

-- =============================================================================
-- VIEWS ANALÍTICAS
-- Substituem toda a engenharia de SUMIFS/XLOOKUP da aba "Análise" da planilha.
-- Todas são `security_invoker` para respeitarem o RLS do usuário que consulta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- monthly_cashflow — entradas, saídas, resultado e saldo acumulado por mês.
-- Reproduz as linhas "Entradas", "Saídas", "Saldo Operacional" e
-- "Saldo Acumulado" da aba Análise.
-- -----------------------------------------------------------------------------
create view public.monthly_cashflow
with (security_invoker = true) as
with base as (
  select
    e.org_id,
    date_trunc('month', e.issued_on)::date as month,
    -- Apenas lançamentos liquidados entram no realizado. Sem o filtro de
    -- status, uma conta a pagar ainda em aberto reduziria o saldo como se já
    -- tivesse saído do caixa — que é justamente a distinção que a coluna
    -- "Valor_analise" da planilha fazia.
    coalesce(sum(e.amount) filter (
      where e.kind = 'entrada' and not e.is_transfer and e.status = 'pago'
    ), 0) as income,
    coalesce(sum(e.amount) filter (
      where e.kind = 'saida' and not e.is_transfer and e.status = 'pago'
    ), 0) as expense,
    -- Os pendentes são expostos à parte, para o painel mostrar o que ainda
    -- vai entrar e sair sem contaminar o saldo.
    coalesce(sum(e.amount) filter (
      where e.kind = 'entrada' and not e.is_transfer and e.status = 'em_aberto'
    ), 0) as pending_income,
    coalesce(sum(e.amount) filter (
      where e.kind = 'saida' and not e.is_transfer and e.status = 'em_aberto'
    ), 0) as pending_expense
  from public.entries e
  group by e.org_id, date_trunc('month', e.issued_on)::date
),
opening as (
  select id as org_id, opening_balance from public.organizations
)
select
  b.org_id,
  b.month,
  b.income,
  b.expense,
  b.pending_income,
  b.pending_expense,
  b.income - b.expense as operational_result,
  o.opening_balance + sum(b.income - b.expense) over (
    partition by b.org_id order by b.month
    rows between unbounded preceding and current row
  ) as accumulated_balance
from base b
join opening o on o.org_id = b.org_id;

comment on view public.monthly_cashflow is
  'Fluxo de caixa mensal realizado (apenas liquidados) com saldo acumulado, mais os valores ainda em aberto. Base do dashboard e do DRE.';

-- -----------------------------------------------------------------------------
-- monthly_by_account — quanto cada conta movimentou em cada mês.
-- Substitui a matriz C17:N51 (SUMIFS por plano de conta × mês) da aba Análise.
-- -----------------------------------------------------------------------------
create view public.monthly_by_account
with (security_invoker = true) as
select
  e.org_id,
  date_trunc('month', e.issued_on)::date as month,
  a.id   as account_id,
  a.name as account_name,
  a.kind as account_kind,
  count(*) filter (where e.status = 'pago')      as entry_count,
  -- `total` considera apenas o realizado, para casar com `monthly_cashflow`.
  coalesce(sum(e.amount) filter (where e.status = 'pago'), 0)      as total,
  coalesce(sum(e.amount) filter (where e.status = 'em_aberto'), 0) as pending_total,
  count(*) filter (where e.status = 'em_aberto')                   as pending_count
from public.entries e
join public.chart_of_accounts a on a.id = e.account_id
where not e.is_transfer
group by e.org_id, date_trunc('month', e.issued_on)::date, a.id, a.name, a.kind;

comment on view public.monthly_by_account is
  'Movimento mensal por conta do plano, separando o realizado do que ainda está em aberto.';

-- -----------------------------------------------------------------------------
-- wallet_balances — saldo atual por conta bancária.
-- -----------------------------------------------------------------------------
create view public.wallet_balances
with (security_invoker = true) as
select
  w.id     as wallet_id,
  w.org_id,
  w.name,
  w.kind,
  w.color,
  w.opening_balance,
  w.opening_balance
    + coalesce(sum(case when e.kind = 'entrada' then e.amount else -e.amount end)
               filter (where e.status = 'pago'), 0) as current_balance,
  coalesce(sum(e.amount) filter (where e.status = 'em_aberto' and e.kind = 'entrada'), 0) as pending_income,
  coalesce(sum(e.amount) filter (where e.status = 'em_aberto' and e.kind = 'saida'),   0) as pending_expense
from public.wallets w
left join public.entries e on e.wallet_id = w.id
group by w.id, w.org_id, w.name, w.kind, w.color, w.opening_balance;

comment on view public.wallet_balances is
  'Saldo realizado e pendente por conta bancária. Considera apenas lançamentos liquidados no saldo atual.';

-- -----------------------------------------------------------------------------
-- org_overview — cartões de KPI da Visão Geral (período completo).
-- -----------------------------------------------------------------------------
create view public.org_overview
with (security_invoker = true) as
select
  o.id as org_id,
  o.name,
  o.opening_balance,
  coalesce(sum(e.amount) filter (where e.kind = 'entrada' and e.status = 'pago' and not e.is_transfer), 0) as received,
  coalesce(sum(e.amount) filter (where e.kind = 'saida'   and e.status = 'pago' and not e.is_transfer), 0) as paid,
  coalesce(sum(e.amount) filter (where e.status = 'em_aberto' and e.kind = 'entrada' and not e.is_transfer), 0) as receivable,
  coalesce(sum(e.amount) filter (where e.status = 'em_aberto' and e.kind = 'saida'   and not e.is_transfer), 0) as payable,
  o.opening_balance
    + coalesce(sum(case when e.kind = 'entrada' then e.amount else -e.amount end)
               filter (where e.status = 'pago' and not e.is_transfer), 0) as balance,
  count(e.id) filter (where e.status = 'em_aberto') as open_entries,
  max(e.issued_on) as last_entry_on
from public.organizations o
left join public.entries e on e.org_id = o.id
group by o.id, o.name, o.opening_balance;

-- -----------------------------------------------------------------------------
-- party_totals — quanto cada cliente/fornecedor movimentou e quanto está aberto.
-- -----------------------------------------------------------------------------
create view public.party_totals
with (security_invoker = true) as
select
  p.id as party_id,
  p.org_id,
  p.name,
  p.kind,
  coalesce(sum(e.amount) filter (where e.status = 'pago'), 0) as settled_total,
  coalesce(sum(e.amount) filter (where e.status = 'em_aberto'), 0) as open_total,
  count(e.id) as entry_count,
  max(e.issued_on) as last_entry_on
from public.parties p
left join public.entries e on e.party_id = p.id
group by p.id, p.org_id, p.name, p.kind;

-- =============================================================================
-- RPC: transferência entre contas
-- Cria o par saída/entrada de forma atômica, num único round-trip.
-- =============================================================================
create or replace function public.create_transfer(
  p_org_id     uuid,
  p_from       uuid,
  p_to         uuid,
  p_amount     numeric,
  p_date       date,
  p_description text default 'Transferência entre contas'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group   uuid := gen_random_uuid();
  v_account uuid;
begin
  if not public.can_edit_org(p_org_id) then
    raise exception 'Sem permissão para movimentar esta empresa' using errcode = '42501';
  end if;

  if p_from = p_to then
    raise exception 'As contas de origem e destino devem ser diferentes' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor da transferência deve ser positivo' using errcode = '22023';
  end if;

  -- Conta-razão usada apenas para satisfazer a FK; transferências são
  -- excluídas dos relatórios por `is_transfer`.
  select id into v_account
  from public.chart_of_accounts
  where org_id = p_org_id and kind = 'transferencia'
  order by sort_order limit 1;

  if v_account is null then
    insert into public.chart_of_accounts (org_id, name, kind, sort_order)
    values (p_org_id, 'Transferências entre Contas', 'transferencia', 999)
    returning id into v_account;
  end if;

  insert into public.entries
    (org_id, account_id, wallet_id, kind, status, description, amount, issued_on, settled_on, is_transfer, transfer_group, created_by)
  values
    (p_org_id, v_account, p_from, 'saida',   'pago', p_description, p_amount, p_date, p_date, true, v_group, auth.uid()),
    (p_org_id, v_account, p_to,   'entrada', 'pago', p_description, p_amount, p_date, p_date, true, v_group, auth.uid());

  return v_group;
end;
$$;

comment on function public.create_transfer is
  'Cria o par de lançamentos de uma transferência entre contas e devolve o transfer_group.';

-- =============================================================================
-- RPC: dashboard consolidado
-- Devolve KPIs, série mensal, composição por conta e alertas numa só chamada.
-- =============================================================================
create or replace function public.dashboard_summary(
  p_org_id  uuid,
  p_from    date,
  p_to      date
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'Sem acesso a esta empresa' using errcode = '42501';
  end if;

  with scoped as (
    select * from public.entries
    where org_id = p_org_id
      and issued_on between p_from and p_to
      and is_transfer = false
  ),
  totals as (
    select
      coalesce(sum(amount) filter (where kind = 'entrada' and status = 'pago'), 0) as received,
      coalesce(sum(amount) filter (where kind = 'saida'   and status = 'pago'), 0) as paid,
      coalesce(sum(amount) filter (where kind = 'entrada' and status = 'em_aberto'), 0) as receivable,
      coalesce(sum(amount) filter (where kind = 'saida'   and status = 'em_aberto'), 0) as payable,
      count(*) filter (where status = 'em_aberto') as open_count,
      count(*) as entry_count
    from scoped
  ),
  series as (
    select coalesce(jsonb_agg(row_to_json(s) order by s.month), '[]'::jsonb) as data
    from (
      select
        to_char(date_trunc('month', issued_on), 'YYYY-MM') as month,
        -- Somente o realizado entra na série, para o gráfico refletir o caixa.
        coalesce(sum(amount) filter (where kind = 'entrada' and status = 'pago'), 0) as income,
        coalesce(sum(amount) filter (where kind = 'saida'   and status = 'pago'), 0) as expense
      from scoped
      group by date_trunc('month', issued_on)
    ) s
  ),
  by_account as (
    select coalesce(jsonb_agg(row_to_json(a) order by a.total desc), '[]'::jsonb) as data
    from (
      select
        c.name,
        c.kind,
        coalesce(sum(e.amount) filter (where e.status = 'pago'), 0) as total,
        count(*) filter (where e.status = 'pago') as entry_count
      from scoped e
      join public.chart_of_accounts c on c.id = e.account_id
      group by c.name, c.kind
      having count(*) filter (where e.status = 'pago') > 0
    ) a
  )
  select jsonb_build_object(
    'range',      jsonb_build_object('from', p_from, 'to', p_to),
    'totals',     (select row_to_json(t) from totals t),
    'series',     (select data from series),
    'by_account', (select data from by_account)
  ) into v_result;

  return v_result;
end;
$$;

-- =============================================================================
-- RPC: provisão de dados de demonstração
-- Gera lançamentos sintéticos para o usuário testar o sistema sem planilha.
-- =============================================================================
create or replace function public.seed_demo_data(
  p_org_id uuid,
  p_months integer default 12
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_income_accounts  uuid[];
  v_expense_accounts uuid[];
  v_wallet           uuid;
  v_count            integer := 0;
  v_month            integer;
  v_start            date := date_trunc('month', current_date)::date;
begin
  if not public.can_edit_org(p_org_id) then
    raise exception 'Sem permissão para popular esta empresa' using errcode = '42501';
  end if;

  select coalesce(array_agg(id order by sort_order), '{}')
    into v_income_accounts
  from public.chart_of_accounts
  where org_id = p_org_id and kind = 'receita' and sort_order <= 4;

  select coalesce(array_agg(id order by sort_order), '{}')
    into v_expense_accounts
  from public.chart_of_accounts
  where org_id = p_org_id and kind = 'despesa' and sort_order <= 8;

  if array_length(v_income_accounts, 1) is null or array_length(v_expense_accounts, 1) is null then
    raise exception 'Plano de contas incompleto para gerar demonstração' using errcode = '22023';
  end if;

  select id into v_wallet from public.wallets where org_id = p_org_id order by created_at limit 1;
  if v_wallet is null then
    insert into public.wallets (org_id, name, kind, opening_balance)
    values (p_org_id, 'Caixa Principal', 'caixa', 0)
    returning id into v_wallet;
  end if;

  for v_month in 1..p_months loop
    insert into public.entries
      (org_id, account_id, wallet_id, kind, status, description, amount, issued_on, settled_on, created_by)
    select
      p_org_id,
      a.acct,
      v_wallet,
      a.kind,
      case when random() < 0.88 then 'pago'::public.entry_status else 'em_aberto'::public.entry_status end,
      a.label,
      round((a.base * (0.85 + random() * 0.3))::numeric, 2),
      (v_start - make_interval(months => p_months - v_month))::date + a.day_offset,
      null,
      auth.uid()
    from (
      select unnest(v_income_accounts)  as acct, 'entrada'::public.entry_kind as kind,
             'Recebimento ' || (row_number() over ())::text as label,
             (6000 + random() * 9000) as base,
             (row_number() over () * 4)::int as day_offset
      union all
      select unnest(v_expense_accounts), 'saida'::public.entry_kind,
             'Pagamento ' || (row_number() over ())::text,
             (2000 + random() * 6000),
             (row_number() over () * 3)::int
    ) a;

    v_count := v_count + 1;
  end loop;

  -- O trigger preenche settled_on quando o status é 'pago'.
  update public.entries
  set settled_on = issued_on
  where org_id = p_org_id and status = 'pago' and settled_on is null;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- As funções RPC são chamadas pelo app autenticado.
-- -----------------------------------------------------------------------------
grant execute on function
  public.create_transfer(uuid, uuid, uuid, numeric, date, text),
  public.dashboard_summary(uuid, date, date),
  public.seed_demo_data(uuid, integer),
  public.is_org_member(uuid),
  public.can_edit_org(uuid),
  public.org_role(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- Privilégios das views analíticas.
-- Precisa vir DEPOIS da criação das views: um GRANT em objeto inexistente
-- falha, e views criadas depois de um GRANT não o herdam.
-- -----------------------------------------------------------------------------
grant select
  on public.monthly_cashflow, public.monthly_by_account, public.wallet_balances,
     public.org_overview, public.party_totals
  to authenticated;

-- -----------------------------------------------------------------------------
-- As funções RPC são chamadas pelo app autenticado.
-- -----------------------------------------------------------------------------
grant execute on function
  public.create_transfer(uuid, uuid, uuid, numeric, date, text),
  public.dashboard_summary(uuid, date, date),
  public.seed_demo_data(uuid, integer),
  public.is_org_member(uuid),
  public.can_edit_org(uuid),
  public.org_role(uuid)
to authenticated;
