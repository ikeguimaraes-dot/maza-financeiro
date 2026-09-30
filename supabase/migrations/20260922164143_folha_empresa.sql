CREATE TABLE public.folha_empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id),
  competencia text NOT NULL CHECK (competencia ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  etapa text NOT NULL CHECK (etapa IN ('mensal','adiantamento')),
  nome_chave text NOT NULL CHECK (length(trim(nome_chave)) > 0),
  nome text NOT NULL CHECK (length(trim(nome)) > 0),
  pagamento numeric(14,2) CHECK (pagamento >= 0),
  bonificacao numeric(14,2) CHECK (bonificacao >= 0),
  fontes jsonb NOT NULL DEFAULT '{}'::jsonb,
  arquivo text NOT NULL,
  documento_path text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (pagamento IS NOT NULL OR bonificacao IS NOT NULL),
  UNIQUE(unit_id, competencia, etapa, nome_chave)
);
ALTER TABLE public.folha_empresa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.folha_empresa FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.folha_empresa TO authenticated;
GRANT ALL ON public.folha_empresa TO service_role;
CREATE POLICY folha_empresa_read ON public.folha_empresa FOR SELECT TO authenticated
  USING (public.financeiro_can_read(unit_id));
CREATE POLICY folha_empresa_insert ON public.folha_empresa FOR INSERT TO authenticated
  WITH CHECK (public.financeiro_can_write(unit_id));
CREATE POLICY folha_empresa_update ON public.folha_empresa FOR UPDATE TO authenticated
  USING (public.financeiro_can_write(unit_id)) WITH CHECK (public.financeiro_can_write(unit_id));

-- One atomic, repeatable import. Missing cells/people never erase stored data.
-- SECURITY INVOKER keeps the same unit RLS as ordinary authenticated queries.
CREATE FUNCTION public.importar_folha_empresa(p_linhas jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE quantidade integer;
BEGIN
  IF jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Lote da folha inválido';
  END IF;
  INSERT INTO public.folha_empresa AS atual
    (unit_id,competencia,etapa,nome_chave,nome,pagamento,bonificacao,fontes,arquivo,documento_path)
  SELECT unit_id,competencia,etapa,nome_chave,nome,pagamento,bonificacao,coalesce(fontes,'{}'::jsonb),arquivo,documento_path
    FROM jsonb_to_recordset(p_linhas) AS r(unit_id uuid,competencia text,etapa text,nome_chave text,nome text,
      pagamento numeric,bonificacao numeric,fontes jsonb,arquivo text,documento_path text)
  ON CONFLICT (unit_id,competencia,etapa,nome_chave) DO UPDATE SET
    nome=excluded.nome,
    pagamento=coalesce(excluded.pagamento,atual.pagamento),
    bonificacao=coalesce(excluded.bonificacao,atual.bonificacao),
    fontes=atual.fontes || excluded.fontes,
    arquivo=excluded.arquivo,
    documento_path=coalesce(excluded.documento_path,atual.documento_path),
    atualizado_em=now();
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  RETURN quantidade;
END $$;
REVOKE ALL ON FUNCTION public.importar_folha_empresa(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_folha_empresa(jsonb) TO authenticated, service_role;

CREATE FUNCTION public.folha_empresa_competencias(p_unit_id uuid)
RETURNS TABLE(competencia text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT DISTINCT f.competencia FROM public.folha_empresa f WHERE f.unit_id=p_unit_id ORDER BY f.competencia DESC;
$$;
REVOKE ALL ON FUNCTION public.folha_empresa_competencias(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.folha_empresa_competencias(uuid) TO authenticated, service_role;
