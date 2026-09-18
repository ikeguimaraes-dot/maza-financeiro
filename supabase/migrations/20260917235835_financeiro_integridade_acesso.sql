-- Invoice item identity is the position, not the supplier's product code.
ALTER TABLE public.produtos_relatorio ADD COLUMN item_nfe integer;
WITH numbered AS (SELECT id,row_number() OVER(PARTITION BY unit_id,chave_nfe ORDER BY id) AS pos FROM public.produtos_relatorio WHERE chave_nfe IS NOT NULL)
UPDATE public.produtos_relatorio p SET item_nfe=n.pos FROM numbered n WHERE n.id=p.id;
ALTER TABLE public.produtos_relatorio DROP CONSTRAINT IF EXISTS produtos_relatorio_nfe_item_key;
DROP INDEX IF EXISTS public.produtos_relatorio_nfe_item_key;
DROP INDEX IF EXISTS public.uq_produtos_relatorio_nota_item;
CREATE UNIQUE INDEX produtos_relatorio_nfe_position ON public.produtos_relatorio(unit_id,chave_nfe,item_nfe) WHERE chave_nfe IS NOT NULL;
CREATE UNIQUE INDEX produtos_relatorio_identity ON public.produtos_relatorio(unit_id,nr_danfe,item_codigo,fornecedor_codigo,chave_nfe,item_nfe) NULLS NOT DISTINCT;

-- Preserve the origin of imports routed between restaurants. Legacy rows are
-- assigned to their current unit; their original upload unit was not recorded.
ALTER TABLE public.titulos_a_pagar ADD COLUMN import_unit_id uuid;
UPDATE public.titulos_a_pagar SET import_unit_id=unit_id WHERE origem IN ('nf_pedidos','contas_pagar');
CREATE INDEX titulos_import_scope ON public.titulos_a_pagar(import_unit_id,d_competencia,origem);
-- Rebuilds are scoped by unit/month, including corrections that move a source.
ALTER TABLE public.lancamentos DROP CONSTRAINT IF EXISTS lancamentos_origem_origem_id_conta_codigo_key;
DROP INDEX IF EXISTS public.lancamentos_origem_origem_id_conta_codigo_key;
CREATE UNIQUE INDEX lancamentos_source_scope ON public.lancamentos(unit_id,competencia,origem,origem_id,conta_codigo);

