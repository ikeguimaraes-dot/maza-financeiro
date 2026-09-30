import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const {parseNfeXml,inferDirection}=loadTs('src/lib/nfe/parser.ts');
const {comprasSemDuplicidade}=loadTs('src/lib/financeiro/razao/deduplicar.ts');
const {saldoTitulo}=loadTs('src/lib/financeiro/pagar/pagamentos.ts');
const {classificarLiquidacao}=loadTs('src/lib/financeiro/fluxo/liquidacao.ts');
test('fornecedor repetido não determina saída e XML original é preservado',()=>{
 const xml='<NFe><infNFe Id="NFe11111111111111111111111111111111111111111111"><ide><dhEmi>2026-08-01T10:00:00-03:00</dhEmi></ide><emit><CNPJ>11111111000111</CNPJ></emit><dest><CNPJ>22222222000122</CNPJ></dest></infNFe></NFe>';
 const note=parseNfeXml(xml,'teste.xml');assert.equal(note.xmlOriginal,xml);assert.equal(inferDirection([note,note]),null);
});
test('cancelamento é reconhecido apenas com evento e protocolo aceito',()=>{
 const xml='<procEventoNFe><evento><infEvento><chNFe>11111111111111111111111111111111111111111111</chNFe><tpEvento>110111</tpEvento><dhEvento>2026-08-01</dhEvento></infEvento></evento><retEvento><infEvento><cStat>135</cStat></infEvento></retEvento></procEventoNFe>';
 assert.equal(parseNfeXml(xml,'evento.xml').eventoCancelamento,true);
 assert.throws(()=>parseNfeXml(xml.replace('135','999'),'evento.xml'));
});
test('compra parcial não elimina contas a pagar do mesmo mês',()=>{
 const base={n_nota_fiscal:'1',fantasia_fornecedor:'F',razao_fornecedor:null,valor_total_nf_origem:null};
 const compra={...base,origem:'nf_pedidos',v_titulo:100};const titulo={...base,origem:'contas_pagar',v_titulo:50};
 assert.equal(comprasSemDuplicidade([compra,titulo],()=> 'f').length,2);
 assert.equal(comprasSemDuplicidade([compra,{...titulo,v_titulo:100}],()=> 'f').length,1);
 assert.equal(comprasSemDuplicidade([compra,{...titulo,v_titulo:100,n_nota_fiscal:'2'}],()=> 'f').length,2);
 assert.equal(comprasSemDuplicidade([compra,{...titulo,v_titulo:100}],()=> undefined).length,2);
});
test('baixa parcial e estorno preservam o saldo e não ressuscitam OK antigo',()=>{
 const p={id:'p',titulo_id:'t',data:'2026-08-01',valor:40,comprovante:'teste',estornado_em:null};
 assert.equal(saldoTitulo(100,'OK',[p]).saldo,60);
 assert.equal(saldoTitulo(100,'OK',[{...p,estornado_em:'2026-08-02'}]).saldo,100);
 assert.equal(saldoTitulo(100,'OK',[]).saldo,0);
 for(const flag of ['*','**','***','TOTAL 123',null,''])assert.equal(classificarLiquidacao(flag),'indefinido');
});
