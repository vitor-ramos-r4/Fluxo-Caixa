-- =============================================================================
-- Stub do ambiente Supabase para validação das migrations em Postgres puro.
-- Só existe para testar o schema localmente — NÃO faz parte do projeto.
-- =============================================================================

create schema if not exists auth;
create schema if not exists extensions;

-- Réplica mínima de auth.users, com as colunas que as FKs e policies usam.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- `auth.uid()` no Supabase lê o claim `sub` do JWT. Aqui devolvemos o valor de
-- uma variável de sessão, para podermos simular usuários diferentes.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Papéis usados nas policies.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- Extensões que o Supabase já traz prontas.
create extension if not exists "uuid-ossp";

-- No Supabase real, o schema `auth` é acessível pelo papel authenticated (é
-- assim que `auth.uid()` funciona dentro de funções `security invoker`).
-- O stub precisa replicar isso, senão as RPCs quebram aqui e só aqui.
grant usage on schema auth to anon, authenticated, service_role;
