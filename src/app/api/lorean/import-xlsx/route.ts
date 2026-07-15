import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

// ═══════════════════════════════════════════════════════════════════════════
// EQUIVALÊNCIA COM /api/lorean/import (PDF) — leia antes de mexer em qualquer
// dos dois parsers.
//
// PDF e XLSX são o MESMO relatório do Lorean em formatos diferentes. O cron
// diário usa PDF (via Claude, WORKDAY_PROMPT/VENDA_PROMPT em
// src/app/api/lorean/import/route.ts). Esta rota é o equivalente pra quem tem
// o Excel em mãos — sem chamar IA, por regex. Os dois devem gravar o MESMO
// resultado em lorean_workdays/lorean_pagamentos/lorean_ambientes/
// lorean_turnos/lorean_horarios/lorean_grupos pro mesmo workday_id.
//
// Nenhum dos dois parsers tem lógica condicional por unidade (Meet/Madonna/
// Match) — o relatório é idêntico pra qualquer uma; qualquer variação de
// layout encontrada num arquivo real deve virar lógica ÚNICA que lida com
// os dois casos (ver comentário de extractVendaGrupos abaixo pra um exemplo),
// nunca um `if (unidade === X)`.
//
// Campos já validados batendo entre os dois formatos (cross-check: soma dos
// grupos = resumo do Movimento, nos arquivos reais disponíveis em planilhas/):
// receita_bruta (PREVISTO), devedor, clientes, gorjeta, desconto, custo,
// lucro, pagamentos (forma/fechado/recebido/diferença), ambientes, turnos,
// horários, grupos (bruto/desconto/gorjeta/consumo).
//
// GAP CONHECIDO — campos que o PDF extrai via WORKDAY_PROMPT e este parser
// XLSX ainda NÃO lê (ficam null/ausentes no banco quando importado por XLSX):
// abertura_at, fechamento_at, cmv_pct, ticket_medio, ticket_real,
// permanencia_media, descontos, descontos_detalhe, cancelamentos_detalhe,
// usuarios. Isso não foi comparado/corrigido nesta tarefa — a prova de
// equivalência direta PDF-vs-XLSX (mesmo workday, campo a campo) ficou
// bloqueada por falta de crédito na conta Anthropic; retomar quando houver
// crédito, usando o par de arquivos reais do Match (workday 468) em
// planilhas/ como caso de teste.
// ═══════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const CORS = {
  "Access-Control-Allow-Origin":  "https://kph-os.vercel.app",
  "Access-Control-Allow-Methods": "GET, POST",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { headers: CORS });
}

