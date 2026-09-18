-- =============================================================================
-- Correção: CNPJ duplicado entre contas diferentes
-- =============================================================================
-- O índice único de `document` era global. Consequência: se alguém cadastrasse
-- um CNPJ já usado por outra pessoa, o insert falhava — e a mensagem revelava
-- que aquele documento existia em outra conta.
--
-- Dois problemas nisso:
--   1. Privacidade: permite descobrir se um CNPJ está na base, cadastrando-o.
--   2. Bloqueio real: quem tem o CNPJ legítimo não consegue usá-lo só porque
--      outra conta o cadastrou antes.
--
-- A regra correta é "um documento por usuário", não "um documento no sistema
-- inteiro". Um contador pode ter vários clientes; cada usuário tem a própria
-- base. Passamos a considerar o autor da empresa na chave.
--
-- Como o índice antigo já pode ter impedido cadastros legítimos, ele é
-- removido. A validação passa a ser feita por conta.
-- =============================================================================

drop index if exists public.organizations_document_key;

-- Um mesmo usuário não pode cadastrar o mesmo documento duas vezes.
create unique index if not exists organizations_owner_document_key
  on public.organizations (created_by, document)
  where document is not null and is_archived = false;

comment on index public.organizations_owner_document_key is
  'Impede que o mesmo usuário cadastre o mesmo CNPJ/CPF duas vezes. Contas diferentes podem ter o mesmo documento.';
