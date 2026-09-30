import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { calcularCmvCasa } = loadTs('src/lib/financeiro/cmv-casa.ts');

test('CMV da casa usa compras, inclusive sem classificação, sem folha ou saldo de estoque', () => {
  const compras = [{ v_custo_total: 119984.55, calcula_cmv: false, desc_gerencial: null, q_estoque: 999 }];
  const resultado = calcularCmvCasa(compras, 605115.53);
  assert.equal(resultado.total, 119984.55);
  assert.equal(resultado.imposto, 60511.55);
  assert.equal(resultado.gorjeta, 42358.09);
  assert.equal(resultado.baseReceita, 502245.89);
  assert.equal(resultado.percentual.toFixed(2), '23.89');
});

test('receita ausente ou zero não produz percentual enganoso; compras somam em centavos', () => {
  const compras = [{ v_custo_total: -0.1 }, { v_custo_total: 0.2 }, { v_custo_total: null }];
  assert.equal(calcularCmvCasa(compras, null).total, 0.3);
  assert.equal(calcularCmvCasa(compras, null).percentual, null);
  assert.equal(calcularCmvCasa(compras, null).baseReceita, null);
  assert.equal(calcularCmvCasa(compras, 0).percentual, null);
  assert.equal(calcularCmvCasa([], 100).total, 0);
  assert.equal(calcularCmvCasa([], 100).percentual, 0);
});

test('deduz 10% e 7% do recebido, sem aplicar percentuais em sequência', () => {
  const resultado = calcularCmvCasa([{ v_custo_total: 249 }], 1000);
  assert.equal(resultado.imposto, 100);
  assert.equal(resultado.gorjeta, 70);
  assert.equal(resultado.baseReceita, 830);
  assert.equal(resultado.percentual, 30);
  assert.equal(calcularCmvCasa([], -100).percentual, null);
});
