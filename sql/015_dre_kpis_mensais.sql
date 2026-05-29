-- dre_kpis_mensais: métricas operacionais mensais da Base Realizado
CREATE TABLE IF NOT EXISTS public.dre_kpis_mensais (
  mes_ano             TEXT PRIMARY KEY,
  clientes            INTEGER,
  ticket_medio        NUMERIC,
  gorjetas_recebidas  NUMERIC,
  icms                NUMERIC,
  cofins              NUMERIC,
  pis                 NUMERIC,
  iss                 NUMERIC
);

ALTER TABLE public.dre_kpis_mensais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON public.dre_kpis_mensais FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.dre_kpis_mensais
  (mes_ano, clientes, ticket_medio, gorjetas_recebidas, icms, cofins, pis, iss)
VALUES
  ('2026-1', 4761, 289.76, 110797.62, -11603.07, -18007.73, -21876.45, 0),
  ('2026-2', 4661, 312.20, 198712.00, -15493.73,  -4877.08,  -1056.00, 0),
  ('2026-3', 6592, 317.16, 116627.58, -37427.25, -18490.92,  -4006.37, 0),
  ('2026-4', NULL,   NULL,      NULL,       0.00,      0.00,      0.00, 0)
ON CONFLICT (mes_ano) DO UPDATE SET
  clientes            = EXCLUDED.clientes,
  ticket_medio        = EXCLUDED.ticket_medio,
  gorjetas_recebidas  = EXCLUDED.gorjetas_recebidas,
  icms                = EXCLUDED.icms,
  cofins              = EXCLUDED.cofins,
  pis                 = EXCLUDED.pis,
  iss                 = EXCLUDED.iss;
