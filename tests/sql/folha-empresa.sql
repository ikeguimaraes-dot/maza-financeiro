BEGIN;
INSERT INTO units(id,name) VALUES('00000000-0000-0000-0000-000000000001','Teste A'),('00000000-0000-0000-0000-000000000002','Teste B');
INSERT INTO roles(id,name) VALUES('00000000-0000-0000-0000-000000000010','operador');
INSERT INTO user_roles(user_id,role_id,unit_id) VALUES('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000100',true);
SELECT importar_folha_empresa('[{"unit_id":"00000000-0000-0000-0000-000000000001","competencia":"2026-08","etapa":"mensal","nome":"Ana","nome_chave":"ANA","pagamento":100,"bonificacao":20,"arquivo":"teste.xlsx"},{"unit_id":"00000000-0000-0000-0000-000000000001","competencia":"2026-08","etapa":"mensal","nome":"Bia","nome_chave":"BIA","pagamento":99,"arquivo":"teste.xlsx"}]');
SELECT importar_folha_empresa('[{"unit_id":"00000000-0000-0000-0000-000000000001","competencia":"2026-08","etapa":"mensal","nome":"Ana","nome_chave":"ANA","pagamento":null,"bonificacao":0,"arquivo":"atualizado.xlsx"}]');
DO $$ BEGIN
 IF (SELECT count(*) FROM folha_empresa)<>2 OR (SELECT pagamento FROM folha_empresa WHERE nome_chave='ANA')<>100 OR (SELECT bonificacao FROM folha_empresa WHERE nome_chave='ANA')<>0 THEN RAISE EXCEPTION 'Incremental/zero/blank preservation failed'; END IF;
 IF (SELECT count(*) FROM folha_empresa_competencias('00000000-0000-0000-0000-000000000001'))<>1 THEN RAISE EXCEPTION 'Month list failed'; END IF;
 BEGIN
 PERFORM importar_folha_empresa('[{"unit_id":"00000000-0000-0000-0000-000000000001","competencia":"2026-08","etapa":"mensal","nome":"Ana","nome_chave":"ANA","pagamento":500,"arquivo":"teste.xlsx"},{"unit_id":"00000000-0000-0000-0000-000000000002","competencia":"2026-08","etapa":"mensal","nome":"X","nome_chave":"X","pagamento":100,"arquivo":"teste.xlsx"}]');
 RAISE EXCEPTION 'Cross-unit write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT pagamento FROM folha_empresa WHERE nome_chave='ANA')<>100 THEN RAISE EXCEPTION 'Atomic rollback failed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM folha_empresa)<>0 THEN RAISE EXCEPTION 'Payroll leaked'; END IF;
 IF (SELECT count(*) FROM folha_empresa_competencias('00000000-0000-0000-0000-000000000001'))<>0 THEN RAISE EXCEPTION 'Month list leaked'; END IF;
END $$;
ROLLBACK;
