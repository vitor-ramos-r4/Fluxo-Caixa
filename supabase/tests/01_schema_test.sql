-- =============================================================================
-- Testes funcionais do schema.
-- Executar depois das migrations, num banco de teste.
--
--   psql -f 00_supabase_stub.sql
--   psql -f ../migrations/20260101000000_core_schema.sql
--   psql -f ../migrations/20260101000001_rls_and_analytics.sql
--   psql -f 01_schema_test.sql
--
-- Cada bloco levanta exceção se a asserção falhar, então o psql sai com erro.
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off

-- -----------------------------------------------------------------------------
-- Preparação: dois usuários e duas empresas independentes.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@empresa-a.test', '{"full_name":"Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'bruno@empresa-b.test', '{"full_name":"Bruno"}');

-- A empresa é criada como o usuário Ana (RLS ativa).
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.organizations (name, document, opening_balance, created_by)
values ('Empresa A', '12345678000190', 10000, '11111111-1111-1111-1111-111111111111');

reset role;
reset request.jwt.claim.sub;

do $$
declare
  v_org_a   uuid;
  v_owner   text;
  v_accounts integer;
begin
  select id into v_org_a from public.organizations where name = 'Empresa A';

  if v_org_a is null then
    raise exception 'FALHA: empresa não foi criada';
  end if;

  raise notice 'OK  empresa criada: %', v_org_a;

  -- Trigger deve ter registrado a autora como owner.
  select role into v_owner
  from public.memberships
  where org_id = v_org_a
    and user_id = '11111111-1111-1111-1111-111111111111';

  if v_owner <> 'owner' then
    raise exception 'FALHA: autora deveria ser owner, veio %', coalesce(v_owner, 'NULL');
  end if;
  raise notice 'OK  trigger registrou a criadora como owner';

  -- Plano de contas padrão deve ter sido semeado.
  select count(*) into v_accounts from public.chart_of_accounts where org_id = v_org_a;

  if v_accounts < 30 then
    raise exception 'FALHA: esperava >= 30 contas padrão, encontrei %', v_accounts;
  end if;
  raise notice 'OK  plano de contas semeado com % contas', v_accounts;
end
$$;

-- -----------------------------------------------------------------------------
-- RLS: Bruno não pode enxergar nem tocar nos dados da Empresa A.
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible from public.organizations;

  if v_visible <> 0 then
    raise exception 'FALHA DE SEGURANÇA: Bruno enxerga % empresa(s) que não são dele', v_visible;
  end if;
  raise notice 'OK  RLS: usuário externo não vê empresas alheias';

  select count(*) into v_visible from public.entries;
  if v_visible <> 0 then
    raise exception 'FALHA DE SEGURANÇA: Bruno enxerga % lançamento(s) alheios', v_visible;
  end if;
  raise notice 'OK  RLS: usuário externo não vê lançamentos alheios';

  select count(*) into v_visible from public.chart_of_accounts;
  if v_visible <> 0 then
    raise exception 'FALHA DE SEGURANÇA: Bruno enxerga % conta(s) alheias', v_visible;
  end if;
  raise notice 'OK  RLS: usuário externo não vê plano de contas alheio';
end
$$;

reset role;
reset request.jwt.claim.sub;

-- -----------------------------------------------------------------------------
-- Coerência de negócio: o tipo do lançamento vem da conta, não do cliente.
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare
  v_org       uuid;
  v_receita   uuid;
  v_despesa   uuid;
  v_kind      public.entry_kind;
  v_settled   date;
begin
  select id into v_org from public.organizations where name = 'Empresa A';

  select id into v_receita
  from public.chart_of_accounts
  where org_id = v_org and kind = 'receita' order by sort_order limit 1;

  select id into v_despesa
  from public.chart_of_accounts
  where org_id = v_org and kind = 'despesa' order by sort_order limit 1;

  -- Grava uma despesa mentindo que é entrada; o trigger deve corrigir.
  insert into public.entries
    (org_id, account_id, kind, status, description, amount, issued_on, created_by)
  values
    (v_org, v_despesa, 'entrada', 'em_aberto', 'Compra de material', 1500.50,
     current_date, '11111111-1111-1111-1111-111111111111')
  returning kind into v_kind;

  if v_kind <> 'saida' then
    raise exception 'FALHA: trigger não corrigiu o tipo; esperava saida, veio %', v_kind;
  end if;
  raise notice 'OK  trigger derivou kind=saida a partir da conta de despesa';

  -- Uma receita deve virar entrada.
  insert into public.entries
    (org_id, account_id, kind, status, description, amount, issued_on, created_by)
  values
    (v_org, v_receita, 'saida', 'pago', 'Venda de serviço', 8000.00,
     current_date, '11111111-1111-1111-1111-111111111111')
  returning kind, settled_on into v_kind, v_settled;

  if v_kind <> 'entrada' then
    raise exception 'FALHA: esperava entrada, veio %', v_kind;
  end if;
  if v_settled is null then
    raise exception 'FALHA: lançamento pago deveria ter data de liquidação';
  end if;
  raise notice 'OK  trigger derivou kind=entrada e preencheu a liquidação';
end
$$;

-- -----------------------------------------------------------------------------
-- Transferências não podem contar como receita/despesa.
-- -----------------------------------------------------------------------------
do $$
declare
  v_org     uuid;
  v_w1      uuid;
  v_w2      uuid;
  v_group   uuid;
  v_count   integer;
  v_income  numeric;
  v_expense numeric;
begin
  select id into v_org from public.organizations where name = 'Empresa A';

  insert into public.wallets (org_id, name, kind, opening_balance)
  values (v_org, 'Conta Corrente', 'corrente', 5000) returning id into v_w1;

  insert into public.wallets (org_id, name, kind, opening_balance)
  values (v_org, 'Poupança', 'poupanca', 0) returning id into v_w2;

  v_group := public.create_transfer(v_org, v_w1, v_w2, 2000, current_date, 'Aporte');

  select count(*) into v_count
  from public.entries where transfer_group = v_group;

  if v_count <> 2 then
    raise exception 'FALHA: transferência deveria gerar 2 lançamentos, gerou %', v_count;
  end if;
  raise notice 'OK  transferência criou o par saída/entrada';

  -- O fluxo mensal deve ignorar os lançamentos de transferência E os que
  -- ainda estão em aberto: só o realizado entra em `income`/`expense`.
  select coalesce(sum(income), 0), coalesce(sum(expense), 0)
    into v_income, v_expense
  from public.monthly_cashflow
  where org_id = v_org;

  if v_income <> 8000.00 then
    raise exception 'FALHA: entradas deveriam ser 8000,00 (sem transferência), veio %', v_income;
  end if;
  if v_expense <> 0 then
    raise exception 'FALHA: a despesa está em aberto, então as saídas realizadas deveriam ser 0, veio %', v_expense;
  end if;
  raise notice 'OK  transferências e pendentes ficaram fora do realizado (entradas %, saídas %)',
    v_income, v_expense;

  -- O pendente aparece separado, sem contaminar o saldo.
  select coalesce(sum(pending_expense), 0) into v_expense
  from public.monthly_cashflow
  where org_id = v_org;

  if v_expense <> 1500.50 then
    raise exception 'FALHA: a pagar deveria ser 1500,50, veio %', v_expense;
  end if;
  raise notice 'OK  valor em aberto exposto separadamente: %', v_expense;

  -- Origem igual a destino deve ser rejeitada.
  begin
    perform public.create_transfer(v_org, v_w1, v_w1, 100, current_date);
    raise exception 'FALHA: transferência para a mesma conta foi aceita';
  exception
    when others then
      if sqlerrm like 'FALHA:%' then raise; end if;
      raise notice 'OK  transferência com origem = destino rejeitada';
  end;
end
$$;

-- -----------------------------------------------------------------------------
-- Saldo acumulado e de carteira.
-- -----------------------------------------------------------------------------
do $$
declare
  v_org      uuid;
  v_balance  numeric;
  v_expected numeric;
  v_opening  numeric;
begin
  select id, opening_balance into v_org, v_opening
  from public.organizations where name = 'Empresa A';

  -- 10000 (abertura) + 8000 (receita paga). A despesa de 1500,50 está em
  -- aberto, então NÃO entra no saldo realizado — exatamente o comportamento
  -- que a coluna "Valor_analise" da planilha tentava reproduzir.
  v_expected := v_opening + 8000.00;

  select accumulated_balance into v_balance
  from public.monthly_cashflow
  where org_id = v_org
  order by month desc limit 1;

  if v_balance <> v_expected then
    raise exception 'FALHA: saldo acumulado esperado %, veio %', v_expected, v_balance;
  end if;
  raise notice 'OK  saldo acumulado ignorou o lançamento em aberto: %', v_balance;

  -- Ao quitar a despesa, o saldo tem de refletir a saída imediatamente.
  update public.entries
  set status = 'pago', settled_on = issued_on
  where org_id = v_org and status = 'em_aberto' and is_transfer = false;

  select accumulated_balance into v_balance
  from public.monthly_cashflow
  where org_id = v_org
  order by month desc limit 1;

  v_expected := v_opening + 8000.00 - 1500.50;

  if v_balance <> v_expected then
    raise exception 'FALHA: após quitar, saldo esperado %, veio %', v_expected, v_balance;
  end if;
  raise notice 'OK  ao quitar a despesa o saldo passou a %', v_balance;
end
$$;

-- -----------------------------------------------------------------------------
-- Resumo do dashboard.
-- -----------------------------------------------------------------------------
do $$
declare
  v_org      uuid;
  v_summary  jsonb;
  v_received text;
  v_paid     text;
begin
  select id into v_org from public.organizations where name = 'Empresa A';

  v_summary := public.dashboard_summary(
    v_org,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date
  );

  v_received := v_summary -> 'totals' ->> 'received';
  v_paid     := v_summary -> 'totals' ->> 'paid';

  -- O bloco anterior já quitou a despesa, então ambos estão realizados.
  if v_received <> '8000.00' then
    raise exception 'FALHA: received esperado 8000.00, veio %', v_received;
  end if;

  if v_paid <> '1500.50' then
    raise exception 'FALHA: paid esperado 1500.50, veio %', v_paid;
  end if;

  -- Nada mais pendente: os campos de aberto devem estar zerados.
  -- Comparação numérica: o jsonb pode devolver 0 em vez de 0.00.
  if (v_summary -> 'totals' ->> 'payable')::numeric <> 0 then
    raise exception 'FALHA: payable deveria ser 0 após a quitação, veio %',
      v_summary -> 'totals' ->> 'payable';
  end if;

  if jsonb_array_length(v_summary -> 'series') < 1 then
    raise exception 'FALHA: série mensal vazia';
  end if;

  -- A série deve refletir apenas o realizado.
  if (v_summary -> 'series' -> 0 ->> 'income')::numeric <> 8000.00 then
    raise exception 'FALHA: série não refletiu a entrada realizada: %',
      v_summary -> 'series' -> 0 ->> 'income';
  end if;

  raise notice 'OK  dashboard_summary devolveu totais e série corretos';
end
$$;

reset role;
reset request.jwt.claim.sub;

-- -----------------------------------------------------------------------------
-- Restrições de integridade.
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid;
  v_acc uuid;
begin
  select id into v_org from public.organizations where name = 'Empresa A';
  select id into v_acc from public.chart_of_accounts where org_id = v_org limit 1;

  -- Valor negativo deve ser barrado.
  begin
    insert into public.entries
      (org_id, account_id, kind, status, description, amount, issued_on)
    values (v_org, v_acc, 'entrada', 'pago', 'Inválido', -100, current_date);
    raise exception 'FALHA: valor negativo foi aceito';
  exception
    when check_violation then
      raise notice 'OK  valor negativo rejeitado';
    when others then
      if sqlerrm like 'FALHA:%' then raise; end if;
      raise notice 'OK  valor negativo rejeitado (%)', sqlerrm;
  end;

  -- Status 'em_aberto' com data de liquidação é incoerente. O trigger
  -- normaliza (limpa a data) em vez de rejeitar — o banco conserta o dado
  -- em vez de gravar algo contraditório.
  declare
    v_status  public.entry_status;
    v_settled date;
  begin
    insert into public.entries
      (org_id, account_id, kind, status, description, amount, issued_on, settled_on)
    values (v_org, v_acc, 'entrada', 'em_aberto', 'Incoerente', 100, current_date, current_date)
    returning status, settled_on into v_status, v_settled;

    if v_settled is not null then
      raise exception 'FALHA: em_aberto manteve data de liquidação (%)', v_settled;
    end if;
    raise notice 'OK  incoerência status/liquidação normalizada pelo trigger';
  end;

  -- CNPJ duplicado.
  begin
    insert into public.organizations (name, document, created_by)
    values ('Duplicada', '12345678000190', '11111111-1111-1111-1111-111111111111');
    raise exception 'FALHA: CNPJ duplicado foi aceito';
  exception
    when unique_violation then
      raise notice 'OK  CNPJ duplicado rejeitado';
    when others then
      if sqlerrm like 'FALHA:%' then raise; end if;
      raise notice 'OK  CNPJ duplicado rejeitado (%)', sqlerrm;
  end;

  -- Conta não pode ser pai de si mesma.
  begin
    update public.chart_of_accounts set parent_id = id where id = v_acc;
    raise exception 'FALHA: conta foi feita pai de si mesma';
  exception
    when check_violation then
      raise notice 'OK  auto-parentesco de conta rejeitado';
    when others then
      if sqlerrm like 'FALHA:%' then raise; end if;
      raise notice 'OK  auto-parentesco de conta rejeitado (%)', sqlerrm;
  end;
end
$$;

-- -----------------------------------------------------------------------------
-- Dados de demonstração.
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare
  v_org   uuid;
  v_count integer;
begin
  select id into v_org from public.organizations where name = 'Empresa A';

  perform public.seed_demo_data(v_org, 3);

  select count(*) into v_count from public.entries where org_id = v_org;

  if v_count < 20 then
    raise exception 'FALHA: seed_demo_data gerou poucos lançamentos (%)', v_count;
  end if;
  raise notice 'OK  seed_demo_data gerou % lançamentos no total', v_count;
end
$$;

reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '=========================================='
\echo ' TODOS OS TESTES DE SCHEMA PASSARAM'
\echo '=========================================='