-- Requests use user JWTs. Functions are invokers; all mutations obey RLS.
CREATE OR REPLACE FUNCTION public.financeiro_can_read(p_unit uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT auth.uid() IS NOT NULL AND (public.kph_is_founder() OR (p_unit IS NOT NULL AND public.kph_has_role_for_unit(p_unit))) $$;

CREATE OR REPLACE FUNCTION public.financeiro_can_write(p_unit uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT auth.uid() IS NOT NULL AND (public.kph_is_founder() OR EXISTS (
 SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
 WHERE ur.user_id=auth.uid() AND ur.unit_id=p_unit AND r.name <> 'socio_readonly'
)) $$;

CREATE OR REPLACE FUNCTION public.financeiro_has_membership()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid()) $$;

REVOKE ALL ON FUNCTION public.financeiro_can_read(uuid), public.financeiro_can_write(uuid), public.financeiro_has_membership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_can_read(uuid), public.financeiro_can_write(uuid), public.financeiro_has_membership() TO authenticated, service_role;

-- Remove the additional permissive policy that nullifies units_select.
DROP POLICY IF EXISTS units_read ON public.units;

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='conferencias' LOOP
 EXECUTE format('DROP POLICY %I ON public.conferencias',p.policyname); END LOOP;
END $$;
ALTER TABLE public.conferencias ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conferencias TO authenticated;
REVOKE ALL ON public.conferencias FROM anon;
CREATE POLICY financeiro_read ON public.conferencias FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.conferencias FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.conferencias FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.conferencias FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='contas_bancarias' LOOP
 EXECUTE format('DROP POLICY %I ON public.contas_bancarias',p.policyname); END LOOP;
END $$;
ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_bancarias TO authenticated;
REVOKE ALL ON public.contas_bancarias FROM anon;
CREATE POLICY financeiro_read ON public.contas_bancarias FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.contas_bancarias FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.contas_bancarias FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.contas_bancarias FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='contratos' LOOP
 EXECUTE format('DROP POLICY %I ON public.contratos',p.policyname); END LOOP;
END $$;
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos TO authenticated;
REVOKE ALL ON public.contratos FROM anon;
CREATE POLICY financeiro_read ON public.contratos FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.contratos FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.contratos FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.contratos FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='contratos_arquivos' LOOP
 EXECUTE format('DROP POLICY %I ON public.contratos_arquivos',p.policyname); END LOOP;
END $$;
ALTER TABLE public.contratos_arquivos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos_arquivos TO authenticated;
REVOKE ALL ON public.contratos_arquivos FROM anon;
CREATE POLICY financeiro_read ON public.contratos_arquivos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.contratos p WHERE p.id=contratos_arquivos.contrato_id AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.contratos_arquivos FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.contratos p WHERE p.id=contratos_arquivos.contrato_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.contratos_arquivos FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.contratos p WHERE p.id=contratos_arquivos.contrato_id AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.contratos p WHERE p.id=contratos_arquivos.contrato_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.contratos_arquivos FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.contratos p WHERE p.id=contratos_arquivos.contrato_id AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dre_contratos_fixos' LOOP
 EXECUTE format('DROP POLICY %I ON public.dre_contratos_fixos',p.policyname); END LOOP;
END $$;
ALTER TABLE public.dre_contratos_fixos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_contratos_fixos TO authenticated;
REVOKE ALL ON public.dre_contratos_fixos FROM anon;
CREATE POLICY financeiro_read ON public.dre_contratos_fixos FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.dre_contratos_fixos FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.dre_contratos_fixos FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.dre_contratos_fixos FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dre_despesa_detalhada' LOOP
 EXECUTE format('DROP POLICY %I ON public.dre_despesa_detalhada',p.policyname); END LOOP;
END $$;
ALTER TABLE public.dre_despesa_detalhada ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_despesa_detalhada TO authenticated;
REVOKE ALL ON public.dre_despesa_detalhada FROM anon;
CREATE POLICY financeiro_read ON public.dre_despesa_detalhada FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.dre_despesa_detalhada FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.dre_despesa_detalhada FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.dre_despesa_detalhada FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dre_faturamento_historico' LOOP
 EXECUTE format('DROP POLICY %I ON public.dre_faturamento_historico',p.policyname); END LOOP;
END $$;
ALTER TABLE public.dre_faturamento_historico ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_faturamento_historico TO authenticated;
REVOKE ALL ON public.dre_faturamento_historico FROM anon;
CREATE POLICY financeiro_read ON public.dre_faturamento_historico FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.dre_faturamento_historico FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.dre_faturamento_historico FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.dre_faturamento_historico FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dre_folha' LOOP
 EXECUTE format('DROP POLICY %I ON public.dre_folha',p.policyname); END LOOP;
END $$;
ALTER TABLE public.dre_folha ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_folha TO authenticated;
REVOKE ALL ON public.dre_folha FROM anon;
CREATE POLICY financeiro_read ON public.dre_folha FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.dre_folha FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.dre_folha FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.dre_folha FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dre_gorjeta_mensal' LOOP
 EXECUTE format('DROP POLICY %I ON public.dre_gorjeta_mensal',p.policyname); END LOOP;
END $$;
ALTER TABLE public.dre_gorjeta_mensal ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_gorjeta_mensal TO authenticated;
REVOKE ALL ON public.dre_gorjeta_mensal FROM anon;
CREATE POLICY financeiro_read ON public.dre_gorjeta_mensal FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.dre_gorjeta_mensal FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.dre_gorjeta_mensal FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.dre_gorjeta_mensal FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dre_indicadores' LOOP
 EXECUTE format('DROP POLICY %I ON public.dre_indicadores',p.policyname); END LOOP;
END $$;
ALTER TABLE public.dre_indicadores ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_indicadores TO authenticated;
REVOKE ALL ON public.dre_indicadores FROM anon;
CREATE POLICY financeiro_read ON public.dre_indicadores FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.dre_indicadores FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.dre_indicadores FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.dre_indicadores FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dre_kpis_mensais' LOOP
 EXECUTE format('DROP POLICY %I ON public.dre_kpis_mensais',p.policyname); END LOOP;
END $$;
ALTER TABLE public.dre_kpis_mensais ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_kpis_mensais TO authenticated;
REVOKE ALL ON public.dre_kpis_mensais FROM anon;
CREATE POLICY financeiro_read ON public.dre_kpis_mensais FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.dre_kpis_mensais FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.dre_kpis_mensais FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.dre_kpis_mensais FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dre_linhas_detalhadas' LOOP
 EXECUTE format('DROP POLICY %I ON public.dre_linhas_detalhadas',p.policyname); END LOOP;
END $$;
ALTER TABLE public.dre_linhas_detalhadas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_linhas_detalhadas TO authenticated;
REVOKE ALL ON public.dre_linhas_detalhadas FROM anon;
CREATE POLICY financeiro_read ON public.dre_linhas_detalhadas FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.dre_linhas_detalhadas FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.dre_linhas_detalhadas FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.dre_linhas_detalhadas FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dre_manutencao_detalhada' LOOP
 EXECUTE format('DROP POLICY %I ON public.dre_manutencao_detalhada',p.policyname); END LOOP;
END $$;
ALTER TABLE public.dre_manutencao_detalhada ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_manutencao_detalhada TO authenticated;
REVOKE ALL ON public.dre_manutencao_detalhada FROM anon;
CREATE POLICY financeiro_read ON public.dre_manutencao_detalhada FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.dre_manutencao_detalhada FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.dre_manutencao_detalhada FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.dre_manutencao_detalhada FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dre_mensal' LOOP
 EXECUTE format('DROP POLICY %I ON public.dre_mensal',p.policyname); END LOOP;
END $$;
ALTER TABLE public.dre_mensal ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_mensal TO authenticated;
REVOKE ALL ON public.dre_mensal FROM anon;
CREATE POLICY financeiro_read ON public.dre_mensal FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.dre_mensal FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.dre_mensal FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.dre_mensal FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dre_pessoal_detalhado' LOOP
 EXECUTE format('DROP POLICY %I ON public.dre_pessoal_detalhado',p.policyname); END LOOP;
END $$;
ALTER TABLE public.dre_pessoal_detalhado ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_pessoal_detalhado TO authenticated;
REVOKE ALL ON public.dre_pessoal_detalhado FROM anon;
CREATE POLICY financeiro_read ON public.dre_pessoal_detalhado FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.dre_pessoal_detalhado FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.dre_pessoal_detalhado FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.dre_pessoal_detalhado FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dre_prestadores' LOOP
 EXECUTE format('DROP POLICY %I ON public.dre_prestadores',p.policyname); END LOOP;
END $$;
ALTER TABLE public.dre_prestadores ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_prestadores TO authenticated;
REVOKE ALL ON public.dre_prestadores FROM anon;
CREATE POLICY financeiro_read ON public.dre_prestadores FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.dre_prestadores FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.dre_prestadores FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.dre_prestadores FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dre_receita_detalhada' LOOP
 EXECUTE format('DROP POLICY %I ON public.dre_receita_detalhada',p.policyname); END LOOP;
END $$;
ALTER TABLE public.dre_receita_detalhada ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_receita_detalhada TO authenticated;
REVOKE ALL ON public.dre_receita_detalhada FROM anon;
CREATE POLICY financeiro_read ON public.dre_receita_detalhada FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.dre_receita_detalhada FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.dre_receita_detalhada FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.dre_receita_detalhada FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dre_snapshot' LOOP
 EXECUTE format('DROP POLICY %I ON public.dre_snapshot',p.policyname); END LOOP;
END $$;
ALTER TABLE public.dre_snapshot ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_snapshot TO authenticated;
REVOKE ALL ON public.dre_snapshot FROM anon;
CREATE POLICY financeiro_read ON public.dre_snapshot FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.dre_snapshot FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.dre_snapshot FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.dre_snapshot FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='financeiro_importacoes' LOOP
 EXECUTE format('DROP POLICY %I ON public.financeiro_importacoes',p.policyname); END LOOP;
END $$;
ALTER TABLE public.financeiro_importacoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_importacoes TO authenticated;
REVOKE ALL ON public.financeiro_importacoes FROM anon;
CREATE POLICY financeiro_read ON public.financeiro_importacoes FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.financeiro_importacoes FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.financeiro_importacoes FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.financeiro_importacoes FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='fornecedores' LOOP
 EXECUTE format('DROP POLICY %I ON public.fornecedores',p.policyname); END LOOP;
END $$;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores TO authenticated;
REVOKE ALL ON public.fornecedores FROM anon;
CREATE POLICY financeiro_read ON public.fornecedores FOR SELECT TO authenticated USING (public.financeiro_has_membership());
CREATE POLICY financeiro_insert ON public.fornecedores FOR INSERT TO authenticated WITH CHECK (public.kph_is_founder());
CREATE POLICY financeiro_update ON public.fornecedores FOR UPDATE TO authenticated USING (public.kph_is_founder()) WITH CHECK (public.kph_is_founder());
CREATE POLICY financeiro_delete ON public.fornecedores FOR DELETE TO authenticated USING (public.kph_is_founder());

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='fornecedores_depara' LOOP
 EXECUTE format('DROP POLICY %I ON public.fornecedores_depara',p.policyname); END LOOP;
END $$;
ALTER TABLE public.fornecedores_depara ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores_depara TO authenticated;
REVOKE ALL ON public.fornecedores_depara FROM anon;
CREATE POLICY financeiro_read ON public.fornecedores_depara FOR SELECT TO authenticated USING (public.financeiro_has_membership());
CREATE POLICY financeiro_insert ON public.fornecedores_depara FOR INSERT TO authenticated WITH CHECK (public.kph_is_founder());
CREATE POLICY financeiro_update ON public.fornecedores_depara FOR UPDATE TO authenticated USING (public.kph_is_founder()) WITH CHECK (public.kph_is_founder());
CREATE POLICY financeiro_delete ON public.fornecedores_depara FOR DELETE TO authenticated USING (public.kph_is_founder());

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='kpi_snapshot' LOOP
 EXECUTE format('DROP POLICY %I ON public.kpi_snapshot',p.policyname); END LOOP;
END $$;
ALTER TABLE public.kpi_snapshot ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_snapshot TO authenticated;
REVOKE ALL ON public.kpi_snapshot FROM anon;
CREATE POLICY financeiro_read ON public.kpi_snapshot FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.kpi_snapshot FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.kpi_snapshot FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.kpi_snapshot FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lancamentos' LOOP
 EXECUTE format('DROP POLICY %I ON public.lancamentos',p.policyname); END LOOP;
END $$;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamentos TO authenticated;
REVOKE ALL ON public.lancamentos FROM anon;
CREATE POLICY financeiro_read ON public.lancamentos FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.lancamentos FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.lancamentos FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.lancamentos FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='mapa_conta_dre' LOOP
 EXECUTE format('DROP POLICY %I ON public.mapa_conta_dre',p.policyname); END LOOP;
END $$;
ALTER TABLE public.mapa_conta_dre ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapa_conta_dre TO authenticated;
REVOKE ALL ON public.mapa_conta_dre FROM anon;
CREATE POLICY financeiro_read ON public.mapa_conta_dre FOR SELECT TO authenticated USING (public.financeiro_has_membership());
CREATE POLICY financeiro_insert ON public.mapa_conta_dre FOR INSERT TO authenticated WITH CHECK (public.kph_is_founder());
CREATE POLICY financeiro_update ON public.mapa_conta_dre FOR UPDATE TO authenticated USING (public.kph_is_founder()) WITH CHECK (public.kph_is_founder());
CREATE POLICY financeiro_delete ON public.mapa_conta_dre FOR DELETE TO authenticated USING (public.kph_is_founder());

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='metas' LOOP
 EXECUTE format('DROP POLICY %I ON public.metas',p.policyname); END LOOP;
END $$;
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas TO authenticated;
REVOKE ALL ON public.metas FROM anon;
CREATE POLICY financeiro_read ON public.metas FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.metas FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.metas FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.metas FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='movimentacoes_caixa' LOOP
 EXECUTE format('DROP POLICY %I ON public.movimentacoes_caixa',p.policyname); END LOOP;
END $$;
ALTER TABLE public.movimentacoes_caixa ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimentacoes_caixa TO authenticated;
REVOKE ALL ON public.movimentacoes_caixa FROM anon;
CREATE POLICY financeiro_read ON public.movimentacoes_caixa FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.movimentacoes_caixa FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.movimentacoes_caixa FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.movimentacoes_caixa FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='nfe_documentos' LOOP
 EXECUTE format('DROP POLICY %I ON public.nfe_documentos',p.policyname); END LOOP;
END $$;
ALTER TABLE public.nfe_documentos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfe_documentos TO authenticated;
REVOKE ALL ON public.nfe_documentos FROM anon;
CREATE POLICY financeiro_read ON public.nfe_documentos FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.nfe_documentos FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.nfe_documentos FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.nfe_documentos FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='nfe_importacoes' LOOP
 EXECUTE format('DROP POLICY %I ON public.nfe_importacoes',p.policyname); END LOOP;
END $$;
ALTER TABLE public.nfe_importacoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfe_importacoes TO authenticated;
REVOKE ALL ON public.nfe_importacoes FROM anon;
CREATE POLICY financeiro_read ON public.nfe_importacoes FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.nfe_importacoes FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.nfe_importacoes FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.nfe_importacoes FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='payroll_extrato_dominio_colaborador' LOOP
 EXECUTE format('DROP POLICY %I ON public.payroll_extrato_dominio_colaborador',p.policyname); END LOOP;
END $$;
ALTER TABLE public.payroll_extrato_dominio_colaborador ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_extrato_dominio_colaborador TO authenticated;
REVOKE ALL ON public.payroll_extrato_dominio_colaborador FROM anon;
CREATE POLICY financeiro_read ON public.payroll_extrato_dominio_colaborador FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.payroll_extrato_dominio_colaborador FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.payroll_extrato_dominio_colaborador FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.payroll_extrato_dominio_colaborador FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='payroll_extrato_dominio_competencia' LOOP
 EXECUTE format('DROP POLICY %I ON public.payroll_extrato_dominio_competencia',p.policyname); END LOOP;
END $$;
ALTER TABLE public.payroll_extrato_dominio_competencia ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_extrato_dominio_competencia TO authenticated;
REVOKE ALL ON public.payroll_extrato_dominio_competencia FROM anon;
CREATE POLICY financeiro_read ON public.payroll_extrato_dominio_competencia FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.payroll_extrato_dominio_competencia FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.payroll_extrato_dominio_competencia FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.payroll_extrato_dominio_competencia FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='payroll_extrato_dominio_linha' LOOP
 EXECUTE format('DROP POLICY %I ON public.payroll_extrato_dominio_linha',p.policyname); END LOOP;
END $$;
ALTER TABLE public.payroll_extrato_dominio_linha ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_extrato_dominio_linha TO authenticated;
REVOKE ALL ON public.payroll_extrato_dominio_linha FROM anon;
CREATE POLICY financeiro_read ON public.payroll_extrato_dominio_linha FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.payroll_extrato_dominio_linha FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.payroll_extrato_dominio_linha FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.payroll_extrato_dominio_linha FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='payroll_extrato_dominio_rubrica' LOOP
 EXECUTE format('DROP POLICY %I ON public.payroll_extrato_dominio_rubrica',p.policyname); END LOOP;
END $$;
ALTER TABLE public.payroll_extrato_dominio_rubrica ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_extrato_dominio_rubrica TO authenticated;
REVOKE ALL ON public.payroll_extrato_dominio_rubrica FROM anon;
CREATE POLICY financeiro_read ON public.payroll_extrato_dominio_rubrica FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.payroll_extrato_dominio_rubrica FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.payroll_extrato_dominio_rubrica FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.payroll_extrato_dominio_rubrica FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='payroll_extrato_dominio_totais' LOOP
 EXECUTE format('DROP POLICY %I ON public.payroll_extrato_dominio_totais',p.policyname); END LOOP;
END $$;
ALTER TABLE public.payroll_extrato_dominio_totais ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_extrato_dominio_totais TO authenticated;
REVOKE ALL ON public.payroll_extrato_dominio_totais FROM anon;
CREATE POLICY financeiro_read ON public.payroll_extrato_dominio_totais FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.payroll_extrato_dominio_totais FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.payroll_extrato_dominio_totais FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.payroll_extrato_dominio_totais FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='plano_contas' LOOP
 EXECUTE format('DROP POLICY %I ON public.plano_contas',p.policyname); END LOOP;
END $$;
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plano_contas TO authenticated;
REVOKE ALL ON public.plano_contas FROM anon;
CREATE POLICY financeiro_read ON public.plano_contas FOR SELECT TO authenticated USING (public.financeiro_has_membership());
CREATE POLICY financeiro_insert ON public.plano_contas FOR INSERT TO authenticated WITH CHECK (public.kph_is_founder());
CREATE POLICY financeiro_update ON public.plano_contas FOR UPDATE TO authenticated USING (public.kph_is_founder()) WITH CHECK (public.kph_is_founder());
CREATE POLICY financeiro_delete ON public.plano_contas FOR DELETE TO authenticated USING (public.kph_is_founder());

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='produtos_catalogo' LOOP
 EXECUTE format('DROP POLICY %I ON public.produtos_catalogo',p.policyname); END LOOP;
END $$;
ALTER TABLE public.produtos_catalogo ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos_catalogo TO authenticated;
REVOKE ALL ON public.produtos_catalogo FROM anon;
CREATE POLICY financeiro_read ON public.produtos_catalogo FOR SELECT TO authenticated USING (public.financeiro_has_membership());
CREATE POLICY financeiro_insert ON public.produtos_catalogo FOR INSERT TO authenticated WITH CHECK (public.kph_is_founder());
CREATE POLICY financeiro_update ON public.produtos_catalogo FOR UPDATE TO authenticated USING (public.kph_is_founder()) WITH CHECK (public.kph_is_founder());
CREATE POLICY financeiro_delete ON public.produtos_catalogo FOR DELETE TO authenticated USING (public.kph_is_founder());

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='produtos_depara' LOOP
 EXECUTE format('DROP POLICY %I ON public.produtos_depara',p.policyname); END LOOP;
END $$;
ALTER TABLE public.produtos_depara ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos_depara TO authenticated;
REVOKE ALL ON public.produtos_depara FROM anon;
CREATE POLICY financeiro_read ON public.produtos_depara FOR SELECT TO authenticated USING (public.financeiro_has_membership());
CREATE POLICY financeiro_insert ON public.produtos_depara FOR INSERT TO authenticated WITH CHECK (public.kph_is_founder());
CREATE POLICY financeiro_update ON public.produtos_depara FOR UPDATE TO authenticated USING (public.kph_is_founder()) WITH CHECK (public.kph_is_founder());
CREATE POLICY financeiro_delete ON public.produtos_depara FOR DELETE TO authenticated USING (public.kph_is_founder());

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='produtos_relatorio' LOOP
 EXECUTE format('DROP POLICY %I ON public.produtos_relatorio',p.policyname); END LOOP;
END $$;
ALTER TABLE public.produtos_relatorio ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos_relatorio TO authenticated;
REVOKE ALL ON public.produtos_relatorio FROM anon;
CREATE POLICY financeiro_read ON public.produtos_relatorio FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.produtos_relatorio FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.produtos_relatorio FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.produtos_relatorio FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='protestos_certidoes' LOOP
 EXECUTE format('DROP POLICY %I ON public.protestos_certidoes',p.policyname); END LOOP;
END $$;
ALTER TABLE public.protestos_certidoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protestos_certidoes TO authenticated;
REVOKE ALL ON public.protestos_certidoes FROM anon;
CREATE POLICY financeiro_read ON public.protestos_certidoes FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.protestos_certidoes FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.protestos_certidoes FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.protestos_certidoes FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='protestos_registros' LOOP
 EXECUTE format('DROP POLICY %I ON public.protestos_registros',p.policyname); END LOOP;
END $$;
ALTER TABLE public.protestos_registros ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protestos_registros TO authenticated;
REVOKE ALL ON public.protestos_registros FROM anon;
CREATE POLICY financeiro_read ON public.protestos_registros FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.protestos_certidoes p WHERE p.id=protestos_registros.certidao_id AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.protestos_registros FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.protestos_certidoes p WHERE p.id=protestos_registros.certidao_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.protestos_registros FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.protestos_certidoes p WHERE p.id=protestos_registros.certidao_id AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.protestos_certidoes p WHERE p.id=protestos_registros.certidao_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.protestos_registros FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.protestos_certidoes p WHERE p.id=protestos_registros.certidao_id AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='recebiveis_cartao' LOOP
 EXECUTE format('DROP POLICY %I ON public.recebiveis_cartao',p.policyname); END LOOP;
END $$;
ALTER TABLE public.recebiveis_cartao ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recebiveis_cartao TO authenticated;
REVOKE ALL ON public.recebiveis_cartao FROM anon;
CREATE POLICY financeiro_read ON public.recebiveis_cartao FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.recebiveis_cartao FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.recebiveis_cartao FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.recebiveis_cartao FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='receita_ambientes' LOOP
 EXECUTE format('DROP POLICY %I ON public.receita_ambientes',p.policyname); END LOOP;
END $$;
ALTER TABLE public.receita_ambientes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receita_ambientes TO authenticated;
REVOKE ALL ON public.receita_ambientes FROM anon;
CREATE POLICY financeiro_read ON public.receita_ambientes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_ambientes.workday_id_fk AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.receita_ambientes FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_ambientes.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.receita_ambientes FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_ambientes.workday_id_fk AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_ambientes.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.receita_ambientes FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_ambientes.workday_id_fk AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='receita_caixas' LOOP
 EXECUTE format('DROP POLICY %I ON public.receita_caixas',p.policyname); END LOOP;
END $$;
ALTER TABLE public.receita_caixas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receita_caixas TO authenticated;
REVOKE ALL ON public.receita_caixas FROM anon;
CREATE POLICY financeiro_read ON public.receita_caixas FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_caixas.workday_id_fk AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.receita_caixas FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_caixas.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.receita_caixas FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_caixas.workday_id_fk AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_caixas.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.receita_caixas FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_caixas.workday_id_fk AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='receita_cancelamentos' LOOP
 EXECUTE format('DROP POLICY %I ON public.receita_cancelamentos',p.policyname); END LOOP;
END $$;
ALTER TABLE public.receita_cancelamentos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receita_cancelamentos TO authenticated;
REVOKE ALL ON public.receita_cancelamentos FROM anon;
CREATE POLICY financeiro_read ON public.receita_cancelamentos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_cancelamentos.workday_id_fk AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.receita_cancelamentos FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_cancelamentos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.receita_cancelamentos FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_cancelamentos.workday_id_fk AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_cancelamentos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.receita_cancelamentos FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_cancelamentos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='receita_cancelamentos_detalhe' LOOP
 EXECUTE format('DROP POLICY %I ON public.receita_cancelamentos_detalhe',p.policyname); END LOOP;
END $$;
ALTER TABLE public.receita_cancelamentos_detalhe ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receita_cancelamentos_detalhe TO authenticated;
REVOKE ALL ON public.receita_cancelamentos_detalhe FROM anon;
CREATE POLICY financeiro_read ON public.receita_cancelamentos_detalhe FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_cancelamentos_detalhe.workday_id_fk AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.receita_cancelamentos_detalhe FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_cancelamentos_detalhe.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.receita_cancelamentos_detalhe FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_cancelamentos_detalhe.workday_id_fk AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_cancelamentos_detalhe.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.receita_cancelamentos_detalhe FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_cancelamentos_detalhe.workday_id_fk AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='receita_descontos' LOOP
 EXECUTE format('DROP POLICY %I ON public.receita_descontos',p.policyname); END LOOP;
END $$;
ALTER TABLE public.receita_descontos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receita_descontos TO authenticated;
REVOKE ALL ON public.receita_descontos FROM anon;
CREATE POLICY financeiro_read ON public.receita_descontos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_descontos.workday_id_fk AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.receita_descontos FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_descontos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.receita_descontos FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_descontos.workday_id_fk AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_descontos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.receita_descontos FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_descontos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='receita_descontos_detalhe' LOOP
 EXECUTE format('DROP POLICY %I ON public.receita_descontos_detalhe',p.policyname); END LOOP;
END $$;
ALTER TABLE public.receita_descontos_detalhe ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receita_descontos_detalhe TO authenticated;
REVOKE ALL ON public.receita_descontos_detalhe FROM anon;
CREATE POLICY financeiro_read ON public.receita_descontos_detalhe FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_descontos_detalhe.workday_id_fk AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.receita_descontos_detalhe FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_descontos_detalhe.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.receita_descontos_detalhe FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_descontos_detalhe.workday_id_fk AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_descontos_detalhe.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.receita_descontos_detalhe FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_descontos_detalhe.workday_id_fk AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='receita_dias' LOOP
 EXECUTE format('DROP POLICY %I ON public.receita_dias',p.policyname); END LOOP;
END $$;
ALTER TABLE public.receita_dias ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receita_dias TO authenticated;
REVOKE ALL ON public.receita_dias FROM anon;
CREATE POLICY financeiro_read ON public.receita_dias FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.receita_dias FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.receita_dias FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.receita_dias FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='receita_grupos' LOOP
 EXECUTE format('DROP POLICY %I ON public.receita_grupos',p.policyname); END LOOP;
END $$;
ALTER TABLE public.receita_grupos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receita_grupos TO authenticated;
REVOKE ALL ON public.receita_grupos FROM anon;
CREATE POLICY financeiro_read ON public.receita_grupos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_grupos.workday_id_fk AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.receita_grupos FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_grupos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.receita_grupos FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_grupos.workday_id_fk AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_grupos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.receita_grupos FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_grupos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='receita_horarios' LOOP
 EXECUTE format('DROP POLICY %I ON public.receita_horarios',p.policyname); END LOOP;
END $$;
ALTER TABLE public.receita_horarios ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receita_horarios TO authenticated;
REVOKE ALL ON public.receita_horarios FROM anon;
CREATE POLICY financeiro_read ON public.receita_horarios FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_horarios.workday_id_fk AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.receita_horarios FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_horarios.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.receita_horarios FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_horarios.workday_id_fk AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_horarios.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.receita_horarios FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_horarios.workday_id_fk AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='receita_pagamentos' LOOP
 EXECUTE format('DROP POLICY %I ON public.receita_pagamentos',p.policyname); END LOOP;
END $$;
ALTER TABLE public.receita_pagamentos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receita_pagamentos TO authenticated;
REVOKE ALL ON public.receita_pagamentos FROM anon;
CREATE POLICY financeiro_read ON public.receita_pagamentos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_pagamentos.workday_id_fk AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.receita_pagamentos FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_pagamentos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.receita_pagamentos FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_pagamentos.workday_id_fk AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_pagamentos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.receita_pagamentos FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_pagamentos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='receita_produtos_dia' LOOP
 EXECUTE format('DROP POLICY %I ON public.receita_produtos_dia',p.policyname); END LOOP;
END $$;
ALTER TABLE public.receita_produtos_dia ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receita_produtos_dia TO authenticated;
REVOKE ALL ON public.receita_produtos_dia FROM anon;
CREATE POLICY financeiro_read ON public.receita_produtos_dia FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_produtos_dia.workday_id_fk AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.receita_produtos_dia FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_produtos_dia.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.receita_produtos_dia FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_produtos_dia.workday_id_fk AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_produtos_dia.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.receita_produtos_dia FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_produtos_dia.workday_id_fk AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='receita_turnos' LOOP
 EXECUTE format('DROP POLICY %I ON public.receita_turnos',p.policyname); END LOOP;
END $$;
ALTER TABLE public.receita_turnos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receita_turnos TO authenticated;
REVOKE ALL ON public.receita_turnos FROM anon;
CREATE POLICY financeiro_read ON public.receita_turnos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_turnos.workday_id_fk AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.receita_turnos FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_turnos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.receita_turnos FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_turnos.workday_id_fk AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_turnos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.receita_turnos FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_turnos.workday_id_fk AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='receita_usuarios' LOOP
 EXECUTE format('DROP POLICY %I ON public.receita_usuarios',p.policyname); END LOOP;
END $$;
ALTER TABLE public.receita_usuarios ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receita_usuarios TO authenticated;
REVOKE ALL ON public.receita_usuarios FROM anon;
CREATE POLICY financeiro_read ON public.receita_usuarios FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_usuarios.workday_id_fk AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.receita_usuarios FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_usuarios.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.receita_usuarios FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_usuarios.workday_id_fk AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_usuarios.workday_id_fk AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.receita_usuarios FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.receita_dias p WHERE p.id=receita_usuarios.workday_id_fk AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='reconciliacoes_sugeridas' LOOP
 EXECUTE format('DROP POLICY %I ON public.reconciliacoes_sugeridas',p.policyname); END LOOP;
END $$;
ALTER TABLE public.reconciliacoes_sugeridas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliacoes_sugeridas TO authenticated;
REVOKE ALL ON public.reconciliacoes_sugeridas FROM anon;
CREATE POLICY financeiro_read ON public.reconciliacoes_sugeridas FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.reconciliacoes_sugeridas FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.reconciliacoes_sugeridas FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.reconciliacoes_sugeridas FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='regras_classificacao' LOOP
 EXECUTE format('DROP POLICY %I ON public.regras_classificacao',p.policyname); END LOOP;
END $$;
ALTER TABLE public.regras_classificacao ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regras_classificacao TO authenticated;
REVOKE ALL ON public.regras_classificacao FROM anon;
CREATE POLICY financeiro_read ON public.regras_classificacao FOR SELECT TO authenticated USING ((public.financeiro_can_read(unit_id) OR (unit_id IS NULL AND public.financeiro_has_membership())));
CREATE POLICY financeiro_insert ON public.regras_classificacao FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.regras_classificacao FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.regras_classificacao FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='titulo_override' LOOP
 EXECUTE format('DROP POLICY %I ON public.titulo_override',p.policyname); END LOOP;
END $$;
ALTER TABLE public.titulo_override ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.titulo_override TO authenticated;
REVOKE ALL ON public.titulo_override FROM anon;
CREATE POLICY financeiro_read ON public.titulo_override FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.titulos_a_pagar p WHERE p.id=titulo_override.titulo_id AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.titulo_override FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.titulos_a_pagar p WHERE p.id=titulo_override.titulo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.titulo_override FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.titulos_a_pagar p WHERE p.id=titulo_override.titulo_id AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.titulos_a_pagar p WHERE p.id=titulo_override.titulo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.titulo_override FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.titulos_a_pagar p WHERE p.id=titulo_override.titulo_id AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='titulos_a_pagar' LOOP
 EXECUTE format('DROP POLICY %I ON public.titulos_a_pagar',p.policyname); END LOOP;
END $$;
ALTER TABLE public.titulos_a_pagar ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.titulos_a_pagar TO authenticated;
REVOKE ALL ON public.titulos_a_pagar FROM anon;
CREATE POLICY financeiro_read ON public.titulos_a_pagar FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.titulos_a_pagar FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.titulos_a_pagar FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.titulos_a_pagar FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='unit_cnpjs' LOOP
 EXECUTE format('DROP POLICY %I ON public.unit_cnpjs',p.policyname); END LOOP;
END $$;
ALTER TABLE public.unit_cnpjs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unit_cnpjs TO authenticated;
REVOKE ALL ON public.unit_cnpjs FROM anon;
CREATE POLICY financeiro_read ON public.unit_cnpjs FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.unit_cnpjs FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.unit_cnpjs FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.unit_cnpjs FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='vendas_consolidado_ambiente' LOOP
 EXECUTE format('DROP POLICY %I ON public.vendas_consolidado_ambiente',p.policyname); END LOOP;
END $$;
ALTER TABLE public.vendas_consolidado_ambiente ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas_consolidado_ambiente TO authenticated;
REVOKE ALL ON public.vendas_consolidado_ambiente FROM anon;
CREATE POLICY financeiro_read ON public.vendas_consolidado_ambiente FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_ambiente.periodo_id AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.vendas_consolidado_ambiente FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_ambiente.periodo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.vendas_consolidado_ambiente FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_ambiente.periodo_id AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_ambiente.periodo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.vendas_consolidado_ambiente FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_ambiente.periodo_id AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='vendas_consolidado_dia_semana' LOOP
 EXECUTE format('DROP POLICY %I ON public.vendas_consolidado_dia_semana',p.policyname); END LOOP;
END $$;
ALTER TABLE public.vendas_consolidado_dia_semana ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas_consolidado_dia_semana TO authenticated;
REVOKE ALL ON public.vendas_consolidado_dia_semana FROM anon;
CREATE POLICY financeiro_read ON public.vendas_consolidado_dia_semana FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_dia_semana.periodo_id AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.vendas_consolidado_dia_semana FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_dia_semana.periodo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.vendas_consolidado_dia_semana FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_dia_semana.periodo_id AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_dia_semana.periodo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.vendas_consolidado_dia_semana FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_dia_semana.periodo_id AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='vendas_consolidado_funcionarios' LOOP
 EXECUTE format('DROP POLICY %I ON public.vendas_consolidado_funcionarios',p.policyname); END LOOP;
END $$;
ALTER TABLE public.vendas_consolidado_funcionarios ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas_consolidado_funcionarios TO authenticated;
REVOKE ALL ON public.vendas_consolidado_funcionarios FROM anon;
CREATE POLICY financeiro_read ON public.vendas_consolidado_funcionarios FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_funcionarios.periodo_id AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.vendas_consolidado_funcionarios FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_funcionarios.periodo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.vendas_consolidado_funcionarios FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_funcionarios.periodo_id AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_funcionarios.periodo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.vendas_consolidado_funcionarios FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_funcionarios.periodo_id AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='vendas_consolidado_mensal' LOOP
 EXECUTE format('DROP POLICY %I ON public.vendas_consolidado_mensal',p.policyname); END LOOP;
END $$;
ALTER TABLE public.vendas_consolidado_mensal ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas_consolidado_mensal TO authenticated;
REVOKE ALL ON public.vendas_consolidado_mensal FROM anon;
CREATE POLICY financeiro_read ON public.vendas_consolidado_mensal FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_mensal.periodo_id AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.vendas_consolidado_mensal FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_mensal.periodo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.vendas_consolidado_mensal FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_mensal.periodo_id AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_mensal.periodo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.vendas_consolidado_mensal FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_mensal.periodo_id AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='vendas_consolidado_periodo' LOOP
 EXECUTE format('DROP POLICY %I ON public.vendas_consolidado_periodo',p.policyname); END LOOP;
END $$;
ALTER TABLE public.vendas_consolidado_periodo ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas_consolidado_periodo TO authenticated;
REVOKE ALL ON public.vendas_consolidado_periodo FROM anon;
CREATE POLICY financeiro_read ON public.vendas_consolidado_periodo FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_insert ON public.vendas_consolidado_periodo FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_update ON public.vendas_consolidado_periodo FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_delete ON public.vendas_consolidado_periodo FOR DELETE TO authenticated USING (public.financeiro_can_write(unit_id));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='vendas_consolidado_produtos' LOOP
 EXECUTE format('DROP POLICY %I ON public.vendas_consolidado_produtos',p.policyname); END LOOP;
END $$;
ALTER TABLE public.vendas_consolidado_produtos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas_consolidado_produtos TO authenticated;
REVOKE ALL ON public.vendas_consolidado_produtos FROM anon;
CREATE POLICY financeiro_read ON public.vendas_consolidado_produtos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_produtos.periodo_id AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.vendas_consolidado_produtos FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_produtos.periodo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.vendas_consolidado_produtos FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_produtos.periodo_id AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_produtos.periodo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.vendas_consolidado_produtos FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_produtos.periodo_id AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='vendas_consolidado_resumo' LOOP
 EXECUTE format('DROP POLICY %I ON public.vendas_consolidado_resumo',p.policyname); END LOOP;
END $$;
ALTER TABLE public.vendas_consolidado_resumo ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas_consolidado_resumo TO authenticated;
REVOKE ALL ON public.vendas_consolidado_resumo FROM anon;
CREATE POLICY financeiro_read ON public.vendas_consolidado_resumo FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_resumo.periodo_id AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.vendas_consolidado_resumo FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_resumo.periodo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.vendas_consolidado_resumo FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_resumo.periodo_id AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_resumo.periodo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.vendas_consolidado_resumo FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_resumo.periodo_id AND public.financeiro_can_write(p.unit_id)));

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='vendas_consolidado_turno' LOOP
 EXECUTE format('DROP POLICY %I ON public.vendas_consolidado_turno',p.policyname); END LOOP;
