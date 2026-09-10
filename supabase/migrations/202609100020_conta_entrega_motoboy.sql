-- ============================================================
-- 202609100020_conta_entrega_motoboy.sql
-- FASE 7 (planilha IKY Delivery): em delivery, entrega é custo
-- operacional principal, não "logística" genérica -- ~R$157 mil em 4
-- meses (MOTOBOY + "MOTOBOY - PERÍODO dd/mm A dd/mm/aaaa", que a
-- normalização de categoria já colapsa em MOTOBOY). Cria 5.09 dedicada e
-- reaponta a regra de MOTOBOY pra lá. 5.07 fica livre e renomeada pra
-- refletir só o que sobra nela (LOGGI, transportadora -- sem regra ainda,
-- nenhuma categoria da planilha usa esse nome hoje).
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

UPDATE public.plano_contas SET nome = 'Logística e transportadora' WHERE codigo = '5.07';

INSERT INTO public.plano_contas (codigo, nome, grupo, ordem, ncm_capitulos) VALUES
  ('5.09', 'Entrega e motoboy', 'despesa_operacional', 475, NULL);

UPDATE public.regras_classificacao SET conta_codigo = '5.09'
WHERE tipo = 'categoria_gerencial' AND padrao = 'MOTOBOY' AND conta_codigo = '5.07';

NOTIFY pgrst, 'reload schema';
