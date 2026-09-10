-- ============================================================
-- 202609100014_plano_contas_imposto_lucro.sql
-- FASE 7 — ajuste: IRPJ/CSLL são imposto sobre LUCRO, não sobre venda.
-- Estavam em 2.04 (grupo deducao), reduzindo receita líquida — que é
-- denominador de CMV%/MO%/prime cost% — distorcendo todos os percentuais.
-- Novo grupo 'imposto_lucro' fica de fora do cálculo de EBITDA e da
-- receita líquida; entra só em resultado_liquido (abaixo do EBITDA).
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

ALTER TABLE public.plano_contas DROP CONSTRAINT plano_contas_grupo_check;
ALTER TABLE public.plano_contas ADD CONSTRAINT plano_contas_grupo_check
  CHECK (grupo = ANY (ARRAY['receita', 'deducao', 'cmv', 'mao_de_obra', 'despesa_operacional', 'financeiro', 'investimento', 'imposto_lucro']));

INSERT INTO public.plano_contas (codigo, nome, grupo, ordem, ncm_capitulos) VALUES
  ('8.01', 'Imposto sobre o lucro', 'imposto_lucro', 700, NULL);

NOTIFY pgrst, 'reload schema';
