-- Reproduz o cenario exato: usuario cria empresa e le a linha de volta.
\set ON_ERROR_STOP on
insert into auth.users (id,email) values ('55555555-5555-5555-5555-555555555555','teste@fix.test')
on conflict do nothing;

set role authenticated;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

-- INSERT ... RETURNING simula o .select().single() do PostgREST.
with nova as (
  insert into public.organizations (name, document, opening_balance, created_by)
  values ('Empresa Teste','11222333000199',5000,'55555555-5555-5555-5555-555555555555')
  returning id, name
)
select case when count(*) = 1
       then 'OK  insert + returning funcionou'
       else 'FALHA: returning vazio' end as resultado
from nova;
