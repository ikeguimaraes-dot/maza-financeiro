-- Incremental imports preserve title identity and all absent rows.
CREATE OR REPLACE FUNCTION public.financeiro_importar_titulos(p_rows jsonb, p_operations jsonb DEFAULT '[]'::jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r jsonb; old_row jsonb; matches integer; saved integer:=0; rid text; seen text[]:=ARRAY[]::text[];
BEGIN
 IF auth.uid() IS NULL AND current_user <> 'service_role' THEN RAISE EXCEPTION 'Não autorizado'; END IF;
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)=0 THEN RAISE EXCEPTION 'Importação vazia'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('financeiro_importacao',0));
 PERFORM public.financeiro_aplicar_lote(p_operations);
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF current_user <> 'service_role' AND (NOT public.financeiro_can_write((r->>'unit_id')::uuid) OR NOT public.financeiro_can_write((r->>'import_unit_id')::uuid)) THEN RAISE EXCEPTION 'Unidade não autorizada'; END IF;
  IF r->>'unit_id' IS NULL OR r->>'import_unit_id' IS NULL OR r->>'v_titulo' IS NULL OR r->>'origem' IS NULL OR (r->>'v_titulo')::numeric < 0 OR r->>'origem' NOT IN ('contas_pagar','nf_pedidos') THEN RAISE EXCEPTION 'Título inválido'; END IF;
  -- Explicit ERP identity first; spreadsheet identity otherwise. Value is NOT identity.
  SELECT count(*), min(t.id) INTO matches,rid FROM public.titulos_a_pagar t
   WHERE t.import_unit_id=(r->>'import_unit_id')::uuid AND t.origem=r->>'origem'
   AND ((r->>'id' IS NOT NULL AND t.id=r->>'id') OR
    (t.d_competencia=(r->>'d_competencia')::date
     AND upper(trim(coalesce(t.fantasia_fornecedor,t.razao_fornecedor,'')))=upper(trim(coalesce(r->>'fantasia_fornecedor',r->>'razao_fornecedor','')))
     AND coalesce(t.n_nota_fiscal,'')=coalesce(r->>'n_nota_fiscal','')
     AND coalesce(t.parcela,'')=coalesce(r->>'parcela','')
     AND (nullif(r->>'n_nota_fiscal','') IS NOT NULL OR
       (t.d_lancamento IS NOT DISTINCT FROM (r->>'d_lancamento')::date AND t.d_vencimento IS NOT DISTINCT FROM (r->>'d_vencimento')::date
        AND coalesce(t.c_gerencial,'')=coalesce(r->>'c_gerencial','')))));
  IF matches>1 THEN RAISE EXCEPTION 'Mais de um título corresponde a fornecedor %, nota %, parcela %. Confira a identidade antes de importar.',r->>'fantasia_fornecedor',r->>'n_nota_fiscal',r->>'parcela'; END IF;
  IF matches=1 THEN
   SELECT to_jsonb(t) INTO old_row FROM public.titulos_a_pagar t WHERE t.id=rid FOR UPDATE;
   IF EXISTS(SELECT 1 FROM public.titulo_pagamentos WHERE titulo_id=rid) THEN
    IF old_row->>'unit_id' <> r->>'unit_id' OR (r->>'v_titulo')::numeric < (SELECT coalesce(sum(valor),0) FROM public.titulo_pagamentos WHERE titulo_id=rid AND estornado_em IS NULL) THEN
     RAISE EXCEPTION 'Título com pagamento registrado: a importação não pode trocar a unidade nem reduzir o valor abaixo do pago.';
    END IF;
   END IF;
   -- Do not overwrite bank-confirmed payments or their audit trail from a spreadsheet.
   r := jsonb_strip_nulls(r) - 'id' - 'n_titulo' - 'v_pagamento' - 'd_liquidacao';
   r := old_row || r || jsonb_build_object('id',rid,'importado_em',now());
  ELSE
   rid:=coalesce(r->>'id',gen_random_uuid()::text);
   r:=jsonb_strip_nulls(r)||jsonb_build_object('id',rid,'n_titulo',coalesce(r->>'n_titulo',rid),'importado_em',now());
  END IF;
  IF rid=ANY(seen) THEN RAISE EXCEPTION 'Arquivo contém linhas com a mesma identidade de título. Informe a parcela ou desambigue as linhas.'; END IF;
  seen:=array_append(seen,rid);
  PERFORM public.financeiro_aplicar_lote(jsonb_build_array(jsonb_build_object('table','titulos_a_pagar','operation','upsert','conflict','id','rows',jsonb_build_array(r))));
  saved:=saved+1;
 END LOOP;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.financeiro_importar_titulos(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.financeiro_importar_titulos(jsonb,jsonb) TO authenticated,service_role;

ALTER TABLE public.nfe_documentos ADD COLUMN IF NOT EXISTS xml_original text;
ALTER TABLE public.nfe_documentos ADD COLUMN IF NOT EXISTS xml_cancelamento text;

CREATE TABLE public.titulo_pagamentos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 unit_id uuid NOT NULL REFERENCES public.units(id),
 titulo_id text NOT NULL REFERENCES public.titulos_a_pagar(id),
 conta_id uuid NOT NULL REFERENCES public.contas_bancarias(id),
 data date NOT NULL, valor numeric(14,2) NOT NULL CHECK(valor>0),
 comprovante text NOT NULL CHECK(length(trim(comprovante))>0),
 criado_por uuid NOT NULL, criado_em timestamptz NOT NULL DEFAULT now(),
 estornado_em timestamptz, estornado_por uuid,
 pedido_id uuid NOT NULL UNIQUE
);
CREATE INDEX titulo_pagamentos_titulo ON public.titulo_pagamentos(titulo_id);
ALTER TABLE public.titulo_pagamentos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.titulo_pagamentos TO authenticated;
GRANT ALL ON public.titulo_pagamentos TO service_role;
CREATE POLICY pagamentos_read ON public.titulo_pagamentos FOR SELECT TO authenticated USING(public.financeiro_can_read(unit_id));

