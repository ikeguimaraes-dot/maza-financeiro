import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/load-ts.mjs';
const {visibleFinanceiroGroups}=loadTs('lib/maza/ui/nav/visible.ts');
test('remove atalhos pedidos e preserva NF-e Entrada mesmo compartilhando URL com relatório',()=>{
 const item=(label,href)=>({label,href,icon:'Circle'});
 const groups=[{id:'financeiro',items:[{label:'DRE',icon:'Circle',children:[item('Budget','/financeiro/orcamento'),item('Análise de Vendas','/financeiro/dre/receita/analise-vendas'),item('NF-e Entrada','/financeiro/dre/cmv')]},item('Relatório de Produtos','/financeiro/dre/cmv'),item('Orçamento','/financeiro/orcamento')]}];
 const resultado=visibleFinanceiroGroups(groups);
 assert.equal(resultado[0].items.length,1);
 assert.equal(resultado[0].items[0].children.length,1);
 assert.equal(resultado[0].items[0].children[0].label,'NF-e Entrada');
 assert.equal(groups[0].items.length,3);
});
test('posiciona contas a receber acima de Receita sem duplicar e preserva entrada original sem Receita',()=>{
 const receber={label:'Contas a receber',href:'/financeiro/receber',icon:'Banknote'};
 const receita={label:'Receita',href:'/financeiro/dre/receita',icon:'Circle'};
 const groups=[{id:'financeiro',items:[{label:'DRE',icon:'Circle',children:[receita]},receber]}];
 const result=visibleFinanceiroGroups(groups);
 assert.equal(result[0].items.length,1);
 assert.equal(result[0].items[0].children[0].href,receber.href);
 assert.equal(result[0].items[0].children[1].href,receita.href);
 assert.equal(visibleFinanceiroGroups([{id:'financeiro',items:[receber]}])[0].items[0].href,receber.href);
 assert.equal(groups[0].items.length,2);
});
