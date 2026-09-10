-- ============================================================
-- 202609100016_kpi_snapshot_resultado_liquido.sql
-- resultado_liquido = ebitda − financeiro − imposto_lucro. Fica abaixo do
-- EBITDA no Cockpit (8º card) — IRPJ/CSLL e despesas financeiras não
-- afetam EBITDA nem os percentuais que usam receita líquida como base.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

ALTER TABLE public.kpi_snapshot
  ADD COLUMN resultado_liquido numeric;

NOTIFY pgrst, 'reload schema';
