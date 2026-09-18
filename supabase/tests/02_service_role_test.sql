-- Verifica a correcao do service_role sem enfraquecer o RLS.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','ana@a.test'),
  ('22222222-2222-2222-2222-222222222222','bruno@b.test');

-- Cria a empresa como a Ana (usuario comum).
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.organizations (name, document, opening_balance, created_by)
values ('Empresa A','12345678000190',10000,'11111111-1111-1111-1111-111111111111');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

do $$
declare v_org uuid; v_w1 uuid; v_w2 uuid; v_ok boolean;
begin
  select id into v_org from public.organizations where name='Empresa A';

  -- 1. Ana (membro) deve poder.
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', true);
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  if not public.can_edit_org(v_org) then raise exception 'FALHA: membro deveria poder editar'; end if;
  raise notice 'OK  membro pode editar a propria empresa';

  -- 2. Bruno (nao-membro) NAO deve poder. Este e o teste que importa.
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', true);
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  if public.can_edit_org(v_org) then raise exception 'FALHA DE SEGURANCA: nao-membro pode editar'; end if;
  if public.is_org_member(v_org) then raise exception 'FALHA DE SEGURANCA: nao-membro consta como membro'; end if;
  raise notice 'OK  nao-membro continua bloqueado';

  -- 3. service_role deve poder, mesmo sem membership.
  perform set_config('request.jwt.claim.sub','', true);
  perform set_config('request.jwt.claims','{"role":"service_role"}', true);
  if not public.is_service_role() then raise exception 'FALHA: service_role nao detectado'; end if;
  if not public.can_edit_org(v_org) then raise exception 'FALHA: service_role deveria poder editar'; end if;
  if not public.is_org_member(v_org) then raise exception 'FALHA: service_role deveria ver a empresa'; end if;
  raise notice 'OK  service_role reconhecido como confiavel';
end
$$;

-- 4. A RPC de transferencia funciona com service_role (era o bug).
set role authenticated;
set request.jwt.claims = '{"role":"service_role"}';
set request.jwt.claim.sub = '';

do $$
declare v_org uuid; v_w1 uuid; v_w2 uuid; v_group uuid; v_n integer;
begin
  select id into v_org from public.organizations where name='Empresa A';
  insert into public.wallets (org_id,name,kind,opening_balance) values (v_org,'Conta 1','corrente',5000) returning id into v_w1;
  insert into public.wallets (org_id,name,kind,opening_balance) values (v_org,'Conta 2','poupanca',0) returning id into v_w2;

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
\echo 'TODOS OS TESTES DE service_role PASSARAM'
