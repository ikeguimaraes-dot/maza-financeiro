-- ============================================================
-- 202609100009_completar_ncm_capitulos.sql
-- ncm_capitulos incompleto em 6 contas fazia 53 lançamentos de NF-e
-- (R$5.657, Yoshimori jun/2026) cair em 9.99 por falta de mapeamento —
-- não por falta de regra manual. Cada capítulo NCM só pode pertencer a
-- UMA conta (o match em gerarLancamentosNfeEntrada é por primeiro-match);
-- verificar duplicidade depois de aplicar.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

UPDATE public.plano_contas SET ncm_capitulos = ARRAY['06','07','08']
  WHERE codigo = '3.04'; -- CMV — hortifrúti (+06 flores comestíveis)

UPDATE public.plano_contas SET ncm_capitulos = ARRAY['09','10','11','12','15','16','17','18','19','20','21','29','35']
  WHERE codigo = '3.05'; -- CMV — secos e mercearia (+29 glutamato, +35 gelatina em folha)

UPDATE public.plano_contas SET ncm_capitulos = ARRAY['27']
  WHERE codigo = '5.02'; -- Utilidades (+27 gás butano)

UPDATE public.plano_contas SET ncm_capitulos = ARRAY['64']
  WHERE codigo = '5.05'; -- Administrativo (+64 calçado de segurança/EPI)

UPDATE public.plano_contas SET ncm_capitulos = ARRAY['28','34','38','39','40','44','48','56','63','65','68','83']
  WHERE codigo = '5.06'; -- Descartáveis, embalagens e limpeza

UPDATE public.plano_contas SET ncm_capitulos = ARRAY['70','73','84','85','94']
  WHERE codigo = '7.01'; -- Equipamentos (+70 vidraria, +73 utensílio inox)

NOTIFY pgrst, 'reload schema';
