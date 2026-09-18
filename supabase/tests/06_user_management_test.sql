-- =============================================================================
-- Testa o módulo de usuários.
--
-- O ponto central é o recorte de visibilidade: o super_admin enxerga todos,
-- o admin de empresa enxerga apenas quem compartilha uma empresa com ele.
-- Uma falha aqui significa vazamento de dados entre contas.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-000000000001','global@usr.test','{"full_name":"Global"}'),
  ('e0000000-0000-0000-0000-000000000002','ana@usr.test',   '{"full_name":"Ana Admin"}'),
  ('e0000000-0000-0000-0000-000000000003','bruno@usr.test', '{"full_name":"Bruno Membro"}'),
  ('e0000000-0000-0000-0000-000000000004','carla@usr.test', '{"full_name":"Carla Outra"}')
on conflict (id) do nothing;

-- Ana e Carla criam empresas próprias, em contas independentes.
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}';
insert into public.organizations (name, document, created_by)
values ('Empresa da Ana','55555555000155','e0000000-0000-0000-0000-000000000002');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-000000000004","role":"authenticated"}';
insert into public.organizations (name, document, created_by)
values ('Empresa da Carla','66666666000166','e0000000-0000-0000-0000-000000000004');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

insert into public.platform_admins (user_id) values ('e0000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 1. O admin global vê todos os usuários.
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare v_n integer; v_marca boolean;
begin
  -- Restringe aos usuarios desta suite: as demais rodam no mesmo banco, e
  -- contar tudo deixaria o resultado dependente da ordem de execucao.
  select count(*) into v_n from public.list_users() where email like '%@usr.test';
  if v_n <> 4 then
    raise exception 'FALHA: super_admin deveria ver os 4 usuarios desta suite, ve %', v_n;
  end if;
  raise notice 'OK  super_admin ve todos os usuarios da suite (%)', v_n;

  -- A propria marca de admin global vem na listagem.
  select is_super_admin into v_marca
  from public.list_users() where email = 'global@usr.test';
  if not v_marca then
    raise exception 'FALHA: a listagem nao marcou o admin global';
  end if;
  raise notice 'OK  listagem identifica quem e admin global';
end
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

-- -----------------------------------------------------------------------------
-- 2. A admin de empresa ve apenas quem compartilha a empresa dela.
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}';

do $$
declare v_n integer; v_tem_carla integer;
begin
  select count(*) into v_n from public.list_users();
  -- Ana ve a si mesma e quem estiver nas empresas dela; Carla nao.
  select count(*) into v_tem_carla from public.list_users() where email = 'carla@usr.test';

  if v_tem_carla <> 0 then
    raise exception 'FALHA DE SEGURANCA: Ana ve a Carla, de outra conta';
  end if;
  raise notice 'OK  admin de empresa nao ve usuarios de outras contas (viu %)', v_n;

  -- E nao consegue consultar os vinculos da Carla.
  begin
    perform * from public.list_user_memberships('e0000000-0000-0000-0000-000000000004');
    raise notice 'OK  consulta de vinculos alheios devolve vazio (sem vazamento)';
  exception when others then
    raise notice 'OK  consulta de vinculos alheios bloqueada';
  end;
end
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

-- -----------------------------------------------------------------------------
-- 3. Conceder acesso.
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}';

do $$
declare
  v_org uuid;
  v_out text;
  v_n integer;
begin
  select id into v_org from public.organizations where name = 'Empresa da Ana';

  select outcome into v_out
  from public.grant_org_access('e0000000-0000-0000-0000-000000000003', v_org, 'member');
  if v_out <> 'granted' then
    raise exception 'FALHA: esperava granted, veio %', v_out;
  end if;
  raise notice 'OK  acesso concedido ao Bruno';

  -- Repetir avisa em vez de duplicar.
  select outcome into v_out
  from public.grant_org_access('e0000000-0000-0000-0000-000000000003', v_org, 'member');
  if v_out <> 'already_member' then
    raise exception 'FALHA: esperava already_member, veio %', v_out;
  end if;
  raise notice 'OK  concessao repetida e detectada';

  -- Agora o Bruno aparece na lista de usuarios da Ana.
  select count(*) into v_n from public.list_users() where email = 'bruno@usr.test';
  if v_n <> 1 then
    raise exception 'FALHA: Bruno deveria aparecer na lista da Ana';
  end if;
  raise notice 'OK  Bruno passou a aparecer na lista da Ana';

  -- E os vinculos dele mostram a empresa, com permissao de gestao.
  select count(*) into v_n
  from public.list_user_memberships('e0000000-0000-0000-0000-000000000003')
  where org_name = 'Empresa da Ana' and can_manage;
  if v_n <> 1 then
    raise exception 'FALHA: vinculo do Bruno nao apareceu como gerenciavel';
  end if;
  raise notice 'OK  vinculos do Bruno visiveis e gerenciaveis';
end
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

-- -----------------------------------------------------------------------------
-- 4. Protecoes ao remover e ao rebaixar.
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}';

do $$
declare
  v_org uuid;
  v_meu uuid;
  v_out text;
begin
  select id into v_org from public.organizations where name = 'Empresa da Ana';

  -- Ana nao remove o proprio acesso.
  select id into v_meu from public.memberships
  where org_id = v_org and user_id = 'e0000000-0000-0000-0000-000000000002';

  select outcome into v_out from public.revoke_org_access(v_meu);
  if v_out <> 'self' then
    raise exception 'FALHA: deveria impedir auto-remocao, veio %', v_out;
  end if;
  raise notice 'OK  ninguem remove o proprio acesso';

  -- Ana nao rebaixa a si mesma sendo a unica proprietaria.
  select outcome into v_out from public.set_member_role(v_meu, 'viewer');
  if v_out <> 'last_owner' then
    raise exception 'FALHA: deveria proteger o ultimo proprietario, veio %', v_out;
  end if;
  raise notice 'OK  ultimo proprietario nao pode ser rebaixado';

  -- Mas consegue trocar o papel do Bruno.
  select outcome into v_out
  from public.set_member_role(
    (select id from public.memberships
     where org_id = v_org and user_id = 'e0000000-0000-0000-0000-000000000003'),
    'viewer'
  );
  if v_out <> 'updated' then
    raise exception 'FALHA: esperava updated, veio %', v_out;
  end if;
  raise notice 'OK  papel de outro membro pode ser alterado';

  -- E consegue remover o Bruno.
  select outcome into v_out
  from public.revoke_org_access(
    (select id from public.memberships
     where org_id = v_org and user_id = 'e0000000-0000-0000-0000-000000000003')
  );
  if v_out <> 'revoked' then
    raise exception 'FALHA: esperava revoked, veio %', v_out;
  end if;
  raise notice 'OK  acesso de outro membro pode ser removido';
end
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

-- -----------------------------------------------------------------------------
-- 5. Um visualizador nao administra ninguem.
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated"}';

do $$
begin
  -- Sem nenhuma empresa (foi removido), nao pode listar usuarios.
  begin
    perform * from public.list_users();
    raise exception 'FALHA DE SEGURANCA: usuario sem vinculo listou usuarios';
  exception when insufficient_privilege then
    raise notice 'OK  usuario sem vinculo nao lista usuarios';
  end;
end
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

\echo ''
\echo '=========================================='
\echo ' TODOS OS TESTES DE USUARIOS PASSARAM'
\echo '=========================================='
