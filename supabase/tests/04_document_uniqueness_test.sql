-- =============================================================================
-- Verifica a unicidade de CNPJ por usuário.
--
-- Usa `set role authenticated` de verdade: sem isso o bloco roda como
-- superusuário, o RLS é ignorado e o teste mede a coisa errada.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001','ana@doc.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002','bruno@doc.test')
on conflict (id) do nothing;

-- Ana cadastra o CNPJ X.
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
insert into public.organizations (name, document, created_by)
values ('Empresa da Ana','14434210000100','aaaaaaaa-0000-0000-0000-000000000001');

-- Ana não pode duplicar o próprio CNPJ, e só vê a própria empresa.
do $$
declare v_n integer;
begin
  begin
    insert into public.organizations (name, document, created_by)
    values ('Duplicada','14434210000100','aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'FALHA: Ana duplicou o proprio CNPJ';
  exception when unique_violation then
    raise notice 'OK  Ana nao pode duplicar o proprio CNPJ';
  end;

  select count(*) into v_n from public.organizations;
  if v_n <> 1 then
    raise exception 'FALHA: Ana deveria ver 1 empresa, ve %', v_n;
  end if;
  raise notice 'OK  Ana ve apenas a propria empresa';
end
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

-- Bruno usa o MESMO CNPJ: deve ser permitido, são bases independentes.
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';
insert into public.organizations (name, document, created_by)
values ('Empresa do Bruno','14434210000100','bbbbbbbb-0000-0000-0000-000000000002');

do $$
declare v_n integer;
begin
  select count(*) into v_n from public.organizations;
  if v_n <> 1 then
    raise exception 'FALHA DE SEGURANCA: Bruno ve % empresas', v_n;
  end if;
  raise notice 'OK  Bruno cadastrou o mesmo CNPJ e ve apenas a propria empresa';
end
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

-- Como superusuário: as duas coexistem no banco.
do $$
declare v_n integer;
begin
  select count(*) into v_n
  from public.organizations where document = '14434210000100';

  if v_n <> 2 then
    raise exception 'FALHA: esperava 2 empresas com o mesmo CNPJ, ve %', v_n;
  end if;
  raise notice 'OK  as duas empresas coexistem com o mesmo CNPJ';
end
$$;

\echo ''
\echo '=========================================='
\echo ' TODOS OS TESTES DE UNICIDADE PASSARAM'
\echo '=========================================='
