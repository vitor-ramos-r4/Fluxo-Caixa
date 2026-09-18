-- =============================================================================
-- Módulo de usuários: listagem e administração de permissões
-- =============================================================================
-- Faltava a contraparte da tela de Empresas: uma visão centrada em PESSOAS.
-- A tela de Equipe responde "quem acessa esta empresa?"; esta responde
-- "quais empresas esta pessoa acessa?" — que é a pergunta de quem administra.
--
-- Dois públicos usam as mesmas funções, com alcances diferentes:
--
--   · super_admin      — vê todos os usuários da plataforma e administra
--                        qualquer vínculo, em qualquer empresa.
--   · admin da empresa — vê os usuários que participam das empresas que ele
--                        administra, e só mexe nesses vínculos.
--
-- O recorte é aplicado no banco, não na interface: quem não é super_admin
-- recebe apenas as pessoas com quem já compartilha alguma empresa.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- list_users — pessoas visíveis para quem consulta
-- -----------------------------------------------------------------------------
create or replace function public.list_users()
returns table (
  user_id        uuid,
  email          text,
  full_name      text,
  is_super_admin boolean,
  created_at     timestamptz,
  last_sign_in   timestamptz,
  org_count      bigint,
  is_self        boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_super boolean := public.is_super_admin();
begin
  -- Sem privilégio global, é preciso administrar ao menos uma empresa.
  if not v_super and not exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.role in ('owner', 'admin')
  ) then
    raise exception 'Sem permissão para listar usuários' using errcode = '42501';
  end if;

  return query
    select
      u.id,
      u.email::text,
      coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))::text,
      exists (select 1 from public.platform_admins pa where pa.user_id = u.id),
      u.created_at,
      u.last_sign_in_at,
      (
        select count(*) from public.memberships m2 where m2.user_id = u.id
      ),
      (u.id = auth.uid())
    from auth.users u
    where
      -- O admin global enxerga todo mundo.
      v_super
      -- Os demais enxergam apenas quem compartilha uma empresa que administram,
      -- e também a si mesmos.
      or u.id = auth.uid()
      or exists (
        select 1
        from public.memberships alvo
        join public.memberships meu on meu.org_id = alvo.org_id
        where alvo.user_id = u.id
          and meu.user_id = auth.uid()
          and meu.role in ('owner', 'admin')
      )
    order by
      -- Quem administra a plataforma primeiro, depois por data de cadastro.
      exists (select 1 from public.platform_admins pa where pa.user_id = u.id) desc,
      u.created_at;
end;
$$;

grant execute on function public.list_users() to authenticated;

-- -----------------------------------------------------------------------------
-- list_user_memberships — empresas de uma pessoa
--
-- Devolve apenas as empresas sobre as quais quem consulta tem autoridade:
-- o super_admin vê todas; o admin de empresa vê as que administra.
-- -----------------------------------------------------------------------------
create or replace function public.list_user_memberships(p_user_id uuid)
returns table (
  membership_id uuid,
  org_id        uuid,
  org_name      text,
  role          text,
  granted_at    timestamptz,
  can_manage    boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_super boolean := public.is_super_admin();
begin
  if not v_super and not exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.role in ('owner', 'admin')
  ) then
    raise exception 'Sem permissão para consultar vínculos' using errcode = '42501';
  end if;

  return query
    select
      m.id,
      m.org_id,
      o.name,
      m.role,
      m.created_at,
      -- `can_manage` evita a interface oferecer uma ação que o banco negaria.
      (v_super or public.org_role(m.org_id) in ('owner', 'admin'))
    from public.memberships m
    join public.organizations o on o.id = m.org_id
    where m.user_id = p_user_id
      and (
        v_super
        or public.org_role(m.org_id) in ('owner', 'admin')
      )
    order by o.name;
end;
$$;