END $$;
ALTER TABLE public.vendas_consolidado_turno ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas_consolidado_turno TO authenticated;
REVOKE ALL ON public.vendas_consolidado_turno FROM anon;
CREATE POLICY financeiro_read ON public.vendas_consolidado_turno FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_turno.periodo_id AND public.financeiro_can_read(p.unit_id)));
CREATE POLICY financeiro_insert ON public.vendas_consolidado_turno FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_turno.periodo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_update ON public.vendas_consolidado_turno FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_turno.periodo_id AND public.financeiro_can_write(p.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_turno.periodo_id AND public.financeiro_can_write(p.unit_id)));
CREATE POLICY financeiro_delete ON public.vendas_consolidado_turno FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.vendas_consolidado_periodo p WHERE p.id=vendas_consolidado_turno.periodo_id AND public.financeiro_can_write(p.unit_id)));

-- Sequence grants only for the financial tables, not the other applications.
DO $$ DECLARE s record; BEGIN
 FOR s IN SELECT pg_get_serial_sequence(format('public.%I',c.table_name),c.column_name) seq
 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=ANY(ARRAY['conferencias','contas_bancarias','contratos','contratos_arquivos','dre_contratos_fixos','dre_despesa_detalhada','dre_faturamento_historico','dre_folha','dre_gorjeta_mensal','dre_indicadores','dre_kpis_mensais','dre_linhas_detalhadas','dre_manutencao_detalhada','dre_mensal','dre_pessoal_detalhado','dre_prestadores','dre_receita_detalhada','dre_snapshot','financeiro_importacoes','fornecedores','fornecedores_depara','kpi_snapshot','lancamentos','mapa_conta_dre','metas','movimentacoes_caixa','nfe_documentos','nfe_importacoes','payroll_extrato_dominio_colaborador','payroll_extrato_dominio_competencia','payroll_extrato_dominio_linha','payroll_extrato_dominio_rubrica','payroll_extrato_dominio_totais','plano_contas','produtos_catalogo','produtos_depara','produtos_relatorio','protestos_certidoes','protestos_registros','recebiveis_cartao','receita_ambientes','receita_caixas','receita_cancelamentos','receita_cancelamentos_detalhe','receita_descontos','receita_descontos_detalhe','receita_dias','receita_grupos','receita_horarios','receita_pagamentos','receita_produtos_dia','receita_turnos','receita_usuarios','reconciliacoes_sugeridas','regras_classificacao','titulo_override','titulos_a_pagar','unit_cnpjs','vendas_consolidado_ambiente','vendas_consolidado_dia_semana','vendas_consolidado_funcionarios','vendas_consolidado_mensal','vendas_consolidado_periodo','vendas_consolidado_produtos','vendas_consolidado_resumo','vendas_consolidado_turno'])
 LOOP IF s.seq IS NOT NULL THEN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',s.seq); END IF; END LOOP;
