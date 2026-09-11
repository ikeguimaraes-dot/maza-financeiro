-- ============================================================
-- 202609100021_conta_pagamento_folha_nao_operacional.sql
-- FASE 7 — CORREÇÃO 1: título de FGTS/DCTF/SINDICATO/CONTRIBUICAO
-- (ENCARGO FOLHA), RESCISAO e FERIAS na planilha de compras é o
-- PAGAMENTO de um custo que o extrato Domínio (payroll_extrato_dominio_*)
-- já registrou com granularidade de rubrica, validado ao centavo. Somar
-- os dois em mao_de_obra conta o mesmo custo duas vezes -- confirmado:
-- origem='folha' bate exato com o extrato em todo mês/unidade com dado;
-- origem='titulo' nessas 3 categorias é sempre o excedente.
--
-- Cria grupo 'nao_operacional' (fora de receita/dedução/custo/despesa —
-- não entra em nenhum KPI, só aparece no dre_snapshot pra conferência de
-- caixa) e reaponta as 3 categorias pra lá. A EXCEÇÃO (unidade/competência
-- sem extrato Domínio -- aí o título é a única evidência do custo) é
-- tratada em código (gerarLancamentosTitulos), não aqui -- é condicional
-- a dado em tempo de execução, não a uma regra estática.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

ALTER TABLE public.plano_contas DROP CONSTRAINT plano_contas_grupo_check;
ALTER TABLE public.plano_contas ADD CONSTRAINT plano_contas_grupo_check
  CHECK (grupo = ANY (ARRAY['receita', 'deducao', 'cmv', 'mao_de_obra', 'despesa_operacional', 'financeiro', 'investimento', 'imposto_lucro', 'nao_operacional']));

INSERT INTO public.plano_contas (codigo, nome, grupo, ordem, ncm_capitulos) VALUES
  ('9.98', 'Pagamento de folha (não é custo)', 'nao_operacional', 998, NULL);

UPDATE public.regras_classificacao SET conta_codigo = '9.98'
WHERE tipo = 'categoria_gerencial' AND padrao IN ('ENCARGO FOLHA', 'RESCISAO', 'FERIAS');

NOTIFY pgrst, 'reload schema';
