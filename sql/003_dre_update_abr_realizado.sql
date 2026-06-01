-- ============================================================
-- 003_dre_update_abr_realizado.sql
-- Corrige Abril realizado: receita_bruta = soma B.Receita (mais precisa)
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

UPDATE public.dre_mensal
SET receita_bruta = 2304709.57
WHERE mes_ano = '2026-4' AND tipo = 'realizado';
