-- ============================================================
-- 009_dre_gorjeta_mensal.sql
-- Gorjeta recebida, paga, retenção e encargos — Jan–Dez 2026
-- (Jan–Abr = realizado; Mai–Dez = projeção da planilha)
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dre_gorjeta_mensal (
  id                serial PRIMARY KEY,
  mes_ano           varchar(7)  NOT NULL UNIQUE,
  gorjeta_recebida  numeric,
  gorjeta_paga      numeric,
  retencao          numeric,
  ferias            numeric,
  decimo_terceiro   numeric,
  fgts              numeric,
  inss              numeric,
  encargos_total    numeric,
  criado_em         timestamptz DEFAULT now()
);

ALTER TABLE public.dre_gorjeta_mensal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dre_gorjeta_read" ON public.dre_gorjeta_mensal;
CREATE POLICY "dre_gorjeta_read" ON public.dre_gorjeta_mensal FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "dre_gorjeta_manage" ON public.dre_gorjeta_mensal;
CREATE POLICY "dre_gorjeta_manage" ON public.dre_gorjeta_mensal FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.dre_gorjeta_mensal
  (mes_ano, gorjeta_recebida, gorjeta_paga, retencao, ferias, decimo_terceiro, fgts, inss, encargos_total)
VALUES
('2026-1',225671.23,151199.72,74471.51,16798.29,12594.94,14447.44,46592.98,90433.64),
('2026-2',346397.62,232086.41,114311.22,25784.8,19332.8,22176.32,74845.08,142139.0),
('2026-3',349098.32,233895.87,115202.44,25985.83,19483.53,22349.22,75428.61,143247.19),
('2026-4',358175.59,239977.64,118197.94,26661.52,19990.14,22930.34,77389.91,146971.91),
('2026-5',402573.98,269724.57,132849.41,29966.4,22468.06,25772.72,86982.94,165190.12),
('2026-6',341348.7,228703.63,112645.07,25408.97,19051.01,21853.09,73754.18,140067.25),
('2026-7',329398.24,220696.82,108701.42,24519.42,18384.05,21088.02,71172.08,135163.56),
('2026-8',336939.22,225749.27,111189.94,25080.74,18804.91,21570.79,72801.43,138257.89),
('2026-9',332791.57,222970.35,109821.22,24772.01,18573.43,21305.26,71905.26,136555.96),
('2026-10',323307.47,216616.01,106691.47,24066.04,18044.11,20698.09,69856.06,132664.31),
('2026-11',382185.48,256064.27,126121.21,28448.74,21330.15,24467.45,82577.66,156824.0),
('2026-12',271999.01,182239.34,89759.67,20246.79,15180.54,17413.33,58770.0,111610.66)
ON CONFLICT (mes_ano) DO UPDATE SET
  gorjeta_recebida = EXCLUDED.gorjeta_recebida,
  gorjeta_paga     = EXCLUDED.gorjeta_paga,
  retencao         = EXCLUDED.retencao,
  ferias           = EXCLUDED.ferias,
  decimo_terceiro  = EXCLUDED.decimo_terceiro,
  fgts             = EXCLUDED.fgts,
  inss             = EXCLUDED.inss,
  encargos_total   = EXCLUDED.encargos_total;
