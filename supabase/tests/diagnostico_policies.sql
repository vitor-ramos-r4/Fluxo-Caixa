-- Diagnóstico: lista as policies realmente aplicadas em `organizations`.
-- Rodar no SQL Editor do Supabase.
select
  policyname,
  cmd,
  permissive,
  roles::text,
  qual       as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'organizations'
order by cmd, policyname;
