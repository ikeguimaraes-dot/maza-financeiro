-- Permite que usuários autenticados com acesso à unidade importem e consultem
-- relatórios Lorean/Excel. A service role continua com bypass nativo de RLS.

ALTER TABLE public.lorean_workdays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lorean_workdays_unit_read ON public.lorean_workdays;
CREATE POLICY lorean_workdays_unit_read ON public.lorean_workdays
  FOR SELECT TO authenticated
  USING (public.kph_has_role_for_unit(unit_id));

DROP POLICY IF EXISTS lorean_workdays_unit_write ON public.lorean_workdays;
CREATE POLICY lorean_workdays_unit_write ON public.lorean_workdays
  FOR ALL TO authenticated
  USING (public.kph_has_role_for_unit(unit_id))
  WITH CHECK (public.kph_has_role_for_unit(unit_id));

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'lorean_pagamentos', 'lorean_descontos', 'lorean_ambientes',
    'lorean_turnos', 'lorean_grupos', 'lorean_horarios', 'lorean_usuarios',
    'lorean_caixas', 'lorean_produtos_dia', 'lorean_descontos_detalhe',
    'lorean_cancelamentos', 'lorean_cancelamentos_detalhe'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_unit_read', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.lorean_workdays w WHERE w.id = workday_id_fk AND public.kph_has_role_for_unit(w.unit_id)))',
      table_name || '_unit_read', table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_unit_write', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.lorean_workdays w WHERE w.id = workday_id_fk AND public.kph_has_role_for_unit(w.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.lorean_workdays w WHERE w.id = workday_id_fk AND public.kph_has_role_for_unit(w.unit_id)))',
      table_name || '_unit_write', table_name
    );
  END LOOP;
END $$;
