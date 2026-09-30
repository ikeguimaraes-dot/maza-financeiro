import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/load-ts.mjs';
const {validarMetasSemanais,metaMensalSemanal,performanceMetas,resumirPerformanceMetas}=loadTs('src/lib/receita/metas.ts');
const semana=Array.from({length:7},(_,dia_semana)=>({dia_semana,meta:100}));
test('sete dias únicos, zero válido e rejeição de metas ausentes ou inválidas',()=>{
 assert.equal(validarMetasSemanais(semana),true);
 assert.equal(validarMetasSemanais(semana.map(x=>({...x,meta:0}))),true);
 for(const invalid of [semana.slice(1),[...semana.slice(1),semana[1]],semana.map(x=>({...x,meta:-1})),semana.map(x=>({...x,meta:NaN})),semana.map(x=>({...x,meta:1.234})),semana.map(x=>({...x,meta:'100'}))]) assert.equal(validarMetasSemanais(invalid),false);
});
test('performance soma metas por calendário e projeta apenas dias restantes',()=>{
 const metas=[30000,50000,60000,80000,110000,110000,60000].map((meta,i)=>({dia_semana:(i+1)%7,meta}));
 const linhas=performanceMetas(2026,9,metas,[{data:'2026-09-07',valor:98964}], '2026-09-23');
 assert.equal(linhas.map(l=>l.quantidade).join(','),'4,5,5,4,4,4,4');
 assert.equal(linhas.reduce((s,l)=>s+l.periodo,0),2110000);
 assert.equal(linhas[0].realizado,98964);
 assert.equal(linhas[0].projecao,128964);
 assert.equal(linhas.reduce((s,l)=>s+l.acumulada,0),1610000);
 const encerrado=performanceMetas(2026,9,metas,[{data:'2026-09-07',valor:98964}], '2026-10-01');
 assert.equal(encerrado.reduce((s,l)=>s+l.projecao,0),98964);
 const futuro=performanceMetas(2026,10,metas,[], '2026-09-23');
 assert.equal(futuro.reduce((s,l)=>s+l.acumulada,0),0);
 assert.equal(futuro.reduce((s,l)=>s+l.projecao,0),futuro.reduce((s,l)=>s+l.periodo,0));
});
test('performance preserva exceções por data, zero, centavos e receita do mês',()=>{
 const linhas=performanceMetas(2026,9,semana,[{data:'2026-08-31',valor:999},{data:'2026-09-07',valor:1.11},{data:'2026-09-07',valor:2.22}], '2026-09-23',[{data:'2026-09-28',meta:0}]);
 assert.equal(linhas[0].realizado,3.33); assert.equal(linhas[0].projecao,3.33);assert.equal(linhas[0].periodo,300);
 assert.equal(performanceMetas(2026,9,[],[],'2026-09-23')[0].meta,null);
});
test('meta mensal conta todas as datas e respeita exceção zero e ano bissexto',()=>{
 assert.equal(metaMensalSemanal(2026,9,semana),3000);
 assert.equal(metaMensalSemanal(2024,2,semana),2900);
 assert.equal(metaMensalSemanal(2026,9,semana,[{data:'2026-09-07',meta:0}]),2900);
 assert.equal(metaMensalSemanal(2026,9,semana.map(x=>({...x,meta:x.dia_semana===1?100:0}))),400);
 assert.equal(metaMensalSemanal(2026,9,[]),null);
});

test('totais parciais não desaparecem quando um dia fica sem meta',()=>{
 const metas=semana.filter(m=>m.dia_semana!==0);
 const total=resumirPerformanceMetas(performanceMetas(2026,9,metas,[{data:'2026-09-07',valor:50}], '2026-09-23'));
 assert.equal(total.diasDefinidos,6);
 assert.equal(total.diaria,600);
 assert.equal(total.periodo,2600);
 assert.equal(total.realizado,50);
 assert.equal(total.projecao,650);
 const vazio=resumirPerformanceMetas(performanceMetas(2026,8,[],[{data:'2026-08-03',valor:123}], '2026-09-23'));
 assert.equal(vazio.diasDefinidos,0);
 assert.equal(vazio.projecao,123);
 const completo=resumirPerformanceMetas(performanceMetas(2026,9,[...metas,{dia_semana:0,meta:0}],[], '2026-09-23'));
 assert.equal(completo.diasDefinidos,7);
 assert.equal(completo.periodo,total.periodo);
});
