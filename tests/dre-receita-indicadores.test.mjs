import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/load-ts.mjs';
const {indicadoresReceita}=loadTs('src/lib/dre/receita-indicadores.ts');
test('influencers usa descontos e taxa usa 3% do recebido agrupados por mês',()=>{
 const r=indicadoresReceita([{id:'agosto',data:'2026-08-01',desconto:50905.66},{id:'julho',data:'2026-07-01',desconto:100}], [{workday_id_fk:'agosto',valor_recebido:605115.53},{workday_id_fk:'julho',valor_recebido:1000},{workday_id_fk:'outra-unidade',valor_recebido:999999}]);
 assert.equal(r.descontos['2026-08-01'],50905.66);
 assert.equal(r.recebido['2026-08-01'],605115.53);
 assert.equal(r.taxas['2026-08-01'],18153.47);
 assert.equal(r.taxas['2026-07-01'],30);
});
test('arredonda a taxa uma vez por mês e distingue ausência de recebimento de zero',()=>{
 const dias=[{id:'a',data:'2026-08-01',desconto:0},{id:'b',data:'2026-08-02',desconto:null}];
 assert.equal(indicadoresReceita(dias,[]).recebido['2026-08-01'],undefined);
 assert.equal(indicadoresReceita(dias,[{workday_id_fk:'a',valor_recebido:0}]).taxas['2026-08-01'],0);
 assert.equal(indicadoresReceita(dias,[{workday_id_fk:'a',valor_recebido:0.1},{workday_id_fk:'b',valor_recebido:0.1}]).taxas['2026-08-01'],0.01);
});