CREATE FUNCTION public.financeiro_registrar_pagamento(p_titulo text,p_conta uuid,p_data date,p_valor numeric,p_comprovante text,p_pedido uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.titulos_a_pagar; pago numeric; pid uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autorizado'; END IF;
 SELECT * INTO t FROM public.titulos_a_pagar WHERE id=p_titulo FOR UPDATE;
 IF t.id IS NULL OR NOT public.financeiro_can_write(t.unit_id) OR t.origem<>'contas_pagar' THEN RAISE EXCEPTION 'Título não autorizado'; END IF;
 IF nullif(t.n_nota_fiscal,'') IS NOT NULL AND EXISTS(SELECT 1 FROM public.titulos_a_pagar d WHERE d.id<>t.id AND d.unit_id=t.unit_id AND d.origem=t.origem AND d.n_nota_fiscal=t.n_nota_fiscal AND upper(trim(coalesce(d.fantasia_fornecedor,d.razao_fornecedor,'')))=upper(trim(coalesce(t.fantasia_fornecedor,t.razao_fornecedor,''))) AND d.parcela IS NOT DISTINCT FROM t.parcela AND d.d_lancamento IS NOT DISTINCT FROM t.d_lancamento AND d.d_vencimento IS NOT DISTINCT FROM t.d_vencimento) THEN RAISE EXCEPTION 'Possível duplicidade de título. Confira a planilha antes de registrar o pagamento.'; END IF;
 SELECT id INTO pid FROM public.titulo_pagamentos WHERE pedido_id=p_pedido AND titulo_id=p_titulo;
 IF pid IS NOT NULL THEN RETURN pid; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.titulo_pagamentos WHERE titulo_id=p_titulo) AND (upper(trim(coalesce(t.liquidacao_origem,''))) LIKE 'OK%' OR upper(trim(coalesce(t.liquidacao_origem,'')))='OIK') THEN RAISE EXCEPTION 'Título já informado como pago pela planilha. Confira antes de registrar novo pagamento.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contas_bancarias WHERE id=p_conta AND unit_id=t.unit_id AND ativo) THEN RAISE EXCEPTION 'Selecione uma conta ativa da unidade'; END IF;
 SELECT coalesce(sum(valor),0) INTO pago FROM public.titulo_pagamentos WHERE titulo_id=p_titulo AND estornado_em IS NULL;
 IF p_valor IS NULL OR p_valor<=0 OR round(p_valor,2)<>p_valor OR pago+p_valor>abs(t.v_titulo) THEN RAISE EXCEPTION 'Valor excede o saldo do título ou é inválido'; END IF;
 IF p_data IS NULL OR p_data>CURRENT_DATE OR nullif(trim(p_comprovante),'') IS NULL THEN RAISE EXCEPTION 'Informe data realizada e referência do comprovante'; END IF;
 INSERT INTO public.titulo_pagamentos(unit_id,titulo_id,conta_id,data,valor,comprovante,criado_por,pedido_id)
 VALUES(t.unit_id,p_titulo,p_conta,p_data,p_valor,p_comprovante,auth.uid(),p_pedido) RETURNING id INTO pid;
 INSERT INTO public.movimentacoes_caixa(unit_id,conta_id,data,tipo,valor,descricao,origem,origem_id,conciliado)
 VALUES(t.unit_id,p_conta,p_data,'saida',p_valor,'Pagamento registrado: '||p_comprovante,'manual','pagamento:'||pid::text,true);
 RETURN pid;
