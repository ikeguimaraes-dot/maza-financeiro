import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/load-ts.mjs';
const {contasOperacionais,categoriaOperacional}=loadTs('src/lib/dre/regras-operacionais.ts');
test('utilidades reconhecem contas de consumo sem confundir água para revenda ou limpeza',()=>{
 assert.equal(categoriaOperacional('CONSUMO ÁGUA'),'Água e esgoto');
 assert.equal(categoriaOperacional('CONSUMO DE ENERGIA'),'Energia elétrica');
 assert.equal(categoriaOperacional('AGUA SANITARIA'),null);
 assert.equal(categoriaOperacional('BEBIDAS - AGUA'),null);
 const t=(descricao,v)=>({id:descricao,descricao_c_gerencial:descricao,v_titulo:v,d_competencia:'2026-08-01',ref_mes:null});
 const rows=[t('ALUGUEL',43217.64),t('ENERGIA',8494.18),t('CONSUMO ÁGUA',6167.82),t('INTERNET',333.56)];
 assert.equal(contasOperacionais('Ocupação',rows,[])[0].total,43217.64);
 assert.equal(contasOperacionais('Utilidades',rows,[]).reduce((s,c)=>s+c.total,0),14995.56);
 assert.equal(contasOperacionais('Manutenção',rows,[])[0].total,0);
});
test('administrativo inclui somente Cintia e soma pagamento e bonificação sem descontar nem somar vale',()=>{
 const f=(nome,etapa,pagamento,bonificacao)=>({nome,etapa,pagamento,bonificacao,competencia:'2026-08'});
 const rows=[f('CINTIA OLIVEIRA DE CARVALHO','mensal',3253.42,2772.99),f('CINTIA OLIVEIRA DE CARVALHO','adiantamento',1004.60,1845.36),f('OUTRA PESSOA','mensal',9999,0)];
 const c=contasOperacionais('Administrativo',[],rows);
 assert.equal(c.length,1);assert.equal(c[0].total,6026.41);assert.equal(c[0].meses['2026-08-01'],6026.41);
});
test('impostos usam lançamentos da planilha e financeiro inclui apenas contabilidade',()=>{
 const t=(id,descricao,valor,status)=>({id,descricao_c_gerencial:descricao,v_titulo:valor,d_competencia:'2026-07-01',liquidacao_origem:status});
 const rows=[t('1','IMPOSTOS - PIS **YOSHIMORI**',2439.70,'OK'),t('2','IMPOSTOS - COFINS **YOSHIMORI**',11255.53,'**'),t('3','CONTABILIDADE - ***YOSHIMORI***',3500,'OK - confirmado pelo usuário'),t('4','BEBIDAS',100,'OK')];
 const imposto=contasOperacionais('Impostos',rows,[]);
 assert.equal(imposto.length,2);assert.equal(imposto.reduce((s,c)=>s+c.total,0),13695.23);
 assert.equal(imposto[0].pagamentos_confirmados['2026-07-01'],true);
 assert.equal(imposto[1].pagamentos_confirmados['2026-07-01'],false);
 const financeiro=contasOperacionais('Despesas Financeiras',rows,[]);
 assert.equal(financeiro.length,1);assert.equal(financeiro[0].total,3500);
 assert.equal(financeiro[0].pagamentos_confirmados['2026-07-01'],true);
});
