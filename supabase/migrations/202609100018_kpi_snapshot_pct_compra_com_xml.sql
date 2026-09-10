-- ============================================================
-- 202609100018_kpi_snapshot_pct_compra_com_xml.sql
-- FASE 7 GATE 3 (ACHADO 3): confianca_pct estava travado em ~0,653 em
-- todos os meses/unidades porque só olhava classificação de conta e saúde
-- global das fontes — nada sensível à cobertura real de XML por mês (maio,
-- sem nenhuma NF-e, tinha a mesma confiança de junho, com 543 notas).
-- Nova coluna guarda o terceiro termo (CMV vindo de origem='nfe_entrada'
-- ÷ CMV total) ao lado de pct_classificado e fontes_ok/fontes_total, no
-- mesmo padrão de transparência já usado pros outros dois termos.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

ALTER TABLE public.kpi_snapshot ADD COLUMN pct_compra_com_xml numeric;

NOTIFY pgrst, 'reload schema';