END $$;
CREATE FUNCTION public.financeiro_estornar_pagamento(p_pagamento uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.titulo_pagamentos;
BEGIN
 SELECT * INTO p FROM public.titulo_pagamentos WHERE id=p_pagamento FOR UPDATE;
 IF auth.uid() IS NULL OR p.id IS NULL OR NOT public.financeiro_can_write(p.unit_id) THEN RAISE EXCEPTION 'Não autorizado'; END IF;
 IF p.estornado_em IS NOT NULL THEN RETURN; END IF;
 UPDATE public.titulo_pagamentos SET estornado_em=now(),estornado_por=auth.uid() WHERE id=p.id;
 INSERT INTO public.movimentacoes_caixa(unit_id,conta_id,data,tipo,valor,descricao,origem,origem_id,conciliado)
 VALUES(p.unit_id,p.conta_id,CURRENT_DATE,'entrada',p.valor,'Estorno de pagamento registrado','manual','estorno:'||p.id::text,true);
END $$;
REVOKE ALL ON FUNCTION public.financeiro_registrar_pagamento(text,uuid,date,numeric,text,uuid),public.financeiro_estornar_pagamento(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.financeiro_registrar_pagamento(text,uuid,date,numeric,text,uuid),public.financeiro_estornar_pagamento(uuid) TO authenticated;

-- Legacy item spreadsheets update their own items, never the whole month or XML rows.
CREATE FUNCTION public.financeiro_importar_produtos(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r jsonb; old_row jsonb; rid bigint; matches integer; saved integer:=0; seen bigint[]:=ARRAY[]::bigint[];
BEGIN
 IF auth.uid() IS NULL AND current_user <> 'service_role' THEN RAISE EXCEPTION 'Não autorizado'; END IF;
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)=0 THEN RAISE EXCEPTION 'Importação vazia'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('financeiro_importacao',0));
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF r->>'unit_id' IS NULL OR (current_user<>'service_role' AND NOT public.financeiro_can_write((r->>'unit_id')::uuid)) THEN RAISE EXCEPTION 'Unidade não autorizada'; END IF;
  IF r->>'chave_nfe' IS NOT NULL OR nullif(r->>'nr_danfe','') IS NULL OR coalesce(nullif(r->>'fornecedor_codigo',''),nullif(r->>'fornecedor_nome','')) IS NULL OR coalesce(nullif(r->>'item_codigo',''),nullif(r->>'item_descricao','')) IS NULL THEN RAISE EXCEPTION 'Informe nota, fornecedor e item para identificar a linha da planilha.'; END IF;
  SELECT count(*),min(p.id) INTO matches,rid FROM public.produtos_relatorio p WHERE p.chave_nfe IS NULL AND p.unit_id=(r->>'unit_id')::uuid
   AND p.nr_danfe=r->>'nr_danfe' AND p.mes_lancamento=(r->>'mes_lancamento')::integer AND p.ano_lancamento=(r->>'ano_lancamento')::integer
   AND coalesce(nullif(p.fornecedor_codigo,''),upper(trim(p.fornecedor_nome)))=coalesce(nullif(r->>'fornecedor_codigo',''),upper(trim(r->>'fornecedor_nome')))
   AND coalesce(nullif(p.item_codigo,''),upper(trim(p.item_descricao)))=coalesce(nullif(r->>'item_codigo',''),upper(trim(r->>'item_descricao')));
  IF matches>1 THEN RAISE EXCEPTION 'Itens repetidos na nota %. Confira a identidade antes de importar.',r->>'nr_danfe'; END IF;
  r:=jsonb_strip_nulls(r)-'id';
  IF matches=1 THEN
   IF rid=ANY(seen) THEN RAISE EXCEPTION 'O arquivo repete o mesmo item da nota. Informe códigos distintos.'; END IF;
   SELECT to_jsonb(p) INTO old_row FROM public.produtos_relatorio p WHERE id=rid FOR UPDATE;
   r:=old_row||r;
   PERFORM public.financeiro_aplicar_lote(jsonb_build_array(jsonb_build_object('table','produtos_relatorio','operation','upsert','conflict','id','rows',jsonb_build_array(r))));
   seen:=array_append(seen,rid);
  ELSE
   PERFORM public.financeiro_aplicar_lote(jsonb_build_array(jsonb_build_object('table','produtos_relatorio','operation','insert','rows',jsonb_build_array(r))));
   SELECT id INTO rid FROM public.produtos_relatorio p WHERE p.chave_nfe IS NULL AND p.unit_id=(r->>'unit_id')::uuid AND p.nr_danfe=r->>'nr_danfe' AND p.mes_lancamento=(r->>'mes_lancamento')::integer AND p.ano_lancamento=(r->>'ano_lancamento')::integer
    AND coalesce(nullif(p.fornecedor_codigo,''),upper(trim(p.fornecedor_nome)))=coalesce(nullif(r->>'fornecedor_codigo',''),upper(trim(r->>'fornecedor_nome')))
    AND coalesce(nullif(p.item_codigo,''),upper(trim(p.item_descricao)))=coalesce(nullif(r->>'item_codigo',''),upper(trim(r->>'item_descricao')));
   seen:=array_append(seen,rid);
  END IF;
  saved:=saved+1;
 END LOOP;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.financeiro_importar_produtos(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.financeiro_importar_produtos(jsonb) TO authenticated,service_role;
