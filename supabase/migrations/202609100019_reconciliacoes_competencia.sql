-- ============================================================
-- 202609100019_reconciliacoes_competencia.sql
-- FASE 7 GATE 3: gerarLancamentosTitulos() e idempotente pra lancamentos
-- (delete + insert do escopo) mas so fazia upsert em
-- reconciliacoes_sugeridas -- toda vez que a logica de match muda, sobra
-- lixo (21 linhas 'confirmada' obsoletas do ACHADO 4 sao exemplo disso).
-- Adiciona competencia pra permitir delete por escopo (unit_id +
-- competencia), preservando status='rejeitada' (decisao humana).
-- Backfill: usa titulos_a_pagar.d_competencia, ou o mes de d_vencimento
-- quando nula -- mesma regra de gerarLancamentosTitulos().
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

ALTER TABLE public.reconciliacoes_sugeridas ADD COLUMN competencia date;

UPDATE public.reconciliacoes_sugeridas r
SET competencia = date_trunc('month', coalesce(t.d_competencia, t.d_vencimento))::date
FROM public.titulos_a_pagar t
WHERE t.id::text = r.titulo_id
  AND r.competencia IS NULL;

NOTIFY pgrst, 'reload schema';
