-- ============================================================
-- 202609100008_kpi_snapshot_tem_folha.sql
-- kpi_snapshot já tem tem_nfe (sinaliza "sem CMV real" vs "CMV zero de
-- verdade"). mo_pct sofre do mesmo problema sem um sinal equivalente: um
-- mês sem lançamento de folha calcula mao_de_obra=0 e mo_pct=0, indistinguível
-- de mão de obra genuinamente zero. tem_folha resolve isso pro Cockpit.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

ALTER TABLE public.kpi_snapshot
  ADD COLUMN tem_folha boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