END $$;

INSERT INTO storage.buckets(id,name,public) VALUES ('contratos','contratos',false) ON CONFLICT(id) DO NOTHING;

-- Storage policies use unit folders. Existing flat protesto files remain founder-only.
CREATE OR REPLACE FUNCTION public.financeiro_storage_unit(p_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = public
AS $$ BEGIN RETURN split_part(p_name,'/',1)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END $$;
REVOKE ALL ON FUNCTION public.financeiro_storage_unit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_storage_unit(text) TO authenticated;
CREATE POLICY financeiro_contratos_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='contratos' AND public.financeiro_can_read(public.financeiro_storage_unit(name)));
CREATE POLICY financeiro_contratos_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='contratos' AND public.financeiro_can_write(public.financeiro_storage_unit(name)));
CREATE POLICY financeiro_contratos_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='contratos' AND public.financeiro_can_write(public.financeiro_storage_unit(name))) WITH CHECK (bucket_id='contratos' AND public.financeiro_can_write(public.financeiro_storage_unit(name)));
CREATE POLICY financeiro_contratos_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='contratos' AND public.financeiro_can_write(public.financeiro_storage_unit(name)));
CREATE POLICY financeiro_protestos_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='protestos' AND public.financeiro_can_read(public.financeiro_storage_unit(name)));
CREATE POLICY financeiro_protestos_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='protestos' AND public.financeiro_can_write(public.financeiro_storage_unit(name)));
CREATE POLICY financeiro_protestos_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='protestos' AND public.financeiro_can_write(public.financeiro_storage_unit(name))) WITH CHECK (bucket_id='protestos' AND public.financeiro_can_write(public.financeiro_storage_unit(name)));
CREATE POLICY financeiro_protestos_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='protestos' AND public.financeiro_can_write(public.financeiro_storage_unit(name)));

