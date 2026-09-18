-- =============================================================================
-- Correção: criar empresa falhava com "new row violates row-level security"
-- =============================================================================
-- Sintoma: ao cadastrar uma empresa, a tela exibia
--   "Você não tem permissão para essa operação nesta empresa."
-- e a empresa não aparecia na listagem.
--
-- Causa: o cliente usa `.insert(...).select().single()` para receber a linha
-- criada. O PostgREST, ao devolver a linha, revalida a policy de SELECT —
-- e a policy exigia `is_org_member(id)`. O vínculo de `owner` é criado por um
-- trigger AFTER INSERT, então existia um instante em que a empresa já estava
-- gravada mas o vínculo ainda não, e a leitura de retorno era negada.
--
-- O INSERT em si sempre funcionou: a empresa era criada e o vínculo também.
-- A mensagem enganava, porque sugeria que nada havia sido gravado.
--
-- Correção: a policy de SELECT passa a aceitar o próprio autor da empresa.
-- É seguro — `created_by` é preenchido pelo cliente com `auth.uid()`, e a
-- policy de INSERT já garante que ninguém cria empresa em nome de outro.
-- =============================================================================

drop policy if exists organizations_select on public.organizations;

create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id) or created_by = auth.uid());

comment on policy organizations_select on public.organizations is
  'Membro vê a empresa; o autor também, para o retorno do INSERT funcionar.';
