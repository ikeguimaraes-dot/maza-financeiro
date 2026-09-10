-- ============================================================
-- 202609100007_limpar_dre_folha_cross_wired.sql
-- PASSO 4: dre_folha foi confirmado cross-wired entre unidades (o extrato
-- "10114" IKY RESTAURANTES→Yoshimori tinha aterrissado sob unit_id do IKY
-- Delivery, e vice-versa com "10183" MZ DELIVERY). gerarLancamentosFolha()
-- não lê mais esta tabela — a fonte exclusiva agora é
-- payroll_extrato_dominio_linha/_competencia, importados por CNPJ e
-- validados a centavo contra os extratos reais Domínio (ver PASSO 2/3).
-- Sem rollback: dado substituído, fonte original (PDFs) preservada em
-- tests/fixtures/folha/ (gitignored).
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

DELETE FROM public.dre_folha;
