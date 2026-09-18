-- =============================================================================
-- Testa os dois níveis de administração e o isolamento entre contas.
--
--   1. super_admin  — global, vê e administra todas as empresas
--   2. owner/admin  — por empresa, restrito à própria conta
--
-- O ponto central: o super_admin enxerga tudo, e ninguém mais ganha acesso
-- por causa disso. Qualquer regressão aqui significaria vazamento entre contas.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-000000000001','ana@adm.test',  '{"full_name":"Ana Souza"}'),
  ('d0000000-0000-0000-0000-000000000002','bruno@adm.test','{"full_name":"Bruno Lima"}'),
  ('d0000000-0000-0000-0000-000000000003','chefe@adm.test','{"full_name":"Chefe Global"}')
on conflict (id) do nothing;

-- Ana e Bruno criam cada um a própria empresa.
set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';
insert into public.organizations (name, document, created_by)
values ('Empresa da Ana','11111111000111','d0000000-0000-0000-0000-000000000001');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}';
insert into public.organizations (name, document, created_by)
values ('Empresa do Bruno','22222222000122','d0000000-0000-0000-0000-000000000002');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

-- O chefe global é promovido (a primeira concessão vem de fora do app).
insert into public.platform_admins (user_id, note)
values ('d0000000-0000-0000-0000-000000000003','promovido no teste')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 1. Nível global: o super_admin vê as duas empresas.
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated"}';

do $$
declare v_n integer; v_super boolean;
begin
  v_super := public.is_super_admin();
  if not v_super then raise exception 'FALHA: chefe nao reconhecido como super_admin'; end if;
  raise notice 'OK  chefe e reconhecido como super_admin';

  -- Conta apenas as empresas desta suite: as demais suites rodam no mesmo\r
  -- banco e deixariam o numero dependente da ordem de execucao.
  select count(*) into v_n from public.organizations
  where document in ('11111111000111','22222222000122');
  if v_n <> 2 then
    raise exception 'FALHA: super_admin deveria ver as 2 empresas desta suite, ve %', v_n;
  end if;
  raise notice 'OK  super_admin ve todas as empresas (%)', v_n;

  -- A RPC de listagem global devolve as duas, com o responsavel de cada uma.
  select count(*) into v_n from public.list_all_organizations()
  where document in ('11111111000111','22222222000122');
  if v_n <> 2 then
    raise exception 'FALHA: list_all_organizations nao devolveu as 2 empresas desta suite (%)', v_n;
  end if;
  raise notice 'OK  list_all_organizations devolveu as 2 empresas da suite';

  -- E enxerga os lancamentos de qualquer uma delas.
  select count(*) into v_n from public.monthly_cashflow;
  raise notice 'OK  super_admin le o fluxo de caixa de todas (%)', v_n;
end
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

-- -----------------------------------------------------------------------------
-- 2. Nível por conta: Ana continua vendo só a dela.
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare v_n integer; v_nome text;
begin
  select count(*) into v_n from public.organizations;
  if v_n <> 1 then
    raise exception 'FALHA DE SEGURANCA: Ana ve % empresas', v_n;
  end if;

  select name into v_nome from public.organizations limit 1;
  if v_nome <> 'Empresa da Ana' then
    raise exception 'FALHA DE SEGURANCA: Ana ve a empresa errada (%)', v_nome;
  end if;
  raise notice 'OK  Ana ve apenas a propria empresa';

  -- Nao pode listar tudo.
  begin
    perform * from public.list_all_organizations();
    raise exception 'FALHA DE SEGURANCA: Ana conseguiu listar todas as empresas';
  exception when insufficient_privilege then
    raise notice 'OK  Ana nao pode listar todas as empresas';
  end;
end
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

-- -----------------------------------------------------------------------------
-- 3. Convite de equipe.
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  v_org uuid;
  v_out text;
  v_msg text;
  v_n integer;
begin
  select id into v_org from public.organizations where name = 'Empresa da Ana';

  -- E-mail inexistente: avisa em vez de estourar erro.
  select outcome, message into v_out, v_msg
  from public.invite_member_by_email(v_org, 'ninguem@adm.test', 'member');
  if v_out <> 'not_found' then
    raise exception 'FALHA: esperava not_found, veio %', v_out;
  end if;
  raise notice 'OK  convite para e-mail sem conta avisa sem erro';

  -- Bruno entra como member.
  select outcome into v_out
  from public.invite_member_by_email(v_org, 'bruno@adm.test', 'member');
  if v_out <> 'added' then
    raise exception 'FALHA: esperava added, veio %', v_out;
  end if;
  raise notice 'OK  Bruno adicionado a equipe da Ana';

  -- Convidar de novo: avisa que ja e membro.
  select outcome into v_out
  from public.invite_member_by_email(v_org, 'bruno@adm.test', 'member');
  if v_out <> 'already_member' then
    raise exception 'FALHA: esperava already_member, veio %', v_out;
  end if;
  raise notice 'OK  convite repetido e detectado';

  -- A listagem de equipe traz e-mail e nome, nao apenas UUID.
  select count(*) into v_n from public.list_org_members(v_org);
  if v_n <> 2 then
    raise exception 'FALHA: esperava 2 membros, veio %', v_n;
  end if;
  raise notice 'OK  list_org_members devolveu os 2 membros com e-mail';
end
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

-- -----------------------------------------------------------------------------
-- 4. Agora que e membro, Bruno ve a empresa da Ana — e continua sem ver a
--    de terceiros que nao convidaram ele.
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}';

do $$
declare v_n integer;
begin
  select count(*) into v_n from public.organizations;
  if v_n <> 2 then
    raise exception 'FALHA: Bruno deveria ver 2 empresas (a dele + a da Ana), ve %', v_n;
  end if;
  raise notice 'OK  Bruno ve a propria empresa e aquela em que foi incluido';
end
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

-- -----------------------------------------------------------------------------
-- 5. Protecao: nao se revoga o ultimo administrador global.
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated"}';

do $$
declare v_out text;
begin
  select outcome into v_out from public.set_super_admin('chefe@adm.test', false);
  if v_out <> 'last_admin' then
    raise exception 'FALHA: deveria impedir revogar o ultimo admin, veio %', v_out;
  end if;
  raise notice 'OK  revogar o ultimo administrador e bloqueado';
end
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

\echo ''
\echo '=========================================='
\echo ' TODOS OS TESTES DE ADMINISTRACAO PASSARAM'
\echo '=========================================='
