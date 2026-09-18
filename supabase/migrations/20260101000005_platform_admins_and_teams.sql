-- =============================================================================
-- Administração em dois níveis e gestão de equipe
-- =============================================================================
-- Até aqui havia apenas o papel por empresa (`memberships.role`). Faltava um
-- nível acima: alguém que enxergue e administre TODAS as contas, para dar
-- suporte e consolidar a operação.
--
-- Ficam definidos dois níveis distintos:
--
--   1. super_admin  — global, fora de qualquer empresa. Vê e administra todas
--                     as contas do sistema. É um privilégio de operação, não
--                     de negócio: serve para suporte e visão consolidada.
--
--   2. owner / admin / member / viewer — por empresa, como já era. Definem o
--                     que a pessoa faz dentro de uma conta específica.
--
-- Um super_admin NÃO recebe automaticamente papel nas empresas: ele enxerga
-- tudo pela condição global, e continua precisando ser adicionado como membro
-- se quiser aparecer na equipe de uma conta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Quem é super_admin fica numa tabela própria, e não num papel em
-- `memberships`: `memberships` sempre aponta para uma empresa, e o
-- super_admin existe independentemente delas.
-- -----------------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  note       text
);

comment on table public.platform_admins is
  'Administradores globais: enxergam e administram todas as empresas do sistema.';

alter table public.platform_admins enable row level security;

-- -----------------------------------------------------------------------------
-- `is_super_admin()` é a base de todas as policies de visão global.
-- Precisa existir ANTES das policies que a referenciam, e é
-- `security definer` porque lê uma tabela protegida por RLS.
-- -----------------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins a where a.user_id = auth.uid()
  );
$$;

grant execute on function public.is_super_admin() to authenticated;

-- Qualquer usuário pode descobrir se ele mesmo é admin global — o app precisa
-- disso para decidir o que exibir. Ninguém enxerga a lista completa, exceto
-- outro admin global.
drop policy if exists platform_admins_select_self on public.platform_admins;
create policy platform_admins_select_self on public.platform_admins
  for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

-- Apenas um admin global concede o privilégio a outro. A primeira concessão
-- precisa ser feita por script com a chave de serviço (ver seed/promoção).
drop policy if exists platform_admins_write on public.platform_admins;
create policy platform_admins_write on public.platform_admins
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select, insert, update, delete on public.platform_admins to authenticated;

-- -----------------------------------------------------------------------------
-- As funções de checagem passam a considerar o admin global.
--
-- `is_org_member` responde "posso ver os dados desta empresa?", e para o
-- super_admin a resposta é sempre sim. Já `can_edit_org` responde "posso
-- alterar?" — também sim, é o ponto de ser administrador da plataforma.
-- -----------------------------------------------------------------------------
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_service_role()
    or public.is_super_admin()
    or exists (
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
  select
    public.is_service_role()
    or public.is_super_admin()
    or exists (
      select 1
      from public.memberships m
      where m.org_id = target_org
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'member')
    );
$$;

-- -----------------------------------------------------------------------------
-- A policy de SELECT das empresas passa a liberar tudo para o admin global.
-- -----------------------------------------------------------------------------
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (
    public.is_org_member(id)
    or created_by = auth.uid()
    or public.is_super_admin()
  );

-- O admin global também pode arquivar/editar qualquer empresa.
drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.org_role(id) in ('owner', 'admin') or public.is_super_admin())
  with check (public.org_role(id) in ('owner', 'admin') or public.is_super_admin());

drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on public.organizations
  for delete to authenticated
  using (public.org_role(id) = 'owner' or public.is_super_admin());

-- -----------------------------------------------------------------------------
-- Gestão de equipe: o admin global administra membros de qualquer empresa.
-- -----------------------------------------------------------------------------
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.org_role(org_id) in ('owner', 'admin')
    or public.is_super_admin()
  );

drop policy if exists memberships_insert on public.memberships;
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (
    public.org_role(org_id) in ('owner', 'admin')
    or public.is_super_admin()
  );

drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships
  for update to authenticated
  using (public.org_role(org_id) in ('owner', 'admin') or public.is_super_admin())
  with check (public.org_role(org_id) in ('owner', 'admin') or public.is_super_admin());

drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (public.org_role(org_id) in ('owner', 'admin') or public.is_super_admin());

-- =============================================================================
-- RPC: listar equipe de uma empresa
--
-- Precisa de função porque `memberships` guarda apenas `user_id`, e o e-mail
-- e o nome vivem em `auth.users` — schema que o cliente não acessa. Sem isso
-- a tela mostraria uma lista de UUIDs.
-- =============================================================================
create or replace function public.list_org_members(p_org_id uuid)
returns table (
  membership_id uuid,
  user_id       uuid,
  email         text,
  full_name     text,
  role          text,
  created_at    timestamptz,
  is_self       boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_org_member(p_org_id) or public.is_super_admin()) then
    raise exception 'Sem acesso a esta empresa' using errcode = '42501';
  end if;

  return query
    select
      m.id,
      m.user_id,
      u.email::text,
      coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))::text,
      m.role,
      m.created_at,
      (m.user_id = auth.uid())
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org_id
    order by
      -- Donos e admins primeiro; depois por data de entrada.
      case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      m.created_at;
