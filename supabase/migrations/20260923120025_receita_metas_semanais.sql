-- Existing targets were protected by RLS but had no policies.
ALTER TABLE public.metas_dia_semana ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.metas_dia_semana FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.metas_dia_semana FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_dia_semana TO authenticated;
GRANT USAGE ON SEQUENCE public.metas_dia_semana_id_seq TO authenticated;
CREATE POLICY metas_semanais_read ON public.metas_dia_semana FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY metas_semanais_insert ON public.metas_dia_semana FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY metas_semanais_update ON public.metas_dia_semana FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY metas_semanais_delete ON public.metas_dia_semana FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

-- Keep the existing date-specific workflow accessible under the same unit permissions.
ALTER TABLE public.metas_dia_override ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.metas_dia_override FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.metas_dia_override FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_dia_override TO authenticated;
CREATE POLICY metas_excecoes_read ON public.metas_dia_override FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY metas_excecoes_insert ON public.metas_dia_override FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY metas_excecoes_update ON public.metas_dia_override FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY metas_excecoes_delete ON public.metas_dia_override FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));
DO $$ DECLARE seq text; BEGIN
  seq := pg_get_serial_sequence('public.metas_dia_override','id');
  IF seq IS NOT NULL THEN EXECUTE format('GRANT USAGE ON SEQUENCE %s TO authenticated', seq); END IF;
END $$;
NOTIFY pgrst, 'reload schema';