grant execute on function public.list_user_memberships(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- grant_org_access — adiciona alguém a uma empresa pelo e-mail
--
-- Substitui o antigo `invite_member_by_email` para receber também o nome do
-- usuário-alvo, e assim funcionar tanto a partir da empresa quanto do usuário.
-- -----------------------------------------------------------------------------
create or replace function public.grant_org_access(
  p_user_id uuid,
  p_org_id  uuid,
  p_role    text default 'member'
)
returns table (outcome text, message text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.org_role(p_org_id) in ('owner', 'admin') or public.is_super_admin()) then
    raise exception 'Sem permissão para gerenciar o acesso a esta empresa'
      using errcode = '42501';
  end if;

  if p_role not in ('owner', 'admin', 'member', 'viewer') then
    raise exception 'Papel inválido: %', p_role using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    return query select 'not_found'::text, 'Usuário não encontrado.'::text;
    return;
  end if;

  if exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id and m.user_id = p_user_id
  ) then
    return query select
      'already_member'::text,
      'Essa pessoa já tem acesso a esta empresa.'::text;
    return;
  end if;

  insert into public.memberships (org_id, user_id, role)
  values (p_org_id, p_user_id, p_role);

  return query select 'granted'::text, 'Acesso concedido.'::text;
end;
$$;

grant execute on function public.grant_org_access(uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- revoke_org_access — remove o vínculo
--
-- Duas proteções: ninguém remove a si mesmo (evita perder o acesso por
-- engano) e não se remove o último proprietário de uma empresa (evita deixá-la
-- sem administração).
-- -----------------------------------------------------------------------------
create or replace function public.revoke_org_access(p_membership_id uuid)
returns table (outcome text, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_user uuid;
  v_role text;
  v_owners integer;
begin
  select m.org_id, m.user_id, m.role
    into v_org, v_user, v_role
  from public.memberships m
  where m.id = p_membership_id;

  if v_org is null then
    return query select 'not_found'::text, 'Vínculo não encontrado.'::text;
    return;
  end if;

  if not (public.org_role(v_org) in ('owner', 'admin') or public.is_super_admin()) then
    raise exception 'Sem permissão para gerenciar o acesso a esta empresa'
      using errcode = '42501';
  end if;

  if v_user = auth.uid() then
    return query select
      'self'::text,
      'Você não pode remover o próprio acesso.'::text;
    return;
  end if;

  if v_role = 'owner' then
    select count(*) into v_owners
    from public.memberships m
    where m.org_id = v_org and m.role = 'owner';

    if v_owners <= 1 then
      return query select
        'last_owner'::text,
        'Esta empresa ficaria sem proprietário. Defina outro antes de remover.'::text;
      return;
    end if;
  end if;

  delete from public.memberships where id = p_membership_id;

  return query select 'revoked'::text, 'Acesso removido.'::text;
end;
$$;

grant execute on function public.revoke_org_access(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- set_member_role — troca o papel dentro de uma empresa
-- -----------------------------------------------------------------------------
create or replace function public.set_member_role(
  p_membership_id uuid,
  p_role          text
)
returns table (outcome text, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_role text;
  v_owners integer;
begin
  select m.org_id, m.role into v_org, v_role
  from public.memberships m
  where m.id = p_membership_id;

  if v_org is null then
    return query select 'not_found'::text, 'Vínculo não encontrado.'::text;
    return;
  end if;

  if not (public.org_role(v_org) in ('owner', 'admin') or public.is_super_admin()) then
    raise exception 'Sem permissão para alterar papéis nesta empresa'
      using errcode = '42501';
  end if;

  if p_role not in ('owner', 'admin', 'member', 'viewer') then
    raise exception 'Papel inválido: %', p_role using errcode = '22023';
  end if;

  -- Rebaixar o último proprietário deixaria a empresa sem administração.
  if v_role = 'owner' and p_role <> 'owner' then
    select count(*) into v_owners
    from public.memberships m
    where m.org_id = v_org and m.role = 'owner';

    if v_owners <= 1 then
      return query select
        'last_owner'::text,
        'Esta empresa ficaria sem proprietário. Promova outra pessoa antes.'::text;
      return;
    end if;
  end if;

  update public.memberships set role = p_role where id = p_membership_id;

  return query select 'updated'::text, 'Papel atualizado.'::text;
end;
$$;

grant execute on function public.set_member_role(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Mantém `list_org_members` (usada pela tela de Equipe) apontando para as
-- mesmas regras, agora que existem mais formas de alterar um vínculo.
-- -----------------------------------------------------------------------------
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
      case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      m.created_at;
end;
$$;

grant execute on function public.list_org_members(uuid) to authenticated;
