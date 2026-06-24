-- ============================================================
-- 021_vendas_consolidado_movimento.sql
-- Análise de Vendas: resumo operacional + seções consolidadas extraídas do
-- PDF de MOVIMENTO de um período longo (totais do período, não por dia).
-- Todas as tabelas referenciam vendas_consolidado_periodo(id).
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

-- ── Resumo operacional do período (1 linha por período) ───────────────────────
CREATE TABLE IF NOT EXISTS public.vendas_consolidado_resumo (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id        uuid    NOT NULL REFERENCES public.vendas_consolidado_periodo (id) ON DELETE CASCADE,
  acessos           integer,
  permanencia_media text,
  ticket_medio      numeric,
  ticket_real       numeric,
  bruto             numeric,
  produto           numeric,
  custo             numeric,
  desconto          numeric,
  gorjeta           numeric,
  convite           numeric,
  lucro             numeric,
  entrada           numeric,
  consumo           numeric,
  devedor           numeric,
  pgto_fechado      numeric,
  pgto_recebido     numeric,   -- usado como "Receita Bruta do período"
  pgto_diferenca    numeric,
  cash              numeric,
  card              numeric,
  pix               numeric
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vcr_periodo ON public.vendas_consolidado_resumo (periodo_id);

-- ── Faturamento mês a mês ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendas_consolidado_mensal (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id   uuid    NOT NULL REFERENCES public.vendas_consolidado_periodo (id) ON DELETE CASCADE,
  mes          text    NOT NULL,         -- ex: "Jan/2026"
  ordem        integer,
  bruto        numeric,
  liquido      numeric,
  clientes     integer,
  ticket_medio numeric
);
CREATE INDEX IF NOT EXISTS idx_vcmensal_periodo ON public.vendas_consolidado_mensal (periodo_id, ordem);

-- ── Por turno ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendas_consolidado_turno (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id       uuid    NOT NULL REFERENCES public.vendas_consolidado_periodo (id) ON DELETE CASCADE,
  turno            text    NOT NULL,
  bruto            numeric,
  clientes         integer,
  ticket_medio     numeric,
  participacao_pct numeric
);
CREATE INDEX IF NOT EXISTS idx_vcturno_periodo ON public.vendas_consolidado_turno (periodo_id);

-- ── Por dia da semana ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendas_consolidado_dia_semana (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id   uuid    NOT NULL REFERENCES public.vendas_consolidado_periodo (id) ON DELETE CASCADE,
  dia_semana   text    NOT NULL,         -- Dom..Sáb
  ordem        integer,
  bruto        numeric,
  clientes     integer,
  ticket_medio numeric
);
CREATE INDEX IF NOT EXISTS idx_vcdia_periodo ON public.vendas_consolidado_dia_semana (periodo_id, ordem);

-- ── Por ambiente ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendas_consolidado_ambiente (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id       uuid    NOT NULL REFERENCES public.vendas_consolidado_periodo (id) ON DELETE CASCADE,
  ambiente         text    NOT NULL,
  bruto            numeric,
  clientes         integer,
  participacao_pct numeric
);
CREATE INDEX IF NOT EXISTS idx_vcamb_periodo ON public.vendas_consolidado_ambiente (periodo_id);

-- ── Funcionários (top 40 por bruto) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendas_consolidado_funcionarios (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id  uuid    NOT NULL REFERENCES public.vendas_consolidado_periodo (id) ON DELETE CASCADE,
  funcionario text    NOT NULL,
  bruto       numeric,
  qtd_vendas  integer
);
CREATE INDEX IF NOT EXISTS idx_vcfunc_periodo ON public.vendas_consolidado_funcionarios (periodo_id, bruto DESC);

-- ── RLS (leitura anon/authenticated, escrita service_role) ────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vendas_consolidado_resumo',
    'vendas_consolidado_mensal',
    'vendas_consolidado_turno',
    'vendas_consolidado_dia_semana',
    'vendas_consolidado_ambiente',
    'vendas_consolidado_funcionarios'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_read" ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY "%s_read" ON public.%I FOR SELECT TO authenticated, anon USING (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_manage" ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY "%s_manage" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', t, t);
  END LOOP;
END $$;
