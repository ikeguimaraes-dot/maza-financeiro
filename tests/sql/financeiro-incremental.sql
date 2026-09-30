BEGIN;
INSERT INTO units(id,name) VALUES('00000000-0000-0000-0000-000000000001','Teste A');
INSERT INTO roles(id,name) VALUES('00000000-0000-0000-0000-000000000010','operador');
INSERT INTO user_roles(user_id,role_id,unit_id) VALUES('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000100',true);
INSERT INTO contas_bancarias(id,unit_id,banco,data_saldo_inicial) VALUES('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000001','Teste','2026-01-01');
SELECT financeiro_importar_titulos('[{"id":"original","unit_id":"00000000-0000-0000-0000-000000000001","import_unit_id":"00000000-0000-0000-0000-000000000001","origem":"contas_pagar","fantasia_fornecedor":"F","d_competencia":"2026-08-01","n_nota_fiscal":"123","parcela":"1/1","v_titulo":100},{"id":"ausente","unit_id":"00000000-0000-0000-0000-000000000001","import_unit_id":"00000000-0000-0000-0000-000000000001","origem":"contas_pagar","fantasia_fornecedor":"F","d_competencia":"2026-08-01","n_nota_fiscal":"124","v_titulo":99}]');
SELECT financeiro_importar_titulos('[{"unit_id":"00000000-0000-0000-0000-000000000001","import_unit_id":"00000000-0000-0000-0000-000000000001","origem":"contas_pagar","fantasia_fornecedor":"F","d_competencia":"2026-08-01","n_nota_fiscal":"123","parcela":"1/1","v_titulo":120}]');
DO $$ BEGIN
 IF (SELECT count(*) FROM titulos_a_pagar)<>2 OR (SELECT v_titulo FROM titulos_a_pagar WHERE id='original')<>120 THEN RAISE EXCEPTION 'Incremental import failed'; END IF;
END $$;
SELECT financeiro_registrar_pagamento('original','00000000-0000-0000-0000-000000000020','2026-08-20',40,'comprovante teste','00000000-0000-0000-0000-000000000030');
SELECT financeiro_registrar_pagamento('original','00000000-0000-0000-0000-000000000020','2026-08-20',40,'comprovante teste','00000000-0000-0000-0000-000000000030');
DO $$ BEGIN
 IF (SELECT count(*) FROM titulo_pagamentos)<>1 OR (SELECT count(*) FROM movimentacoes_caixa)<>1 THEN RAISE EXCEPTION 'Payment retry duplicated'; END IF;
 BEGIN
 PERFORM financeiro_registrar_pagamento('original','00000000-0000-0000-0000-000000000020','2026-08-20',100,'excede','00000000-0000-0000-0000-000000000031');
 RAISE EXCEPTION 'Overpayment accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Overpayment accepted' THEN RAISE; END IF; END;
END $$;
DO $$ BEGIN
 BEGIN
 PERFORM financeiro_importar_titulos('[{"id":"original","unit_id":"00000000-0000-0000-0000-000000000001","import_unit_id":"00000000-0000-0000-0000-000000000001","origem":"contas_pagar","fantasia_fornecedor":"F","d_competencia":"2026-08-01","n_nota_fiscal":"123","parcela":"1/1","v_titulo":30}]');
 RAISE EXCEPTION 'Paid title reduced'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Paid title reduced' THEN RAISE; END IF; END;
 IF (SELECT v_titulo FROM titulos_a_pagar WHERE id='original')<>120 THEN RAISE EXCEPTION 'Failed import did not roll back'; END IF;
 BEGIN
 UPDATE titulo_pagamentos SET valor=1;
 RAISE EXCEPTION 'Direct payment mutation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
 PERFORM financeiro_importar_titulos('[{"id":"original","unit_id":"00000000-0000-0000-0000-000000000001","import_unit_id":"00000000-0000-0000-0000-000000000001","origem":"contas_pagar","v_titulo":150},{"id":"original","unit_id":"00000000-0000-0000-0000-000000000001","import_unit_id":"00000000-0000-0000-0000-000000000001","origem":"contas_pagar","v_titulo":160}]');
 RAISE EXCEPTION 'Duplicate identity accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Duplicate identity accepted' THEN RAISE; END IF; END;
 IF (SELECT v_titulo FROM titulos_a_pagar WHERE id='original')<>120 THEN RAISE EXCEPTION 'Duplicate import did not roll back'; END IF;
END $$;
SELECT financeiro_estornar_pagamento(id) FROM titulo_pagamentos;
DO $$ BEGIN
 IF (SELECT count(*) FROM movimentacoes_caixa)<>2 OR (SELECT count(*) FROM titulo_pagamentos WHERE estornado_em IS NULL)<>0 THEN RAISE EXCEPTION 'Reversal failed'; END IF;
END $$;
SELECT financeiro_importar_produtos('[{"unit_id":"00000000-0000-0000-0000-000000000001","nr_danfe":"500","fornecedor_codigo":"F","item_codigo":"A","mes_lancamento":8,"ano_lancamento":2026,"v_custo_total":100},{"unit_id":"00000000-0000-0000-0000-000000000001","nr_danfe":"501","fornecedor_codigo":"F","item_codigo":"B","mes_lancamento":8,"ano_lancamento":2026,"v_custo_total":50}]');
SELECT financeiro_importar_produtos('[{"unit_id":"00000000-0000-0000-0000-000000000001","nr_danfe":"500","fornecedor_codigo":"F","item_codigo":"A","mes_lancamento":8,"ano_lancamento":2026,"v_custo_total":110}]');
DO $$ BEGIN
 IF (SELECT count(*) FROM produtos_relatorio)<>2 OR (SELECT v_custo_total FROM produtos_relatorio WHERE nr_danfe='500')<>110 THEN RAISE EXCEPTION 'Incremental product import failed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM titulo_pagamentos)<>0 THEN RAISE EXCEPTION 'Payment leaked to outsider'; END IF;
END $$;
ROLLBACK;
