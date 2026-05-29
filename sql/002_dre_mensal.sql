-- ============================================================
-- 002_dre_mensal.sql
-- DRE Gerencial: Orçado vs Realizado (Jan–Abr 2026)
-- Fonte: BASE_BD X REAL Abril_04.xlsx · aba "03- BD x RE 2026"
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

-- ── Tabela ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dre_mensal (
  id              serial PRIMARY KEY,
  mes_ano         varchar(7)  NOT NULL,                   -- "2026-1" … "2026-12"
  tipo            varchar(20) NOT NULL CHECK (tipo IN ('orcado', 'realizado')),
  receita_bruta   numeric,
  cmv             numeric,
  pessoal         numeric,
  ocupacao        numeric,
  utilidades      numeric,
  operacao        numeric,
  manutencao      numeric,
  administrativa  numeric,
  marketing       numeric,
  taxa_cartao     numeric,
  impostos        numeric,
  ebitda          numeric,
  resultado_liquido numeric,
  clientes        integer,
  ticket_medio    numeric,
  criado_em       timestamptz DEFAULT now(),
  UNIQUE (mes_ano, tipo)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.dre_mensal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dre_mensal_read" ON public.dre_mensal;
CREATE POLICY "dre_mensal_read"
  ON public.dre_mensal FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "dre_mensal_manage" ON public.dre_mensal;
CREATE POLICY "dre_mensal_manage"
  ON public.dre_mensal FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ── Dados extraídos da planilha ───────────────────────────────────────────────
-- Valores em R$ (reais inteiros). Custos têm sinal negativo.

INSERT INTO public.dre_mensal
  (mes_ano, tipo, receita_bruta, impostos, cmv, pessoal, ocupacao,
   utilidades, operacao, manutencao, administrativa, marketing,
   taxa_cartao, ebitda, resultado_liquido, clientes, ticket_medio)
VALUES

-- ── Janeiro 2026 ─────────────────────────────────────────────────────────────
('2026-1','orcado',
  1735932.54, -132798.84, -513002.79, -552193.44, -63668.00,
  -43284.61,  -180339.11, -16031.34,  -172743.90, -32062.67,
  -33720.49,  -3912.64,   -16064.17,   5786,       300.00),

('2026-1','realizado',
  1390348.97, -51487.25,  -600857.50, -358659.69, -61112.86,
  -52795.14,  -208148.95, -50127.13,  -160621.07, -73694.50,
  -17515.18,  -244670.30, -246975.82,  4761,       289.76),

-- ── Fevereiro 2026 ───────────────────────────────────────────────────────────
('2026-2','orcado',
  2664597.09, -203841.68, -787441.73, -687143.70, -71735.66,
  -58796.81,  -195316.67, -21776.60,  -187494.99, -49215.11,
  -49215.11,   352619.03,  333966.85,  7860,       300.00),

('2026-2','realizado',
  1528554.06, -21426.81,  -527469.52, -506750.72, -69633.92,
  -55997.45,  -221468.45, -26855.80,  -143661.06, -42956.53,
  -18701.31,  -107619.97, -108396.03,  4661,       312.20),

-- ── Março 2026 ───────────────────────────────────────────────────────────────
('2026-3','orcado',
  2693404.65, -205430.93, -793581.04, -679825.89, -71735.66,
  -59255.22,  -195562.24, -21946.38,  -187824.98, -49598.81,
  -46162.25,   382481.25,  363683.65,  7921,       300.00),

('2026-3','realizado',
  2443536.75, -59924.54,  -649970.13, -611375.76, -69180.52,
  -53378.87,  -238262.48, -18412.43,  -172246.94, -34777.84,
  -26100.82,   508765.52,  508314.52,  6592,       317.16),

-- ── Abril 2026 ───────────────────────────────────────────────────────────────
('2026-4','orcado',
  2755196.83, -210772.56, -814215.77, -687143.70, -71735.66,
  -60795.98,  -196387.63, -22517.03,  -188934.10, -50888.49,
  -47362.56,   404443.36,  385156.98,  8127,       300.00),

('2026-4','realizado',
  2296285.60,  NULL,       -895627.39, -589701.16, -69180.52,
  -60529.54,  -252889.37, -22298.67,  -109749.19, -65831.88,
  -25909.28,   204568.60,  204568.60,  NULL,       NULL)

ON CONFLICT (mes_ano, tipo) DO UPDATE SET
  receita_bruta     = EXCLUDED.receita_bruta,
  impostos          = EXCLUDED.impostos,
  cmv               = EXCLUDED.cmv,
  pessoal           = EXCLUDED.pessoal,
  ocupacao          = EXCLUDED.ocupacao,
  utilidades        = EXCLUDED.utilidades,
  operacao          = EXCLUDED.operacao,
  manutencao        = EXCLUDED.manutencao,
  administrativa    = EXCLUDED.administrativa,
  marketing         = EXCLUDED.marketing,
  taxa_cartao       = EXCLUDED.taxa_cartao,
  ebitda            = EXCLUDED.ebitda,
  resultado_liquido = EXCLUDED.resultado_liquido,
  clientes          = EXCLUDED.clientes,
  ticket_medio      = EXCLUDED.ticket_medio;
