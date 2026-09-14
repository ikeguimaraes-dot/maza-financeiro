-- ============================================================
-- 202609140001_renomear_conta_399.sql
-- Conta 3.99 se chamava "CMV — compras sem nota fiscal", mas essa
-- descrição é falsa pra boa parte do saldo: na IKY, 78% do valor
-- (R$212.811,00, 173 títulos) genuinamente não tem número de nota, mas
-- 22% (R$61.795,63, 50 títulos) TEM número — a nota existe, só falta
-- importar o XML. Nome neutro que cobre os dois casos sem afirmar
-- nenhum; a separação visual de quem é quem fica no alerta 2.11 da
-- Conferência (nota com número, sem XML, conta grupo cmv), não no nome
-- da conta.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

UPDATE public.plano_contas
SET nome = 'CMV — compras fora do fluxo de NF-e'
WHERE codigo = '3.99';

NOTIFY pgrst, 'reload schema';
