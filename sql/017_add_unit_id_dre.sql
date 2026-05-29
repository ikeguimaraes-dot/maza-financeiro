-- ============================================================
-- 017_add_unit_id_dre.sql
-- Adiciona unit_id nas 13 tabelas dre_* e taga registros
-- existentes com o unit_id do Meet & Eat.
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

-- ── Passo 1: adicionar coluna unit_id ────────────────────────

ALTER TABLE public.dre_mensal             ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.dre_indicadores        ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.dre_receita_detalhada  ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.dre_despesa_detalhada  ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.dre_folha              ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.dre_gorjeta_mensal     ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.dre_faturamento_historico ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.dre_pessoal_detalhado  ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.dre_manutencao_detalhada ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.dre_prestadores        ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.dre_contratos_fixos    ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.dre_kpis_mensais       ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE dre_linhas_detalhadas         ADD COLUMN IF NOT EXISTS unit_id UUID;

-- ── Passo 2: tagar dados existentes com Meet & Eat ───────────

DO $$
DECLARE
  meet_eat_id UUID := '674eac8c-5a38-4a42-aa60-0a666387909b';
BEGIN
  UPDATE public.dre_mensal             SET unit_id = meet_eat_id WHERE unit_id IS NULL;
  UPDATE public.dre_indicadores        SET unit_id = meet_eat_id WHERE unit_id IS NULL;
  UPDATE public.dre_receita_detalhada  SET unit_id = meet_eat_id WHERE unit_id IS NULL;
  UPDATE public.dre_despesa_detalhada  SET unit_id = meet_eat_id WHERE unit_id IS NULL;
  UPDATE public.dre_folha              SET unit_id = meet_eat_id WHERE unit_id IS NULL;
  UPDATE public.dre_gorjeta_mensal     SET unit_id = meet_eat_id WHERE unit_id IS NULL;
  UPDATE public.dre_faturamento_historico SET unit_id = meet_eat_id WHERE unit_id IS NULL;
  UPDATE public.dre_pessoal_detalhado  SET unit_id = meet_eat_id WHERE unit_id IS NULL;
  UPDATE public.dre_manutencao_detalhada SET unit_id = meet_eat_id WHERE unit_id IS NULL;
  UPDATE public.dre_prestadores        SET unit_id = meet_eat_id WHERE unit_id IS NULL;
  UPDATE public.dre_contratos_fixos    SET unit_id = meet_eat_id WHERE unit_id IS NULL;
  UPDATE public.dre_kpis_mensais       SET unit_id = meet_eat_id WHERE unit_id IS NULL;
  UPDATE dre_linhas_detalhadas         SET unit_id = meet_eat_id WHERE unit_id IS NULL;
END $$;

-- ── Passo 3: índices de performance ─────────────────────────

CREATE INDEX IF NOT EXISTS idx_dre_mensal_unit_id             ON public.dre_mensal(unit_id);
CREATE INDEX IF NOT EXISTS idx_dre_indicadores_unit_id        ON public.dre_indicadores(unit_id);
CREATE INDEX IF NOT EXISTS idx_dre_receita_det_unit_id        ON public.dre_receita_detalhada(unit_id);
CREATE INDEX IF NOT EXISTS idx_dre_despesa_det_unit_id        ON public.dre_despesa_detalhada(unit_id);
CREATE INDEX IF NOT EXISTS idx_dre_folha_unit_id              ON public.dre_folha(unit_id);
CREATE INDEX IF NOT EXISTS idx_dre_gorjeta_unit_id            ON public.dre_gorjeta_mensal(unit_id);
CREATE INDEX IF NOT EXISTS idx_dre_historico_unit_id          ON public.dre_faturamento_historico(unit_id);
CREATE INDEX IF NOT EXISTS idx_dre_pessoal_det_unit_id        ON public.dre_pessoal_detalhado(unit_id);
CREATE INDEX IF NOT EXISTS idx_dre_manutencao_det_unit_id     ON public.dre_manutencao_detalhada(unit_id);
CREATE INDEX IF NOT EXISTS idx_dre_prestadores_unit_id        ON public.dre_prestadores(unit_id);
CREATE INDEX IF NOT EXISTS idx_dre_contratos_unit_id          ON public.dre_contratos_fixos(unit_id);
CREATE INDEX IF NOT EXISTS idx_dre_kpis_unit_id               ON public.dre_kpis_mensais(unit_id);
CREATE INDEX IF NOT EXISTS idx_dre_linhas_det_unit_id         ON dre_linhas_detalhadas(unit_id);

-- ── Passo 4: verificação final ───────────────────────────────

SELECT tabela, total, com_unit_id,
       CASE WHEN total = com_unit_id THEN '✅ OK' ELSE '❌ PENDENTE' END AS status
FROM (
  SELECT 'dre_mensal'               AS tabela, COUNT(*) AS total, COUNT(unit_id) AS com_unit_id FROM public.dre_mensal
  UNION ALL
  SELECT 'dre_indicadores',          COUNT(*), COUNT(unit_id) FROM public.dre_indicadores
  UNION ALL
  SELECT 'dre_receita_detalhada',    COUNT(*), COUNT(unit_id) FROM public.dre_receita_detalhada
  UNION ALL
  SELECT 'dre_despesa_detalhada',    COUNT(*), COUNT(unit_id) FROM public.dre_despesa_detalhada
  UNION ALL
  SELECT 'dre_folha',                COUNT(*), COUNT(unit_id) FROM public.dre_folha
  UNION ALL
  SELECT 'dre_gorjeta_mensal',       COUNT(*), COUNT(unit_id) FROM public.dre_gorjeta_mensal
  UNION ALL
  SELECT 'dre_faturamento_historico',COUNT(*), COUNT(unit_id) FROM public.dre_faturamento_historico
  UNION ALL
  SELECT 'dre_pessoal_detalhado',    COUNT(*), COUNT(unit_id) FROM public.dre_pessoal_detalhado
  UNION ALL
  SELECT 'dre_manutencao_detalhada', COUNT(*), COUNT(unit_id) FROM public.dre_manutencao_detalhada
  UNION ALL
  SELECT 'dre_prestadores',          COUNT(*), COUNT(unit_id) FROM public.dre_prestadores
  UNION ALL
  SELECT 'dre_contratos_fixos',      COUNT(*), COUNT(unit_id) FROM public.dre_contratos_fixos
  UNION ALL
  SELECT 'dre_kpis_mensais',         COUNT(*), COUNT(unit_id) FROM public.dre_kpis_mensais
  UNION ALL
  SELECT 'dre_linhas_detalhadas',    COUNT(*), COUNT(unit_id) FROM dre_linhas_detalhadas
) t
ORDER BY tabela;
