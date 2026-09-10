-- ============================================================
-- 202609100006_plano_contas_ferias_prolabore.sql
-- PASSO 3: duas contas novas pra classificar rubricas do extrato Domínio
-- que não cabem em 4.01 (salários) nem 4.02 (encargos) — férias/13º têm
-- natureza distinta de salário mensal, e pró-labore é remuneração de
-- diretor, não de empregado CLT.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

INSERT INTO public.plano_contas (codigo, nome, grupo, ordem, ncm_capitulos) VALUES
  ('4.06', 'Férias e 13º', 'mao_de_obra', 360, NULL),
  ('4.07', 'Pró-labore',   'mao_de_obra', 370, NULL);

NOTIFY pgrst, 'reload schema';
