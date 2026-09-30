import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { loadTs } from './helpers/load-ts.mjs';
const { lerFolhaEmpresa, selecionarAbas, totaisEmpresa, valorPlanilha } = loadTs('src/lib/folha/empresa/planilha.ts');
const { montarPainelEmpresa, totalizarPainelEmpresa } = loadTs('src/lib/folha/empresa/painel.ts');
test('vale soma os dois blocos do adiantamento uma única vez e inclui nomes exclusivos do vale', () => {
  const base = { arquivo:'teste.xlsx', fontes:{}, nome:'ANA', nome_chave:'ANA' };
  const linhas = montarPainelEmpresa([
    {...base,id:'1',etapa:'mensal',pagamento:100,bonificacao:20},
    {...base,id:'2',etapa:'adiantamento',pagamento:30,bonificacao:5.25},
    {...base,id:'3',nome:'BIA',nome_chave:'BIA',etapa:'adiantamento',pagamento:10,bonificacao:0},
  ]);
  assert.equal(linhas.length,2);
  assert.equal(linhas[0].vale,35.25);
  assert.equal(linhas[1].pagamento,null);
  assert.equal(totalizarPainelEmpresa(linhas).total,120);
  assert.equal(totalizarPainelEmpresa(linhas).vale,45.25);
  assert.equal(totalizarPainelEmpresa(linhas).pagamento,100);
});
function workbook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
const rows = [
  ['PAGAMENTO - AGOSTO/2026'], [null,'NOME','TOTAL'], [1,'JOSÉ SILVA','R$ 1.234,56'], [null,null,'R$ 1.234,56'],
  ['BONIFICAÇÃO - AGOSTO/2026'], [null,'NOME','TOTAL'], [1,'Jose  Silva',25.44], [2,'ANA','R$ -'], [3,'CARLA',''], [null,null,25.44],
];
test('soma pagamento e bonificação em centavos, sem duplicar subtotais ou inventar pessoas', () => {
  const [aba] = lerFolhaEmpresa(workbook({ AGOSTO: rows }));
  assert.equal(aba.competencia,'2026-08');
  assert.equal(aba.linhas.length,2);
  assert.equal(aba.linhas[0].pagamento,1234.56);
  assert.equal(aba.linhas[0].bonificacao,25.44);
  assert.equal(aba.linhas[1].pagamento,null);
  assert.equal(aba.linhas[1].bonificacao,0);
  assert.equal(JSON.stringify(totaisEmpresa(aba.linhas)),JSON.stringify({pagamento:1234.56,bonificacao:25.44,total:1260}));
  assert.equal(aba.avisos.length,1);
  assert.equal(aba.linhas[0].fontes.bonificacao,'AGOSTO!C7');
});
test('versões duplicadas exigem seleção; ano do cabeçalho é preservado até correção explícita', () => {
  const abas = lerFolhaEmpresa(workbook({ JUNHO: rows, 'JUNHO 2': rows, VALE: [['PAGAMENTO - ADIANTAMENTO MAIO/2025'],[1,'ANA',10]] }));
  assert.throws(() => selecionarAbas(abas, [{aba:'JUNHO',competencia:'2026-08'},{aba:'JUNHO 2',competencia:'2026-08'}]), /única versão/);
  assert.equal(abas[2].competencia,'2025-05');
  assert.equal(selecionarAbas(abas,[{aba:'VALE',competencia:'2026-05'}])[0].competencia,'2026-05');
  assert.equal(abas[2].competencia,'2025-05');
});
test('não une apelidos e rejeita nomes duplicados ou valores inválidos', () => {
  assert.equal(lerFolhaEmpresa(workbook({ A: [['PAGAMENTO - MAIO/2026'],[1,'HECTOR',10],[2,'HECTOR SILVA',20]] }))[0].linhas.length,2);
  assert.throws(() => lerFolhaEmpresa(workbook({ A: [['PAGAMENTO - MAIO/2026'],[1,'ANA',10],[2,'Ana',20]] })), /repetido/);
  for (const value of ['abc','R$ 1,2,3',-1,Infinity]) assert.throws(() => valorPlanilha(value));
  assert.equal(valorPlanilha(null),null);
  assert.equal(valorPlanilha('R$ -'),0);
});

test('total soma pagamento e bonificação; vale não altera total, inclusive quando é o único dado', () => {
 assert.equal(totalizarPainelEmpresa([{pagamento:100,bonificacao:20,vale:30}]).total,120);
 assert.equal(totalizarPainelEmpresa([{pagamento:100,bonificacao:20,vale:0}]).total,120);
 assert.equal(totalizarPainelEmpresa([{pagamento:100,bonificacao:20,vale:null}]).total,120);
 assert.equal(totalizarPainelEmpresa([{pagamento:null,bonificacao:null,vale:10}]).total,0);
 assert.equal(totalizarPainelEmpresa([{pagamento:26023.45,bonificacao:60548.73,vale:71191}]).total,86572.18);
});
