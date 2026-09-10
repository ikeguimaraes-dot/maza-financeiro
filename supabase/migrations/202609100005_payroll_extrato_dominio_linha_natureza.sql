-- ============================================================
-- 202609100005_payroll_extrato_dominio_linha_natureza.sql
-- payroll_extrato_dominio_linha (linhas de rubrica por colaborador) veio do
-- clone sem coluna de natureza — só payroll_extrato_dominio_rubrica (o
-- resumo por rubrica) tinha. PASSO 3 precisa saber se cada linha é
-- PROVENTO ou DESCONTO pra aplicar a regra "DESCONTO nunca gera lançamento,
-- exceto 843 INSS EMPREGADOR". Tabela confirmada vazia (0 linhas) antes
-- desta migration — sem backfill necessário.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

ALTER TABLE public.payroll_extrato_dominio_linha
  ADD COLUMN natureza text NOT NULL CHECK (natureza IN ('PROVENTO', 'DESCONTO'));

NOTIFY pgrst, 'reload schema';
