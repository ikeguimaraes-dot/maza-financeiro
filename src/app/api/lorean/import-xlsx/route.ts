import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

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

// Marcadores de início de outras seções conhecidas do relatório — usados como
// condição de parada ao varrer uma tabela, já que o layout não tem fim explícito.
const SECTION_STOP_WORDS = [
  "PAGAMENTO", "METODO", "AMBIENTE", "MODULO", "TURNO", "HORARIO",
  "USUARIO", "DESCONTO", "CANCELAMENTO", "GRUPO", "TOTAL",
];

function extractRowsAfter<T>(
  rows: string[][], headerIdx: number, rowParser: (cells: string[]) => T | null, maxRows = 60,
): T[] {
  if (headerIdx === -1) return [];
  const out: T[] = [];
  for (let i = headerIdx + 1; i < rows.length && out.length < maxRows; i++) {
    const row = rows[i]!;
    if (isBlankRow(row)) break;
    const firstCell = stripAccents(String(row.find((c) => String(c).trim()) ?? "")).toUpperCase();
    if (SECTION_STOP_WORDS.some((w) => firstCell.startsWith(w))) break;
    const parsed = rowParser(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

function extractLabelValue(text: string, label: string): number | null {
  const re = new RegExp(`${label}\\s*R?\\$?\\s*([\\d.,]+)`, "i");
  const m = text.match(re);
  return m ? parseNumBR(m[1]) : null;
}

// ── Row parsers ───────────────────────────────────────────────────────────────

type PagamentoRow = { forma: string; valor_fechado: number | null; valor_recebido: number | null; diferenca: number | null };

function parsePagamentoRow(cells: string[]): PagamentoRow | null {
  const nonEmpty = cells.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (!nonEmpty.length) return null;
  const forma = nonEmpty.find((c) => parseNumBR(c) == null || /[A-Za-zÀ-ÿ]/.test(c));
  if (!forma) return null;
  const nums = nonEmpty.filter((c) => c !== forma).map(parseNumBR).filter((n): n is number => n != null);
  return { forma, valor_fechado: nums[0] ?? null, valor_recebido: nums[1] ?? null, diferenca: nums[2] ?? null };
}

type NomeQuadRow = { nome: string; clientes: number | null; gorjeta: number | null; produto: number | null; consumo: number | null };

// Ambiente e Turno têm o mesmo formato: nome + 4 números (clientes, gorjeta, produto, consumo).
function parseNomeQuadRow(cells: string[]): NomeQuadRow | null {
  const nonEmpty = cells.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (!nonEmpty.length) return null;
  const nome = nonEmpty.find((c) => parseNumBR(c) == null);
  if (!nome) return null;
  const nums = nonEmpty.filter((c) => c !== nome).map(parseNumBR).filter((n): n is number => n != null);
  return { nome, clientes: nums[0] ?? null, gorjeta: nums[1] ?? null, produto: nums[2] ?? null, consumo: nums[3] ?? null };
}

type HorarioRow = { hora: number; clientes: number | null; gorjeta: number | null; produto: number | null; consumo: number | null };

function parseHorarioRow(cells: string[]): HorarioRow | null {
  const nonEmpty = cells.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (!nonEmpty.length) return null;
  const horaCell = nonEmpty.find((c) => /^\d{1,2}\s*h\b/i.test(c)) ?? nonEmpty[0]!;
  const hora = parseInt(horaCell, 10);
  if (isNaN(hora)) return null;
  const nums = nonEmpty.filter((c) => c !== horaCell).map(parseNumBR).filter((n): n is number => n != null);
  return { hora, clientes: nums[0] ?? null, gorjeta: nums[1] ?? null, produto: nums[2] ?? null, consumo: nums[3] ?? null };
}

// ── Parsing do arquivo ───────────────────────────────────────────────────────

type ParsedWorkday = {
  workday_id: number | null;
  data: string | null;
  clientes: number | null;
  receita_bruta: number | null; // SUM(valor_recebido) dos pagamentos
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

function parseXlsxWorkday(buffer: Buffer, filename: string): ParsedWorkday {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  if (!sheet) throw new Error("planilha sem sheets");
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  const flatText = rows.map((r) => (r ?? []).join(" ")).join("\n");

  const workdayIdMatch = flatText.match(/Workday:?\s*(\d+)/i);
  const workday_id = workdayIdMatch ? parseInt(workdayIdMatch[1]!, 10) : null;

  const data = extractDateFromFilename(filename);

  const clientesMatch = flatText.match(/(\d+)\s*ACESSO/i);
  const clientes = clientesMatch ? parseInt(clientesMatch[1]!, 10) : null;

  const bruto    = extractLabelValue(flatText, "BRUTO");
  const gorjeta  = extractLabelValue(flatText, "GORJETA");
  const desconto = extractLabelValue(flatText, "DESCONTO");
  const custo    = extractLabelValue(flatText, "CUSTO");
  const lucro    = extractLabelValue(flatText, "LUCRO");

  // "Pagamento" (não "Método", que é a versão agrupada) — exige os dois tokens
  // no cabeçalho pra não confundir com outra tabela.
  const pagIdx = findHeaderRowIndex(rows, (t) => t.includes("PAGAMENTO") && t.includes("RECEBIDO"));
  const pagamentos = extractRowsAfter(rows, pagIdx, parsePagamentoRow);
  const receita_bruta = pagamentos.length
    ? pagamentos.reduce((s, p) => s + (p.valor_recebido ?? 0), 0)
    : null;

  const ambIdx = findHeaderRowIndex(rows, (t) => t.includes("AMBIENTE") || t.includes("MODULO"));
  const ambientes = extractRowsAfter(rows, ambIdx, parseNomeQuadRow);

  const turIdx = findHeaderRowIndex(rows, (t) => t.includes("TURNO"));
  const turnos = extractRowsAfter(rows, turIdx, parseNomeQuadRow);

  const horIdx = findHeaderRowIndex(rows, (t) => t.includes("HORARIO"));
  const horarios = extractRowsAfter(rows, horIdx, parseHorarioRow);

  return { workday_id, data, clientes, receita_bruta, bruto, gorjeta, desconto, custo, lucro, pagamentos, ambientes, turnos, horarios };
}

// ── DB ────────────────────────────────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

async function insertWorkdayXlsx(
  supabase: ReturnType<typeof getServiceClient>, parsed: ParsedWorkday, unitId: string,
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

// ── Route handler — aceita 1..N arquivos por chamada (arquivos[]) ──────────────

type Detalhe = {
  arquivo: string;
  workday_id: number | null;
  data: string | null;
  sucesso: boolean;
  erro?: string;
  resumo?: {
    clientes: number | null; receita_bruta: number | null; bruto: number | null;
    gorjeta: number | null; desconto: number | null; custo: number | null; lucro: number | null;
    pagamentos: number; ambientes: number; turnos: number; horarios: number;
  };
};

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

    const detalhes: Detalhe[] = [];
    const erros: string[] = [];

    for (const arquivo of arquivos) {
      try {
        const buffer = Buffer.from(await arquivo.arrayBuffer());
        const parsed = parseXlsxWorkday(buffer, arquivo.name);
        await insertWorkdayXlsx(supabase, parsed, unitId);
        detalhes.push({
          arquivo: arquivo.name, workday_id: parsed.workday_id, data: parsed.data, sucesso: true,
          resumo: {
            clientes: parsed.clientes, receita_bruta: parsed.receita_bruta, bruto: parsed.bruto,
            gorjeta: parsed.gorjeta, desconto: parsed.desconto, custo: parsed.custo, lucro: parsed.lucro,
            pagamentos: parsed.pagamentos.length, ambientes: parsed.ambientes.length,
            turnos: parsed.turnos.length, horarios: parsed.horarios.length,
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        detalhes.push({ arquivo: arquivo.name, workday_id: null, data: null, sucesso: false, erro: msg });
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
