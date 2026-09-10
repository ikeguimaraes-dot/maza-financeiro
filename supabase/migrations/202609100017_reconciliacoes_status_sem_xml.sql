-- ============================================================
-- 202609100017_reconciliacoes_status_sem_xml.sql
-- FASE 7 PASSO 3: título com N.F. NUMERO que não bate com nenhuma
-- nfe_documentos (a nota existe, mas o XML não foi importado) precisa de
-- um status próprio pro Ike saber quais XMLs faltam — 'sugerida' (o fuzzy
-- match antigo, incerto) e 'confirmada' (bate com NF-e, dedup) não servem
-- pra esse caso.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

ALTER TABLE public.reconciliacoes_sugeridas DROP CONSTRAINT reconciliacoes_sugeridas_status_check;
ALTER TABLE public.reconciliacoes_sugeridas ADD CONSTRAINT reconciliacoes_sugeridas_status_check
  CHECK (status = ANY (ARRAY['sugerida', 'confirmada', 'rejeitada', 'sem_xml']));

NOTIFY pgrst, 'reload schema';