-- Financial views must preserve the caller's row permissions.
DO $$ DECLARE v text; BEGIN
 FOREACH v IN ARRAY ARRAY['v_receita_canonico','v_dre_canonico','v_dre_consolidado','v_fonte_saude'] LOOP
 IF to_regclass('public.' || v) IS NOT NULL THEN EXECUTE format('ALTER VIEW public.%I SET (security_invoker=true)',v); END IF;
 END LOOP;
END $$;
-- Keep archived files subject to the same read/write separation.
DROP POLICY IF EXISTS financeiro_importacoes_storage_delete ON storage.objects;
DROP POLICY IF EXISTS financeiro_importacoes_storage_insert ON storage.objects;
DROP POLICY IF EXISTS financeiro_importacoes_storage_read ON storage.objects;
DROP POLICY IF EXISTS financeiro_importacoes_storage_update ON storage.objects;
DROP POLICY IF EXISTS folha_documentos_delete ON storage.objects;
DROP POLICY IF EXISTS folha_documentos_read ON storage.objects;
DROP POLICY IF EXISTS folha_documentos_write ON storage.objects;
CREATE POLICY financeiro_archive_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN ('financeiro-importacoes','folha-documentos') AND public.financeiro_can_read(public.financeiro_storage_unit(name)));
CREATE POLICY financeiro_archive_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('financeiro-importacoes','folha-documentos') AND public.financeiro_can_write(public.financeiro_storage_unit(name)));
CREATE POLICY financeiro_archive_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('financeiro-importacoes','folha-documentos') AND public.financeiro_can_write(public.financeiro_storage_unit(name))) WITH CHECK (bucket_id IN ('financeiro-importacoes','folha-documentos') AND public.financeiro_can_write(public.financeiro_storage_unit(name)));
CREATE POLICY financeiro_archive_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('financeiro-importacoes','folha-documentos') AND public.financeiro_can_write(public.financeiro_storage_unit(name)));

