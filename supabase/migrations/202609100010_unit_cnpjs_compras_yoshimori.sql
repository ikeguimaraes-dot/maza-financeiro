-- ============================================================
-- 202609100010_unit_cnpjs_compras_yoshimori.sql
-- importNfe() passa a resolver unidade por unit_cnpjs (qualquer papel),
-- não mais por units.cnpj. O CNPJ 36332164000163 (YOSHIMORI RESTAURANTE
-- LTDA) é o destinatário nos XMLs de entrada já importados hoje via
-- units.cnpj — precisa existir em unit_cnpjs com papel='compras' pra essas
-- notas continuarem resolvendo pra Yoshimori depois da troca.
-- 63092631000106 (hoje em units.cnpj da IKY Delivery) NÃO é adicionado —
-- origem não confirmada. O Ike vai mandar a lista completa de CNPJs de
-- compra separadamente.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

INSERT INTO public.unit_cnpjs (unit_id, cnpj, razao_social, papel) VALUES
  ('674eac8c-5a38-4a42-aa60-0a666387909c', '36332164000163', 'YOSHIMORI RESTAURANTE LTDA', 'compras');

NOTIFY pgrst, 'reload schema';
