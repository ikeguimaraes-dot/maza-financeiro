import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { shouldUseFinanceiroRouter } = loadTs('lib/maza/ui/nav/navigation.ts');

test('navegação interna preserva o app e aceita filtros e dashboard', () => {
  for (const href of ['/financeiro', '/dashboard', '/financeiro/pagar?competencia=2026-08-01', '/financeiro?consolidado=1', '/dashboard#indicadores']) {
    assert.equal(shouldUseFinanceiroRouter(href, '/financeiro/dre'), true, href);
  }
});

test('outras zonas, URLs externas e logout continuam com navegação nativa', () => {
  for (const href of ['/auth/sign-out', '/mise', '/pessoas', 'https://maza-maza.vercel.app/dashboard', '//outro.example/financeiro', '/financeiro-outro', '#', undefined]) {
    assert.equal(shouldUseFinanceiroRouter(href, '/financeiro'), false, href);
  }
  assert.equal(shouldUseFinanceiroRouter('/financeiro', '/mise'), false);
});