-- A source revision makes stale indicators detectable after failed refreshes.
CREATE TABLE public.financeiro_revisoes (
 unit_id uuid PRIMARY KEY REFERENCES public.units(id), revisao bigint NOT NULL DEFAULT 1
);
ALTER TABLE public.financeiro_revisoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.financeiro_revisoes TO authenticated;
GRANT ALL ON public.financeiro_revisoes TO service_role;
CREATE POLICY financeiro_revision_read ON public.financeiro_revisoes FOR SELECT TO authenticated USING (public.financeiro_can_read(unit_id));
CREATE POLICY financeiro_revision_insert ON public.financeiro_revisoes FOR INSERT TO authenticated WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY financeiro_revision_update ON public.financeiro_revisoes FOR UPDATE TO authenticated USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));
ALTER TABLE public.kpi_snapshot ADD COLUMN revisao_fonte bigint NOT NULL DEFAULT 0;
INSERT INTO public.financeiro_revisoes(unit_id) SELECT DISTINCT unit_id FROM public.kpi_snapshot ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.financeiro_source_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE old_unit uuid; new_unit uuid; parent_id uuid;
BEGIN
 IF TG_TABLE_NAME IN ('regras_classificacao','produtos_depara','produtos_catalogo','fornecedores_depara','fornecedores','plano_contas') THEN
  INSERT INTO public.financeiro_revisoes(unit_id) SELECT id FROM public.units WHERE current_user='service_role' OR public.financeiro_can_write(id)
  ON CONFLICT(unit_id) DO UPDATE SET revisao=financeiro_revisoes.revisao+1;
  RETURN NULL;
 END IF;
 IF TG_TABLE_NAME='lancamentos' THEN
  IF TG_OP <> 'INSERT' AND OLD.origem IN ('manual','inventario') THEN old_unit:=OLD.unit_id; END IF;
  IF TG_OP <> 'DELETE' AND NEW.origem IN ('manual','inventario') THEN new_unit:=NEW.unit_id; END IF;
 ELSIF TG_TABLE_NAME='receita_cancelamentos' THEN
  IF TG_OP <> 'INSERT' THEN SELECT unit_id INTO old_unit FROM public.receita_dias WHERE id=OLD.workday_id_fk; END IF;
  IF TG_OP <> 'DELETE' THEN SELECT unit_id INTO new_unit FROM public.receita_dias WHERE id=NEW.workday_id_fk; END IF;
 ELSE
  IF TG_OP <> 'INSERT' THEN old_unit := OLD.unit_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_unit := NEW.unit_id; END IF;
 END IF;
 IF old_unit IS NOT NULL THEN INSERT INTO public.financeiro_revisoes(unit_id) VALUES(old_unit) ON CONFLICT(unit_id) DO UPDATE SET revisao=financeiro_revisoes.revisao+1; END IF;
 IF new_unit IS NOT NULL AND new_unit IS DISTINCT FROM old_unit THEN INSERT INTO public.financeiro_revisoes(unit_id) VALUES(new_unit) ON CONFLICT(unit_id) DO UPDATE SET revisao=financeiro_revisoes.revisao+1; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.financeiro_source_changed() FROM PUBLIC,anon;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['titulos_a_pagar','produtos_relatorio','receita_dias','payroll_extrato_dominio_competencia','payroll_extrato_dominio_linha','receita_cancelamentos','lancamentos','regras_classificacao','produtos_depara','produtos_catalogo','fornecedores_depara','fornecedores','plano_contas'] LOOP
 EXECUTE format('CREATE TRIGGER financeiro_revision AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.financeiro_source_changed()',t);
 END LOOP;
