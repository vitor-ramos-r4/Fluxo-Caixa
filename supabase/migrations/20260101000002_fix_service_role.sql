-- =============================================================================
-- Correção: reconhecer `service_role` nas checagens de permissão
-- =============================================================================
-- As funções `is_org_member` e `can_edit_org` comparavam apenas com
-- `memberships`. Como a chave de serviço não tem vínculo cadastrado, qualquer
-- RPC que validasse permissão falhava com "Sem permissão para movimentar esta
-- empresa" — inclusive `create_transfer` e `seed_demo_data` chamadas por
-- scripts administrativos.
--
-- A cláusula abaixo trata `service_role` como confiável. Para os demais papéis
-- nada muda: continua valendo o vínculo em `memberships`, e um usuário sem
-- vínculo segue bloqueado.
-- =============================================================================

create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or (auth.jwt() ->> 'role') = 'service_role',
    false
  );
$$;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_service_role() or exists (
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
  select public.is_service_role() or exists (
    select 1
    from public.memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'member')
  );
$$;

grant execute on function public.is_service_role() to authenticated, service_role;
