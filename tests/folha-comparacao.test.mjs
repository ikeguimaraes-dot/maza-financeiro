import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/load-ts.mjs';
const {mesAnterior,variacaoMensal}=loadTs('src/lib/folha/comparacao.ts');
test('comparação usa o mês imediatamente anterior inclusive na virada do ano',()=>{
 assert.equal(mesAnterior('2026-01'),'2025-12');
 assert.equal(mesAnterior('2026-08'),'2026-07');
 assert.ok(Math.abs(variacaoMensal(120,100)-20)<0.000001);
 assert.equal(variacaoMensal(0,100),-100);
 assert.equal(variacaoMensal(100,0),null);
 assert.equal(variacaoMensal(null,100),null);
 assert.equal(variacaoMensal(100,null),null);
});
