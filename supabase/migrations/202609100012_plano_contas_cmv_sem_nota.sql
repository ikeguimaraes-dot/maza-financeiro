-- ============================================================
-- 202609100012_plano_contas_cmv_sem_nota.sql
-- FASE 7 PASSO 3: compra de alimento sem NF (feira, açougue, fornecedor
-- pequeno) é CMV real mas não tem NCM pra ser categorizada por capítulo.
-- Vai pra 3.99 e aparece explicitamente no DRE como "compra sem nota" —
-- visível, não escondido dentro de outra conta.
-- Aplicada antes da migration de regras_classificacao (PASSO 2) porque essa
-- referencia 3.99 via FK — sem isso o INSERT das regras falharia.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

INSERT INTO public.plano_contas (codigo, nome, grupo, ordem, ncm_capitulos) VALUES
  ('3.99', 'CMV — compras sem nota fiscal', 'cmv', 280, NULL);

NOTIFY pgrst, 'reload schema';
