import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/financeiro/cockpit/data.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { fetchCockpitRows, snapshotsAreStale } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("leitura paginada preserva todos os registros e compartilha o prazo entre páginas", async () => {
  const ranges = [];
  const signals = [];
  const rows = await fetchCockpitRows((from, to) => ({
    abortSignal(signal) {
      ranges.push([from, to]);
      signals.push(signal);
      return Promise.resolve({ data: Array.from({ length: from === 0 ? 1000 : 2 }, (_, i) => from + i), error: null });
    },
  }));
  assert.equal(rows.length, 1002);
  assert.equal(rows.at(-1), 1001);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
  assert.equal(signals[0], signals[1]);
  assert.equal(signals[0].aborted, false);
});

test("consulta parada é cancelada e sai do carregamento com erro", async () => {
  await assert.rejects(fetchCockpitRows(() => ({
    abortSignal(signal) {
      return new Promise(resolve => signal.addEventListener("abort", () => resolve({ data: null, error: { message: "aborted" } }), { once: true }));
    },
  }), 10), /demorou demais/);
});

test("erro do banco não é apresentado como dados vazios", async () => {
  await assert.rejects(fetchCockpitRows(() => ({
    abortSignal: async () => ({ data: null, error: { message: "permission denied" } }),
  })), /permission denied/);
});

test("prazo encerra o carregamento mesmo quando o cliente não responde ao cancelamento", async () => {
  let signal;
  await assert.rejects(fetchCockpitRows(() => ({
    abortSignal(value) {
      signal = value;
      return new Promise(() => {});
    },
  }), 10), /demorou demais/);
  assert.equal(signal.aborted, true);
});

test("avisa quando os resultados estão antigos ou falta uma unidade no consolidado", () => {
  const revisions = [{ unit_id: "a", revisao: 2 }];
  assert.equal(snapshotsAreStale([{ unit_id: "a", revisao_fonte: 2 }], revisions), false);
  assert.equal(snapshotsAreStale([{ unit_id: "a", revisao_fonte: 1 }], revisions), true);
  assert.equal(snapshotsAreStale([{ unit_id: "a", revisao_fonte: null }], revisions), true);
  assert.equal(snapshotsAreStale([], revisions), true);
  assert.equal(snapshotsAreStale([{ unit_id: "a", revisao_fonte: 2 }], [...revisions, { unit_id: "b", revisao: 1 }]), true);
});