end;
$$;

grant execute on function public.list_org_members(uuid) to authenticated;

-- =============================================================================
-- RPC: convidar por e-mail
--
-- A pessoa precisa já ter conta: o cadastro é feito por ela mesma, e não faz
-- sentido o sistema criar contas em nome de terceiros a partir daqui. Se não
-- existir, devolvemos um aviso claro em vez de um erro genérico.
-- =============================================================================
create or replace function public.invite_member_by_email(
  p_org_id uuid,
  p_email  text,
  p_role   text default 'member'
)
returns table (outcome text, message text, user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not (public.org_role(p_org_id) in ('owner', 'admin') or public.is_super_admin()) then
    raise exception 'Sem permissão para gerenciar a equipe desta empresa'
      using errcode = '42501';
  end if;

  if p_role not in ('owner', 'admin', 'member', 'viewer') then
    raise exception 'Papel inválido: %', p_role using errcode = '22023';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    return query select
      'not_found'::text,
      'Não encontramos uma conta com esse e-mail. A pessoa precisa se cadastrar antes de ser adicionada.'::text,
      null::uuid;
    return;
  end if;

  -- `m.user_id` qualificado: a coluna de retorno `user_id` tem o mesmo nome e
  -- o Postgres recusa a referência ambígua.
  if exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id and m.user_id = v_user_id
  ) then
    return query select
      'already_member'::text,
      'Essa pessoa já faz parte da equipe.'::text,
      v_user_id;
    return;
  end if;

  insert into public.memberships (org_id, user_id, role)
  values (p_org_id, v_user_id, p_role);

  return query select
    'added'::text,
    'Membro adicionado com sucesso.'::text,
    v_user_id;
end;
$$;

grant execute on function public.invite_member_by_email(uuid, text, text) to authenticated;

-- =============================================================================
-- RPC: listar todas as empresas da plataforma (apenas super_admin)
-- Devolve também quem é o responsável e quantos membros a empresa tem, para a
-- tela de administração global.
-- =============================================================================
create or replace function public.list_all_organizations()
returns table (
  id            uuid,
  name          text,
  document      text,
  segment       text,
  is_archived   boolean,
  created_at    timestamptz,
  owner_email   text,
  member_count  bigint,
  entry_count   bigint,
  is_mine       boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Apenas administradores da plataforma podem listar todas as empresas'
      using errcode = '42501';
  end if;

  return query
    select
      o.id,
      o.name,
      o.document,
      o.segment,
      o.is_archived,
      o.created_at,
      coalesce(owner_u.email, creator.email, '—')::text,
      (select count(*) from public.memberships m where m.org_id = o.id),
      (select count(*) from public.entries e where e.org_id = o.id),
      exists (
        select 1 from public.memberships m2
        where m2.org_id = o.id and m2.user_id = auth.uid()
      )
    from public.organizations o
    left join auth.users creator on creator.id = o.created_by
    left join lateral (
      select u.email
      from public.memberships m
      join auth.users u on u.id = m.user_id
      where m.org_id = o.id and m.role = 'owner'
      order by m.created_at
      limit 1
    ) owner_u on true
    order by o.is_archived, o.name;
end;
$$;

grant execute on function public.list_all_organizations() to authenticated;

-- =============================================================================
-- RPC: conceder/revogar admin global
-- =============================================================================
create or replace function public.set_super_admin(
  p_email   text,
  p_enabled boolean default true
)
returns table (outcome text, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Apenas administradores da plataforma podem alterar este privilégio'
      using errcode = '42501';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;

  if v_user_id is null then
    return query select 'not_found'::text, 'Nenhuma conta com esse e-mail.'::text;
    return;
  end if;

  if p_enabled then
    insert into public.platform_admins (user_id, granted_by)
    values (v_user_id, auth.uid())
    on conflict (user_id) do nothing;
    return query select 'granted'::text, 'Privilégio concedido.'::text;
  else
    -- Impede que o último admin se remova e deixe o sistema sem administração.
    if (select count(*) from public.platform_admins) <= 1 then
      return query select
        'last_admin'::text,
        'Não é possível revogar o último administrador da plataforma.'::text;
      return;
    end if;

    delete from public.platform_admins where user_id = v_user_id;
    return query select 'revoked'::text, 'Privilégio revogado.'::text;
  end if;
end;
$$;

grant execute on function public.set_super_admin(text, boolean) to authenticated;
