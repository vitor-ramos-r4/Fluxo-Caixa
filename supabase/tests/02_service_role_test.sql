-- =============================================================================
-- Verifica a correção do reconhecimento de `service_role` sem enfraquecer o RLS.
--
-- Independente de 01_schema_test.sql: usa usuários e empresa próprios, para
-- que os dois arquivos possam rodar em sequência no mesmo banco.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333','carla@sr.test'),
  ('44444444-4444-4444-4444-444444444444','diego@sr.test')
on conflict (id) do nothing;

-- Cria a empresa como a Carla (usuária comum, sujeita ao RLS).
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
insert into public.organizations (name, document, opening_balance, created_by)
values ('Empresa SR','99887766000155',10000,'33333333-3333-3333-3333-333333333333');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

do $$
declare v_org uuid;
begin
  select id into v_org from public.organizations where name='Empresa SR';

  -- 1. Carla (membro) deve poder.
  perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', true);
  perform set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  if not public.can_edit_org(v_org) then raise exception 'FALHA: membro deveria poder editar'; end if;
  raise notice 'OK  membro pode editar a propria empresa';

  -- 2. Diego (não-membro) NÃO deve poder. É o teste que importa.
  perform set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', true);
  perform set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
  if public.can_edit_org(v_org) then raise exception 'FALHA DE SEGURANCA: nao-membro pode editar'; end if;
  if public.is_org_member(v_org) then raise exception 'FALHA DE SEGURANCA: nao-membro consta como membro'; end if;
  raise notice 'OK  nao-membro continua bloqueado';

  -- 3. service_role deve poder, mesmo sem vínculo cadastrado.
  perform set_config('request.jwt.claim.sub','', true);
  perform set_config('request.jwt.claims','{"role":"service_role"}', true);
  if not public.is_service_role() then raise exception 'FALHA: service_role nao detectado'; end if;
  if not public.can_edit_org(v_org) then raise exception 'FALHA: service_role deveria poder editar'; end if;
  if not public.is_org_member(v_org) then raise exception 'FALHA: service_role deveria ver a empresa'; end if;
  raise notice 'OK  service_role reconhecido como confiavel';
end
$$;

-- 4. As RPCs funcionam com service_role — era exatamente isso que falhava.
set role authenticated;
set request.jwt.claims = '{"role":"service_role"}';
set request.jwt.claim.sub = '';

do $$
declare v_org uuid; v_w1 uuid; v_w2 uuid; v_group uuid; v_n integer;
begin
  select id into v_org from public.organizations where name='Empresa SR';
  insert into public.wallets (org_id,name,kind,opening_balance)
    values (v_org,'Conta 1','corrente',5000) returning id into v_w1;
  insert into public.wallets (org_id,name,kind,opening_balance)
    values (v_org,'Conta 2','poupanca',0) returning id into v_w2;

  v_group := public.create_transfer(v_org, v_w1, v_w2, 2500, current_date, 'Teste');
  select count(*) into v_n from public.entries where transfer_group = v_group;
  if v_n <> 2 then raise exception 'FALHA: esperava 2 lancamentos, veio %', v_n; end if;
  raise notice 'OK  create_transfer funcionou com service_role';

  perform public.seed_demo_data(v_org, 2);
  raise notice 'OK  seed_demo_data funcionou com service_role';
end
$$;

reset role;
reset request.jwt.claims;
reset request.jwt.claim.sub;

\echo ''
\echo '=========================================='
\echo ' TODOS OS TESTES DE service_role PASSARAM'
\echo '=========================================='
