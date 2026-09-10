-- ============================================================
-- 202609100011_unit_cnpjs_compras_iky_delivery.sql
-- 63092631000106 (IKY DELIVERY LTDA) confirmado pelo Ike como CNPJ de
-- compras da unidade IKY Delivery — rejeitava 237 notas de entrada
-- (R$357.445,30) desde que importNfe() passou a resolver por unit_cnpjs.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

INSERT INTO public.unit_cnpjs (unit_id, cnpj, razao_social, papel) VALUES
  ('674eac8c-5a38-4a42-aa60-0a666387909b', '63092631000106', 'IKY DELIVERY LTDA', 'compras');

NOTIFY pgrst, 'reload schema';