// ── Helpers de texto/número ──────────────────────────────────────────────────

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Aceita "R$ 6.613,00" (BR: '.' milhar, ',' decimal) e números crus tipo "6613" ou
// "6613.5". Só trata '.' como milhar quando há vírgula decimal na string.
function parseNumBR(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/^R\$\s*/i, "").replace(/[^\d.,-]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

// Mesma regex usada em /api/lorean/import (extractDateFromFilename) — garante
// que a data extraída do nome bate com o que o import de PDF já grava.
function extractDateFromFilename(filename: string): string | null {
  const m = filename.match(/\[(\d{2})\.(\d{2})\.(\d{2})\]/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  return `20${yy}-${mm}-${dd}`;
}

function isBlankRow(row: string[]): boolean {
  return row.every((c) => !c || !String(c).trim());
}

// Índice da 1ª linha cuja concatenação (maiúscula, sem acento) satisfaz `matches`.
function findHeaderRowIndex(rows: string[][], matches: (upperJoined: string) => boolean): number {
  for (let i = 0; i < rows.length; i++) {
    const joined = stripAccents(rows[i]!.join(" ")).toUpperCase();
    if (matches(joined)) return i;
  }
  return -1;
}

function extractLabelValue(text: string, label: string): number | null {
  const re = new RegExp(`${label}\\s*R?\\$?\\s*([\\d.,]+)`, "i");
  const m = text.match(re);
  return m ? parseNumBR(m[1]) : null;
}

// O relatório mistura 2 layouts pro MESMO tipo de dado: às vezes os valores estão
// em células separadas, às vezes crus numa única célula com múltiplos espaços
// como separador de coluna. Achatar a linha inteira (join " ") e cortar em blocos
// de 2+ espaços normaliza os dois casos pro mesmo formato de tokens.
function tokenizeRow(row: string[]): string[] {
  return row.join(" ").split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
}

// clientes (ACESSO): o resumo do dia vem como 2 linhas dentro da MESMA célula —
// uma linha de valores, uma linha de labels logo abaixo, pareadas por posição
// (ex: "012 ... \nACESSO ...").
function extractAcesso(rows: string[][]): number | null {
  for (const row of rows) {
    const cellText = String(row.find((c) => c && c.trim()) ?? "");
    if (!cellText.includes("\n")) continue;
    const lines = cellText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const labels = lines[1]!.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    const idx = labels.findIndex((l) => stripAccents(l).toUpperCase() === "ACESSO");
    if (idx === -1) continue;
    const values = lines[0]!.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    const v = values[idx];
    if (v != null) {
      const n = parseInt(v, 10);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

// PREVISTO = receita do dia (o que foi vendido: convite + produto + gorjeta ±
// pendência antiga de dia anterior). É a linha "=  R$ X,XX" logo depois do bloco
// Convite/Produto/Gorjeta/Pendência/Diferença Real — não é o mesmo que FECHADO
// (o que foi de fato reconciliado no caixa) nem RECEBIDO (o que entrou via
// pagamento); os três só coincidem quando não há devedor nem pendência antiga.
function extractPrevisto(rows: string[][]): number | null {
  for (const row of rows) {
    const text = row.join(" ").trim();
    if (text.startsWith("=")) return parseNumBR(text);
  }
  return null;
}

// Pagamento / Ambiente / Turno / Horário: linhas de dado começam com um ordinal
// "0Nº" — às vezes fundido ao nome no mesmo token ("01º Dinheiro"), às vezes
// separado ("01º" + "Salao"). Para de ler no 1º token sem ordinal (nova seção,
// linha de totais, ou a linha "espelho" com só números que o relatório repete).
function extractOrdinalRows(rows: string[][], headerIdx: number, maxRows = 60): Array<{ nome: string; nums: number[] }> {
  if (headerIdx === -1) return [];
  const out: Array<{ nome: string; nums: number[] }> = [];
  for (let i = headerIdx + 1; i < rows.length && out.length < maxRows; i++) {
    const row = rows[i]!;
    if (isBlankRow(row)) break;
    let tokens = tokenizeRow(row);
    if (tokens.length === 0) break;
    const ordMatch = tokens[0]!.match(/^(\d{1,3})º\s*(.*)$/);
    if (!ordMatch) break;
    const rest = ordMatch[2]!.trim();
    tokens = rest ? [rest, ...tokens.slice(1)] : tokens.slice(1);
    const nome = tokens.find((t) => /[A-Za-zÀ-ÿ]/.test(t) && !/^R\$/i.test(t));
    if (!nome) continue;
    const nums = tokens.filter((t) => t !== nome).map(parseNumBR).filter((n): n is number => n != null);
    out.push({ nome, nums });
  }
  return out;
}

// ── Row parsers específicos (nums já vêm de extractOrdinalRows) ────────────────

type PagamentoRow = { forma: string; valor_fechado: number | null; valor_recebido: number | null; diferenca: number | null };

function toPagamentoRow(r: { nome: string; nums: number[] }): PagamentoRow {
  return { forma: r.nome, valor_fechado: r.nums[0] ?? null, valor_recebido: r.nums[1] ?? null, diferenca: r.nums[2] ?? null };
}

type NomeQuadRow = { nome: string; clientes: number | null; gorjeta: number | null; produto: number | null; consumo: number | null };

// Colunas reais: Nome | Qtde | Gorjeta | Convite | Produto | Consumo — pula Convite
// (não faz parte do schema de destino, index 2 é descartado de propósito).
function toNomeQuadRow(r: { nome: string; nums: number[] }): NomeQuadRow {
  return { nome: r.nome, clientes: r.nums[0] ?? null, gorjeta: r.nums[1] ?? null, produto: r.nums[3] ?? null, consumo: r.nums[4] ?? null };
}

type HorarioRow = { hora: number; clientes: number | null; gorjeta: number | null; produto: number | null; consumo: number | null };

function toHorarioRow(r: { nome: string; nums: number[] }): HorarioRow | null {
  const hora = parseInt(r.nome, 10);
  if (isNaN(hora)) return null;
  return { hora, clientes: r.nums[0] ?? null, gorjeta: r.nums[1] ?? null, produto: r.nums[3] ?? null, consumo: r.nums[4] ?? null };
}

type GrupoRow = { grupo: string; qtde: number | null; bruto: number | null; desconto: number | null; gorjeta: number | null; consumo: number | null };

// Cada grupo (Venda) tem: linha de cabeçalho "<Nome>  Qtde  Garrafa  CMV  <Bruto
// ou Média>  Desconto  Gorjeta  Total", N linhas de produto, e uma linha de
// totais cujo primeiro token é um número puro (sem "º").
//
// IMPORTANTE — isto NÃO é lógica por unidade, é a MESMA função rodando pra
// qualquer arquivo. O relatório do Lorean, em exportações diferentes, pode
// imprimir essa coluna de preço unitário como "Bruto" (somável, aparece na linha
// de totais) ou como "Média" (preço médio — NÃO somável, a linha de totais
// simplesmente não soma essa coluna). Por isso a linha de totais tem 3 ou 4
// valores numéricos, mas os 3 ÚLTIMOS são sempre, nessa ordem, [desconto,
// gorjeta, consumo] — verificado em todos os arquivos reais disponíveis no
// momento desta escrita (2 exportações distintas, 4 vs 3 valores). bruto é
// DERIVADO (consumo + desconto - gorjeta, a mesma identidade contábil que o
// próprio relatório usa: total pago = bruto - desconto + gorjeta) em vez de
// lido direto — funciona nos dois casos sem precisar detectar qual coluna
// existe nem qual arquivo é. Qualquer novo caso real que quebre essa leitura
// deve ser corrigido AQUI, na mesma função — nunca com um `if` de unidade.
function extractVendaGrupos(rows: string[][]): GrupoRow[] {
  const grupos: GrupoRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const rowText = rows[i]!.join(" ");
    const m = rowText.match(/^\s*(.+?)\s+Qtde\b/i);
    if (!m) continue;
    const grupo = m[1]!.trim();
    if (!grupo) continue;
    // Sem limite de distância — grupos grandes (20+ produtos) têm a linha de
    // totais muitas linhas depois do cabeçalho. Para no próximo cabeçalho "Qtde".
    for (let j = i + 1; j < rows.length; j++) {
      const tokens = tokenizeRow(rows[j]!);
      if (tokens.length === 0) continue;
      if (/^\d+$/.test(tokens[0]!)) {
        const nums = tokens.slice(1).map(parseNumBR).filter((n): n is number => n != null);
        const n = nums.length;
        const desconto = n >= 3 ? nums[n - 3]! : null;
        const gorjeta  = n >= 2 ? nums[n - 2]! : null;
        const consumo  = n >= 1 ? nums[n - 1]! : null;
        const bruto = consumo != null && desconto != null && gorjeta != null
          ? consumo + desconto - gorjeta : null;
        grupos.push({ grupo, qtde: parseInt(tokens[0]!, 10), bruto, desconto, gorjeta, consumo });
        break;
      }
      if (/Qtde\b/i.test(rows[j]!.join(" "))) break; // achou outro cabeçalho antes da linha de totais — desiste deste grupo
    }
  }
  return grupos;
}

// ── Parsing dos arquivos ─────────────────────────────────────────────────────

type ParsedMovimento = {
  workday_id: number | null;
  data: string | null;
  clientes: number | null;
  receita_bruta: number | null; // PREVISTO — receita do dia (o que foi vendido)
  devedor: number | null;       // campo DEVEDOR do resumo
  bruto: number | null;         // campo BRUTO do resumo — informativo, sem coluna própria
  gorjeta: number | null;
  desconto: number | null;
  custo: number | null;
  lucro: number | null;
  pagamentos: PagamentoRow[];
  ambientes: NomeQuadRow[];
  turnos: NomeQuadRow[];
  horarios: HorarioRow[];
};

function sheetRows(buffer: Buffer): string[][] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  if (!sheet) throw new Error("planilha sem sheets");
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
}

function parseMovimento(buffer: Buffer, filename: string): ParsedMovimento {
  const rows = sheetRows(buffer);
  const flatText = rows.map((r) => (r ?? []).join(" ")).join("\n");

  const workdayIdMatch = flatText.match(/Workday:?\s*(\d+)/i);
  const workday_id = workdayIdMatch ? parseInt(workdayIdMatch[1]!, 10) : null;
  const data = extractDateFromFilename(filename);
  const clientes = extractAcesso(rows);

  const bruto    = extractLabelValue(flatText, "BRUTO");
  const gorjeta  = extractLabelValue(flatText, "GORJETA");
  const desconto = extractLabelValue(flatText, "DESCONTO");
  const custo    = extractLabelValue(flatText, "CUSTO");
  const lucro    = extractLabelValue(flatText, "LUCRO");
  const devedor  = extractLabelValue(flatText, "DEVEDOR:?");

  // Receita bruta = PREVISTO, não a soma dos pagamentos — PREVISTO já contabiliza
  // pendência antiga (devedor de dia anterior que caiu nesse caixa), que uma soma
  // de pagamentos do dia nunca capturaria.
  const receita_bruta = extractPrevisto(rows);

  // "Pagamento" (não "Método", que é a versão agrupada) — exige os dois tokens
  // no cabeçalho pra não confundir com a outra tabela.
  const pagIdx = findHeaderRowIndex(rows, (t) => t.includes("PAGAMENTO") && t.includes("RECEBIDO"));
  const pagamentos = extractOrdinalRows(rows, pagIdx).map(toPagamentoRow);

  // "Ambiente" tem prioridade sobre "Módulo" — são seções distintas no relatório,
  // mas o schema de destino só tem uma; ambiente é a mais próxima semanticamente.
  let ambIdx = findHeaderRowIndex(rows, (t) => t.includes("AMBIENTE"));
  if (ambIdx === -1) ambIdx = findHeaderRowIndex(rows, (t) => t.includes("MODULO"));
  const ambientes = extractOrdinalRows(rows, ambIdx).map(toNomeQuadRow);

  const turIdx = findHeaderRowIndex(rows, (t) => t.includes("TURNO"));
  const turnos = extractOrdinalRows(rows, turIdx).map(toNomeQuadRow);

  const horIdx = findHeaderRowIndex(rows, (t) => t.includes("HORARIO"));
  const horarios = extractOrdinalRows(rows, horIdx).map(toHorarioRow).filter((h): h is HorarioRow => h != null);

  return { workday_id, data, clientes, receita_bruta, devedor, bruto, gorjeta, desconto, custo, lucro, pagamentos, ambientes, turnos, horarios };
}

type ParsedVenda = {
  workday_id: number | null;
  data: string | null;
  grupos: GrupoRow[];
};

function parseVenda(buffer: Buffer, filename: string): ParsedVenda {
  const rows = sheetRows(buffer);
  const flatText = rows.map((r) => (r ?? []).join(" ")).join("\n");
  const workdayIdMatch = flatText.match(/Workday:?\s*(\d+)/i);
  const workday_id = workdayIdMatch ? parseInt(workdayIdMatch[1]!, 10) : null;
  const data = extractDateFromFilename(filename);
  const grupos = extractVendaGrupos(rows);
  return { workday_id, data, grupos };
}

// ── DB ────────────────────────────────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

async function insertMovimento(
  supabase: ReturnType<typeof getServiceClient>, parsed: ParsedMovimento, unitId: string,
): Promise<string> {
  if (parsed.workday_id == null) throw new Error("workday_id não encontrado no arquivo (esperado 'Workday: <n>')");
  if (!parsed.data) throw new Error("data não encontrada no nome do arquivo (esperado [DD.MM.YY])");

  const receitaLiquida =
    parsed.receita_bruta != null && parsed.desconto != null ? parsed.receita_bruta - parsed.desconto : null;

  const { data: wd, error } = await supabase
    .from("lorean_workdays")
    .upsert(
      {
        unit_id: unitId,
        data: parsed.data,
        workday_id: parsed.workday_id,
        turno: "dia_inteiro", // placeholder — reclassificado abaixo
        receita_bruta: parsed.receita_bruta,
        desconto: parsed.desconto,
        gorjeta: parsed.gorjeta,
        receita_liquida: receitaLiquida,
        custo: parsed.custo,
        lucro: parsed.lucro,
        previsto: parsed.receita_bruta, // mesmo valor — receita_bruta É o previsto
        devedor: parsed.devedor,
        clientes: parsed.clientes,
      },
      { onConflict: "unit_id,workday_id" },
    )
    .select()
    .single();

  if (error) throw new Error(`lorean_workdays: ${error.message}`);

  // Classificação de turno — mesma lógica de /api/lorean/import (PDF).
  const turnosNomes = parsed.turnos.map((t) => t.nome.toLowerCase());
  const temTarde = turnosNomes.some((t) => t.includes("tarde"));
  const temNoite = turnosNomes.some((t) => t.includes("noite"));

  let turnoClassificado: "almoco" | "jantar" | "dia_inteiro";
  if (temTarde && temNoite) {
    turnoClassificado = "dia_inteiro";
  } else if (temTarde) {
    turnoClassificado = "almoco";
  } else if (temNoite) {
    turnoClassificado = "jantar";
  } else {
    const { data: siblings } = await supabase
      .from("lorean_workdays")
      .select("id, workday_id")
      .eq("unit_id", unitId)
      .eq("data", parsed.data)
      .order("workday_id", { ascending: true });
    if (siblings?.length === 1) {
      turnoClassificado = "dia_inteiro";
    } else if (siblings && siblings.length >= 2) {
      await supabase.from("lorean_workdays").update({ turno: "almoco" }).eq("id", siblings[0]!.id);
      await supabase.from("lorean_workdays").update({ turno: "jantar" }).eq("id", siblings[1]!.id);
      turnoClassificado = wd.workday_id === siblings[0]!.workday_id ? "almoco" : "jantar";
    } else {
      turnoClassificado = "dia_inteiro";
    }
  }
  await supabase.from("lorean_workdays").update({ turno: turnoClassificado }).eq("id", wd.id);

  // Reimport idempotente: apaga filhos antes de reinserir.
  await Promise.all([
    supabase.from("lorean_pagamentos").delete().eq("workday_id_fk", wd.id),
    supabase.from("lorean_ambientes").delete().eq("workday_id_fk", wd.id),
    supabase.from("lorean_turnos").delete().eq("workday_id_fk", wd.id),
    supabase.from("lorean_horarios").delete().eq("workday_id_fk", wd.id),
  ]);

  const inserts: PromiseLike<{ error: { message: string } | null }>[] = [];
  if (parsed.pagamentos.length) {
    inserts.push(supabase.from("lorean_pagamentos").insert(
      parsed.pagamentos.map((p) => ({ forma: p.forma, valor_fechado: p.valor_fechado, valor_recebido: p.valor_recebido, diferenca: p.diferenca, workday_id_fk: wd.id })),
    ).then());
  }
  if (parsed.ambientes.length) {
    inserts.push(supabase.from("lorean_ambientes").insert(
      parsed.ambientes.map((a) => ({ ambiente: a.nome, clientes: a.clientes, gorjeta: a.gorjeta, produto: a.produto, consumo: a.consumo, workday_id_fk: wd.id })),
    ).then());
  }
  if (parsed.turnos.length) {
    inserts.push(supabase.from("lorean_turnos").insert(
      parsed.turnos.map((t) => ({ turno: t.nome, clientes: t.clientes, gorjeta: t.gorjeta, produto: t.produto, consumo: t.consumo, workday_id_fk: wd.id })),
    ).then());
  }
  if (parsed.horarios.length) {
    inserts.push(supabase.from("lorean_horarios").insert(
      parsed.horarios.map((h) => ({ hora: h.hora, clientes: h.clientes, gorjeta: h.gorjeta, produto: h.produto, consumo: h.consumo, workday_id_fk: wd.id })),
    ).then());
  }
  const results = await Promise.all(inserts);
  for (const r of results) if (r.error) throw new Error(r.error.message);

  return wd.id;
}

async function insertVenda(
  supabase: ReturnType<typeof getServiceClient>, parsed: ParsedVenda, unitId: string,
): Promise<void> {
  if (parsed.workday_id == null) throw new Error("workday_id não encontrado no arquivo (esperado 'Workday: <n>')");

  const { data: wd } = await supabase
    .from("lorean_workdays")
    .select("id")
    .eq("unit_id", unitId)
    .eq("workday_id", parsed.workday_id)
    .maybeSingle();
  if (!wd) throw new Error(`Workday não encontrado para workday_id=${parsed.workday_id} — importe o Movimento primeiro`);

  await supabase.from("lorean_grupos").delete().eq("workday_id_fk", wd.id);
  if (parsed.grupos.length) {
    const { error } = await supabase.from("lorean_grupos").insert(
      parsed.grupos.map((g) => ({ grupo: g.grupo, bruto: g.bruto, desconto: g.desconto, gorjeta: g.gorjeta, consumo: g.consumo, workday_id_fk: wd.id })),
    );
    if (error) throw new Error(`lorean_grupos: ${error.message}`);
  }
}

// ── Route handler — aceita Movimento e Venda misturados num único upload ───────
// Tipo detectado pelo nome do arquivo; Movimento processa antes de Venda (Venda
// depende do workday já existir) independente da ordem em que vieram no FormData.

type Detalhe = {
  arquivo: string;
  tipo: "movimento" | "venda" | null;
  workday_id: number | null;
  data: string | null;
  sucesso: boolean;
  erro?: string;
  resumo?: Record<string, unknown>;
};

function detectTipo(filename: string): "movimento" | "venda" | null {
  const lower = filename.toLowerCase();
  if (lower.includes("movimento")) return "movimento";
  if (lower.includes("venda")) return "venda";
  return null;
}

export async function POST(request: Request) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (e) {
      return Response.json({ processados: 0, erros: [`formData: ${String(e)}`], detalhes: [] }, { status: 400, headers: CORS });
    }

    const unitId = formData.get("unit_id") as string | null;
    const arquivos = [...formData.getAll("arquivos"), ...formData.getAll("arquivos[]")]
      .filter((f): f is File => f instanceof File);

    if (!unitId) {
      return Response.json({ processados: 0, erros: ["unit_id é obrigatório"], detalhes: [] }, { status: 400, headers: CORS });
    }
    if (arquivos.length === 0) {
      return Response.json({ processados: 0, erros: ["nenhum arquivo em 'arquivos'"], detalhes: [] }, { status: 400, headers: CORS });
    }

    let supabase: ReturnType<typeof getServiceClient>;
    try {
      supabase = getServiceClient();
    } catch (e) {
      return Response.json({ processados: 0, erros: [`supabase: ${String(e)}`], detalhes: [] }, { status: 500, headers: CORS });
    }

    // Movimento primeiro (Venda precisa do workday já existir).
    const ordenados = [...arquivos].sort((a, b) => {
      const ta = detectTipo(a.name), tb = detectTipo(b.name);
      if (ta === tb) return 0;
      return ta === "movimento" ? -1 : tb === "movimento" ? 1 : 0;
    });

    const detalhes: Detalhe[] = [];
    const erros: string[] = [];

    for (const arquivo of ordenados) {
      const tipo = detectTipo(arquivo.name);
      if (!tipo) {
        detalhes.push({ arquivo: arquivo.name, tipo: null, workday_id: null, data: null, sucesso: false, erro: "tipo não reconhecido no nome do arquivo (esperado 'Movimento' ou 'Venda')" });
        erros.push(`${arquivo.name}: tipo não reconhecido`);
        continue;
      }
      try {
        const buffer = Buffer.from(await arquivo.arrayBuffer());
        if (tipo === "movimento") {
          const parsed = parseMovimento(buffer, arquivo.name);
          await insertMovimento(supabase, parsed, unitId);
          detalhes.push({
            arquivo: arquivo.name, tipo, workday_id: parsed.workday_id, data: parsed.data, sucesso: true,
            resumo: {
              clientes: parsed.clientes, receita_bruta: parsed.receita_bruta, devedor: parsed.devedor, bruto: parsed.bruto,
              gorjeta: parsed.gorjeta, desconto: parsed.desconto, custo: parsed.custo, lucro: parsed.lucro,
              pagamentos: parsed.pagamentos.length, ambientes: parsed.ambientes.length,
              turnos: parsed.turnos.length, horarios: parsed.horarios.length,
            },
          });
        } else {
          const parsed = parseVenda(buffer, arquivo.name);
          await insertVenda(supabase, parsed, unitId);
          detalhes.push({
            arquivo: arquivo.name, tipo, workday_id: parsed.workday_id, data: parsed.data, sucesso: true,
            resumo: {
              grupos: parsed.grupos.length,
              bruto_total: parsed.grupos.reduce((s, g) => s + (g.bruto ?? 0), 0),
              desconto_total: parsed.grupos.reduce((s, g) => s + (g.desconto ?? 0), 0),
              gorjeta_total: parsed.grupos.reduce((s, g) => s + (g.gorjeta ?? 0), 0),
              consumo_total: parsed.grupos.reduce((s, g) => s + (g.consumo ?? 0), 0),
            },
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        detalhes.push({ arquivo: arquivo.name, tipo, workday_id: null, data: null, sucesso: false, erro: msg });
        erros.push(`${arquivo.name}: ${msg}`);
        // não interrompe o lote — segue pro próximo arquivo
      }
    }

    const processados = detalhes.filter((d) => d.sucesso).length;
    return Response.json({ processados, erros, detalhes }, { headers: CORS });
  } catch (e) {
    console.error("[lorean/import-xlsx] unhandled error:", e);
    return Response.json({ processados: 0, erros: [String(e)], detalhes: [] }, { status: 500, headers: CORS });
  }
}
