-- ============================================================
-- 020_vendas_consolidado.sql
-- Análise de Vendas: relatório CONSOLIDADO de produtos por período
-- (mesmos 3 PDFs do Lorean — Movimento, Venda, Caixa — porém somados
--  ao longo de um período inteiro, sem granularidade de workday/dia/turno).
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

-- ── Período consolidado ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendas_consolidado_periodo (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id       uuid        NOT NULL,
  data_inicio   date        NOT NULL,
  data_fim      date        NOT NULL,
  label         text        NOT NULL,                 -- ex: "Jan-Jun 2026"
  importado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vcp_unit ON public.vendas_consolidado_periodo (unit_id, data_inicio DESC);

-- ── Produtos do período ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendas_consolidado_produtos (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id       uuid    NOT NULL REFERENCES public.vendas_consolidado_periodo (id) ON DELETE CASCADE,
  grupo            text,
  produto          text    NOT NULL,
  quantidade       numeric,
  valor_bruto      numeric,
  valor_desconto   numeric,
  valor_liquido    numeric,
  participacao_pct numeric                            -- % do valor_liquido sobre o total do período
);

CREATE INDEX IF NOT EXISTS idx_vcprod_periodo ON public.vendas_consolidado_produtos (periodo_id, valor_liquido DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.vendas_consolidado_periodo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_consolidado_produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vcp_read" ON public.vendas_consolidado_periodo;
CREATE POLICY "vcp_read"
  ON public.vendas_consolidado_periodo FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "vcp_manage" ON public.vendas_consolidado_periodo;
CREATE POLICY "vcp_manage"
  ON public.vendas_consolidado_periodo FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "vcprod_read" ON public.vendas_consolidado_produtos;
CREATE POLICY "vcprod_read"
  ON public.vendas_consolidado_produtos FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "vcprod_manage" ON public.vendas_consolidado_produtos;
CREATE POLICY "vcprod_manage"
  ON public.vendas_consolidado_produtos FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