END $$;

-- A batch is one database transaction. Dynamic identifiers are quoted, tables
-- are allowlisted and SECURITY INVOKER preserves every row policy above.
CREATE OR REPLACE FUNCTION public.financeiro_aplicar_lote(p_operations jsonb, p_expected jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
 op jsonb; row_data jsonb; scope jsonb; tbl text; kind text;
 cols text; conflict_cols text; update_cols text; statement text; n integer; actual_revision bigint; predicates text; allowed_columns text[];
 allowed text[] := ARRAY[
 'lancamentos','dre_snapshot','kpi_snapshot','metas','reconciliacoes_sugeridas','protestos_certidoes','protestos_registros',
 'titulos_a_pagar','produtos_relatorio','nfe_documentos','nfe_importacoes',
 'payroll_extrato_dominio_competencia','payroll_extrato_dominio_colaborador',
 'payroll_extrato_dominio_linha','payroll_extrato_dominio_rubrica',
 'receita_dias','receita_pagamentos','receita_ambientes','receita_turnos',
 'receita_grupos','receita_descontos','receita_descontos_detalhe',
 'receita_cancelamentos','receita_cancelamentos_detalhe','receita_horarios',
 'receita_usuarios','receita_produtos_dia','receita_caixas','financeiro_importacoes',
 'vendas_consolidado_periodo','vendas_consolidado_produtos','vendas_consolidado_resumo',
 'vendas_consolidado_funcionarios','vendas_consolidado_ambiente','vendas_consolidado_turno',
 'vendas_consolidado_dia_semana','vendas_consolidado_mensal'
 ];
BEGIN
 IF auth.uid() IS NULL AND current_user <> 'service_role' THEN RAISE EXCEPTION 'Não autorizado' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_operations) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lote inválido'; END IF;
 -- Serialize replacement commits (no delete/insert interleaving).
 PERFORM pg_advisory_xact_lock(hashtextextended('financeiro_importacao',0));
 IF p_expected IS NOT NULL THEN
  SELECT revisao INTO actual_revision FROM public.financeiro_revisoes WHERE unit_id=(p_expected->>'unit_id')::uuid FOR UPDATE;
  IF coalesce(actual_revision,0) <> (p_expected->>'revisao')::bigint THEN RAISE EXCEPTION 'As fontes mudaram durante o cálculo. Tente novamente.' USING ERRCODE='40001'; END IF;
 END IF;
 FOR op IN SELECT value FROM jsonb_array_elements(p_operations) LOOP
  tbl := op->>'table'; kind := op->>'operation';
  IF tbl IS NULL OR NOT tbl=ANY(allowed) THEN RAISE EXCEPTION 'Tabela não permitida'; END IF;
  SELECT array_agg(column_name::text) INTO allowed_columns FROM information_schema.columns WHERE table_schema='public' AND table_name=tbl;
  IF kind='delete' THEN
   scope := op->'scope';
   IF scope IS NULL OR jsonb_typeof(scope)<>'object' OR scope='{}'::jsonb THEN RAISE EXCEPTION 'Exclusão sem escopo'; END IF;
   -- RLS may hide unauthorized rows; explicitly reject a denied unit so a
   -- replacement cannot silently succeed without replacing its old version.
   IF scope ? 'unit_id' AND current_user <> 'service_role' AND NOT public.financeiro_can_write((scope->>'unit_id')::uuid) THEN RAISE EXCEPTION 'Unidade não autorizada' USING ERRCODE='42501'; END IF;
   SELECT string_agg(CASE WHEN scope->key='null'::jsonb THEN format('t.%I IS NULL',key)
     ELSE format('t.%I = (jsonb_populate_record(NULL::public.%I,$1)).%I',key,tbl,key) END,' AND '),count(*)
     INTO predicates,n FROM jsonb_object_keys(scope) key WHERE key=ANY(allowed_columns);
   IF n<>(SELECT count(*) FROM jsonb_object_keys(scope)) THEN RAISE EXCEPTION 'Coluna de escopo inválida'; END IF;
   EXECUTE format('DELETE FROM public.%I t WHERE %s',tbl,predicates) USING scope;
  ELSIF kind IN ('insert','upsert') THEN
   IF jsonb_typeof(op->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Linhas inválidas'; END IF;
   FOR row_data IN SELECT value FROM jsonb_array_elements(op->'rows') LOOP
    IF jsonb_typeof(row_data)<>'object' OR row_data='{}'::jsonb THEN RAISE EXCEPTION 'Linha inválida'; END IF;
    SELECT string_agg(format('%I',key),',' ORDER BY key), count(*) INTO cols,n
    FROM jsonb_object_keys(row_data) key WHERE key=ANY(allowed_columns);
    IF n<>(SELECT count(*) FROM jsonb_object_keys(row_data)) THEN RAISE EXCEPTION 'Coluna inválida em %',tbl; END IF;
    statement := format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1)',tbl,cols,cols,tbl);
    IF kind='upsert' THEN
     IF coalesce(op->>'conflict','')='' THEN RAISE EXCEPTION 'Chave de conflito obrigatória'; END IF;
     SELECT string_agg(format('%I',key),',') INTO conflict_cols FROM unnest(string_to_array(op->>'conflict',',')) key;
     SELECT string_agg(format('%I=EXCLUDED.%I',key,key),',') INTO update_cols FROM jsonb_object_keys(row_data) key WHERE NOT key=ANY(string_to_array(op->>'conflict',','));
     statement := statement || format(' ON CONFLICT (%s) ',conflict_cols) || CASE WHEN coalesce((op->>'ignoreDuplicates')::boolean,false) OR update_cols IS NULL THEN 'DO NOTHING' ELSE 'DO UPDATE SET ' || update_cols END;
    END IF;
    EXECUTE statement USING row_data;
   END LOOP;
  ELSE RAISE EXCEPTION 'Operação inválida'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.financeiro_aplicar_lote(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_aplicar_lote(jsonb,jsonb) TO authenticated, service_role;
