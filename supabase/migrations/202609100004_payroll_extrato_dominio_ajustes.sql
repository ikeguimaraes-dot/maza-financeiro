-- ============================================================
-- 202609100004_payroll_extrato_dominio_ajustes.sql
-- As 4 tabelas payroll_extrato_dominio_* vieram do clone sem unit_id nas
-- chaves — foram desenhadas pra uma empresa só (defaults hardcoded
-- '10131'/'46098368000135', CNPJ de outro cliente). Nosso caso tem duas
-- empresas (dois CNPJs) por competência, então as UNIQUE precisam de
-- unit_id pra não colidir entre IKY RESTAURANTES e MZ DELIVERY.
--
-- payroll_extrato_dominio_totais guarda totais POR DIMENSÃO (departamento,
-- centro de custo) — granularidade diferente de FGTS/INSS/Situações, que
-- são um total só por competência. Por isso vai numa tabela própria
-- (payroll_extrato_dominio_competencia), não em colunas na linha GERAL.
--
-- Nenhuma das 4 tabelas tem RLS com policy nenhuma hoje (RLS habilitado,
-- zero policies) — adicionando o padrão SELECT authenticated / ALL
-- service_role nelas também, não só na tabela nova.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

-- ── 1) payroll_extrato_dominio_colaborador ──────────────────────────────────

ALTER TABLE public.payroll_extrato_dominio_colaborador
  ALTER COLUMN cod_empresa_dominio DROP DEFAULT,
  ALTER COLUMN cnpj DROP DEFAULT,
  ADD CONSTRAINT payroll_extrato_dominio_colaborador_unit_id_fkey
    FOREIGN KEY (unit_id) REFERENCES public.units(id);

ALTER TABLE public.payroll_extrato_dominio_colaborador
  ALTER COLUMN unit_id SET NOT NULL;

ALTER TABLE public.payroll_extrato_dominio_colaborador
  DROP CONSTRAINT uq_extrato_colab;
ALTER TABLE public.payroll_extrato_dominio_colaborador
  ADD CONSTRAINT uq_extrato_colab UNIQUE (unit_id, competencia, cod_colaborador);

-- ── 2) payroll_extrato_dominio_linha ─────────────────────────────────────────

ALTER TABLE public.payroll_extrato_dominio_linha
  ADD COLUMN unit_id uuid NOT NULL REFERENCES public.units(id);

ALTER TABLE public.payroll_extrato_dominio_linha
  DROP CONSTRAINT uq_extrato_linha;
ALTER TABLE public.payroll_extrato_dominio_linha
  ADD CONSTRAINT uq_extrato_linha UNIQUE (unit_id, competencia, cod_colaborador, rubrica_codigo);

-- ── 3) payroll_extrato_dominio_rubrica ───────────────────────────────────────

ALTER TABLE public.payroll_extrato_dominio_rubrica
  ALTER COLUMN cod_empresa_dominio DROP DEFAULT,
  ADD COLUMN unit_id uuid NOT NULL REFERENCES public.units(id);

ALTER TABLE public.payroll_extrato_dominio_rubrica
  DROP CONSTRAINT uq_extrato_rubrica;
ALTER TABLE public.payroll_extrato_dominio_rubrica
  ADD CONSTRAINT uq_extrato_rubrica UNIQUE (unit_id, competencia, rubrica_codigo, natureza);

-- ── 4) payroll_extrato_dominio_totais ────────────────────────────────────────

ALTER TABLE public.payroll_extrato_dominio_totais
  ADD COLUMN unit_id uuid NOT NULL REFERENCES public.units(id);

ALTER TABLE public.payroll_extrato_dominio_totais
  DROP CONSTRAINT uq_extrato_totais;
ALTER TABLE public.payroll_extrato_dominio_totais
  ADD CONSTRAINT uq_extrato_totais UNIQUE (unit_id, competencia, dimensao, codigo);

-- ── 5) payroll_extrato_dominio_competencia — nova ────────────────────────────
-- Fonte de 4.02 Encargos (valor_fgts + valor_fgts_rescisorio) e gate de
-- validação: total_geral_proventos tem que bater com a soma das rubricas de
-- provento importadas para a mesma (unit_id, competencia). Se não bater, o
-- parser errou e a importação falha com a diferença — nunca grava parcial.

CREATE TABLE public.payroll_extrato_dominio_competencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id),
  competencia text NOT NULL,
  cod_empresa_dominio text NOT NULL,
  cnpj text NOT NULL,
  razao_social text,
  arquivo_origem text,
  total_geral_proventos numeric(16,2),
  total_geral_descontos numeric(16,2),
  liquido_geral numeric(16,2),
  base_fgts numeric(16,2),
  valor_fgts numeric(16,2),
  base_fgts_rescisorio numeric(16,2),
  valor_fgts_rescisorio numeric(16,2),
  total_inss numeric(16,2),
  inss_empresa numeric(16,2),
  rat numeric(16,2),
  terceiros numeric(16,2),
  no_empregados int,
  trabalhando int,
  demitido int,
  admissoes int,
  no_contribuintes int,
  importado_em timestamptz DEFAULT now(),
  UNIQUE (unit_id, competencia)
);

CREATE INDEX payroll_extrato_dominio_competencia_cnpj_idx
  ON public.payroll_extrato_dominio_competencia(cnpj);

-- ── RLS: SELECT authenticated, ALL service_role — nas 4 existentes (hoje
-- RLS habilitado mas zero policies) e na tabela nova ─────────────────────────

CREATE POLICY payroll_extrato_dominio_colaborador_read   ON public.payroll_extrato_dominio_colaborador FOR SELECT TO authenticated USING (true);
CREATE POLICY payroll_extrato_dominio_colaborador_manage ON public.payroll_extrato_dominio_colaborador FOR ALL    TO service_role   USING (true) WITH CHECK (true);

CREATE POLICY payroll_extrato_dominio_linha_read   ON public.payroll_extrato_dominio_linha FOR SELECT TO authenticated USING (true);
CREATE POLICY payroll_extrato_dominio_linha_manage ON public.payroll_extrato_dominio_linha FOR ALL    TO service_role   USING (true) WITH CHECK (true);

CREATE POLICY payroll_extrato_dominio_rubrica_read   ON public.payroll_extrato_dominio_rubrica FOR SELECT TO authenticated USING (true);
CREATE POLICY payroll_extrato_dominio_rubrica_manage ON public.payroll_extrato_dominio_rubrica FOR ALL    TO service_role   USING (true) WITH CHECK (true);

CREATE POLICY payroll_extrato_dominio_totais_read   ON public.payroll_extrato_dominio_totais FOR SELECT TO authenticated USING (true);
CREATE POLICY payroll_extrato_dominio_totais_manage ON public.payroll_extrato_dominio_totais FOR ALL    TO service_role   USING (true) WITH CHECK (true);

ALTER TABLE public.payroll_extrato_dominio_competencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_extrato_dominio_competencia_read   ON public.payroll_extrato_dominio_competencia FOR SELECT TO authenticated USING (true);
CREATE POLICY payroll_extrato_dominio_competencia_manage ON public.payroll_extrato_dominio_competencia FOR ALL    TO service_role   USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
