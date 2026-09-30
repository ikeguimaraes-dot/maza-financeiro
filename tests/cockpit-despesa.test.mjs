import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/load-ts.mjs';
const {calcularDespesa}=loadTs('src/components/financeiro/cockpit/despesa.ts');
test('despesa soma pagamento e bonificação mensais sem vale e títulos por competência sem NF pedidos ou outras unidades',()=>{
 const folha=[{unit_id:'a',competencia:'2026-08',etapa:'mensal',pagamento:100,bonificacao:20},{unit_id:'a',competencia:'2026-08',etapa:'adiantamento',pagamento:30,bonificacao:5},{unit_id:'b',competencia:'2026-08',etapa:'mensal',pagamento:900,bonificacao:0}];
 const titulo={unit_id:'a',origem:'contas_pagar',v_titulo:200,d_competencia:'2026-08-01',d_lancamento:'2026-07-01',d_vencimento:'2026-09-01'};
 const result=calcularDespesa(['a'],'2026-08-01',folha,[titulo,{...titulo,origem:'nf_pedidos'},{...titulo,unit_id:'b'},{...titulo,d_competencia:null,d_lancamento:null,d_vencimento:'2026-08-10',v_titulo:10}]);
 assert.equal(result.total,330);assert.equal(result.folha,120);assert.equal(result.contas,210);assert.equal(result.parcial,null);
});
test('consolidado sinaliza fonte ausente e não confunde ausência com total completo',()=>{
 const result=calcularDespesa(['a','b'],'2026-08-01',[{unit_id:'a',competencia:'2026-08',etapa:'mensal',pagamento:0,bonificacao:0}],[]);
 assert.equal(result.total,0);assert.equal(result.temDados,true);assert.match(result.parcial,/Folha Empresa e Contas a Pagar/);
 assert.equal(calcularDespesa(['a'],'2026-08-01',[],[]).temDados,false);
});
