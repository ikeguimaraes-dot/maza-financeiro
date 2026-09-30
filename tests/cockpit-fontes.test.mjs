import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/components/financeiro/cockpit/data.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const data = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function action(auth, client) {
  return loadTs('src/components/financeiro/cockpit/fontes-actions.ts', {
    './data': data,
    '@maza/auth/server': { requireUser: auth },
    '@maza/db/supabase/server': { createSupabaseServerClient: client },
  }).carregarFontesSaude;
}

test('fontes exigem autenticação antes de consultar dados', async () => {
  let queried = false;
  const load = action(async () => { throw new Error('unauthorized'); }, async () => { queried = true; });
  await assert.rejects(load(), /unauthorized/);
  assert.equal(queried, false);
});

test('fontes preservam o resultado e consultam com o cliente da sessão', async () => {
  const rows = [{ fonte: 'receita_dias', ultima_escrita: null, dias_sem_atualizacao: null, status_fonte: 'morta' }];
  const query = {
    select() { return this; }, order() { return this; }, range() { return this; },
    async abortSignal() { return { data: rows, error: null }; },
  };
  const load = action(async () => ({}), async () => ({ from(table) { assert.equal(table, 'v_fonte_saude'); return query; } }));
  assert.deepEqual(Array.from(await load()), rows);
});
