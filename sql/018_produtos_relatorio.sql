-- ============================================================
-- 018_produtos_relatorio.sql
-- Tabela de Relatório de Produtos (CMV detalhado por DANFE)
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.produtos_relatorio (
  id                  BIGSERIAL PRIMARY KEY,
  unit_id             UUID          NOT NULL,
  fornecedor_nome     TEXT,
  nr_danfe            TEXT,
  v_total_danfe       NUMERIC(14,4),
  dt_emissao          TEXT,
  item_codigo         TEXT,
  item_descricao      TEXT,
  unidade_medida      TEXT,
  tipo_item           TEXT,
  q_embalagem         NUMERIC(14,4),
  q_estoque           NUMERIC(14,4),
  v_embalagem         NUMERIC(14,4),
  v_total_embalagem   NUMERIC(14,4),
  v_custo_medio       NUMERIC(14,4),
  v_custo_compra      NUMERIC(14,4),
  v_custo_total       NUMERIC(14,4),
  perc_variacao       NUMERIC(10,4),
  calcula_cmv         BOOLEAN,
  fornecedor_codigo   TEXT,
  codigo_gerencial    TEXT,
  desc_gerencial      TEXT,
  mes_lancamento      INTEGER       NOT NULL,
  ano_lancamento      INTEGER       NOT NULL,
  criado_em           TIMESTAMPTZ   DEFAULT now(),

  CONSTRAINT produtos_relatorio_upsert_key
    UNIQUE NULLS NOT DISTINCT (unit_id, nr_danfe, item_codigo, mes_lancamento, ano_lancamento)
);

CREATE INDEX IF NOT EXISTS idx_produtos_relatorio_unit_mes
  ON public.produtos_relatorio(unit_id, ano_lancamento, mes_lancamento);

CREATE INDEX IF NOT EXISTS idx_produtos_relatorio_categoria
  ON public.produtos_relatorio(unit_id, desc_gerencial);

ALTER TABLE public.produtos_relatorio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "produtos_read"   ON public.produtos_relatorio;
DROP POLICY IF EXISTS "produtos_manage" ON public.produtos_relatorio;

CREATE POLICY "produtos_read"
  ON public.produtos_relatorio FOR SELECT
  TO authenticated, anon USING (true);

CREATE POLICY "produtos_manage"
  ON public.produtos_relatorio FOR ALL
  TO service_role USING (true) WITH CHECK (true);
