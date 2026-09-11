-- ============================================================
-- 202609100023_fornecedores_depara_nome_literal.sql
-- FASE 7: fornecedores_depara.nome_origem estava gravado em caixa
-- original (ex. "Jahu - Sao Paulo") -- qualquer consulta que compare com
-- upper(trim()) (como o diagnostico de fornecedor que regrediu) nao
-- encontra a linha, mesmo ela existindo. Daqui pra frente nome_origem
-- e SEMPRE upper(trim()); nome_origem_literal guarda o texto como veio
-- da fonte, pra exibir na tela sem perder a grafia original.
-- Normaliza as linhas existentes (dedup defensivo antes do UPDATE, caso
-- duas grafias diferentes colidam depois de normalizadas).
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

ALTER TABLE public.fornecedores_depara ADD COLUMN nome_origem_literal text;

UPDATE public.fornecedores_depara
SET nome_origem_literal = nome_origem
WHERE nome_origem_literal IS NULL;

DELETE FROM public.fornecedores_depara a
USING public.fornecedores_depara b
WHERE a.id > b.id
  AND a.origem = b.origem
  AND upper(trim(a.nome_origem)) = upper(trim(b.nome_origem));

UPDATE public.fornecedores_depara
SET nome_origem = upper(trim(nome_origem));

ALTER TABLE public.fornecedores_depara ALTER COLUMN nome_origem_literal SET NOT NULL;

NOTIFY pgrst, 'reload schema';
