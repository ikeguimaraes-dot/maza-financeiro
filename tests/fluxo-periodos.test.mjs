import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/load-ts.mjs';
const {agruparSemanas}=loadTs('src/lib/financeiro/fluxo/periodos.ts');
test('separa domingo de segunda e mantém saldos de abertura e fechamento',()=>{
 const dia=(data,inicial,final)=>({data,saldoInicial:inicial,saldoFinal:final,entradasRealizadas:10.10,entradasPrevistas:2.20,saidasRealizadas:3,saidasPrevistas:1,status:'realizado'});
 const rows=[dia('2026-08-01',50,58.3),dia('2026-08-02',58.3,66.6),dia('2026-08-03',66.6,74.9)];
 const result=agruparSemanas(rows);
 assert.equal(result.length,2); assert.equal(result[0].data,'2026-08-01'); assert.equal(result[0].fim,'2026-08-02');
 assert.equal(result[0].saldoInicial,50); assert.equal(result[0].saldoFinal,66.6); assert.equal(result[0].entradasRealizadas,20.2); assert.equal(result[0].entradasPrevistas,4.4);
 assert.equal(rows[0].entradasRealizadas,10.1);
});
