// NextResponse not needed — using native Response.json() throughout
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// ── Prompts ───────────────────────────────────────────────────────────────────

const WORKDAY_PROMPT = `Extraia os dados deste relatório Lorean Workday e retorne APENAS JSON válido, sem texto adicional, sem markdown.

Formato esperado:
{
  "workday_id": number,
  "data": "YYYY-MM-DD",
  "abertura_at": "YYYY-MM-DD HH:MM:SS",
  "fechamento_at": "YYYY-MM-DD HH:MM:SS",
  "receita_bruta": number,
  "desconto": number,
  "gorjeta": number,
  "receita_liquida": number,
  "custo": number,
  "cmv_pct": number,
  "lucro": number,
  "clientes": number,
  "ticket_medio": number,
  "ticket_real": number,
  "permanencia_media": "HH:MM:SS",
  "previsto": number,
  "devedor": number,
  "pagamentos": [
    { "forma": string, "valor_fechado": number, "valor_recebido": number, "diferenca": number }
  ],
  "ambientes": [
    { "ambiente": string, "clientes": number, "gorjeta": number, "produto": number, "consumo": number }
  ],
  "turnos": [
    { "turno": string, "clientes": number, "gorjeta": number, "produto": number, "consumo": number }
  ],
  "grupos": [
    { "grupo": string, "pct_bruto": number, "bruto": number, "desconto": number, "gorjeta": number, "consumo": number }
  ],
  "descontos": [
    { "motivo": string, "qtd": number, "consumo": number }
  ]
}

Regras:
- IMPORTANTE: As datas estão no formato DD.MM.YY (dia.mês.ano brasileiro). Ex: 02.06.26 = 2 de junho de 2026 = 2026-06-02. Converter para ISO 8601: YYYY-MM-DD.
- IMPORTANTE: O horário de abertura e fechamento aparecem no formato "DIA, DD MES AAAA HH:MM" (ex: "SÁB, 09 MAI 2026 18:15"). Converta para ISO 8601: "YYYY-MM-DD HH:MM:00". Ex: "SÁB, 09 MAI 2026 18:15" → "2026-05-09 18:15:00". Meses em português: JAN=01, FEV=02, MAR=03, ABR=04, MAI=05, JUN=06, JUL=07, AGO=08, SET=09, OUT=10, NOV=11, DEZ=12.
- cmv_pct: valor decimal (ex: 0.27 para 27%)
- pct_bruto: valor decimal (ex: 0.17 para 17%)
- permanencia_media: formato "HH:MM:SS"
- Campos não encontrados no PDF: usar null
- Arrays vazios se a seção não existir: []`;

const CAIXA_PROMPT = `Extraia os dados deste relatório de fechamento de caixa Lorean e retorne APENAS JSON válido, sem texto adicional, sem markdown.

Formato esperado:
{
  "caixa_id": number,
  "operador": string,
  "data": "YYYY-MM-DD",
  "abertura_at": "YYYY-MM-DD HH:MM:SS",
  "fechamento_at": "YYYY-MM-DD HH:MM:SS",
  "total_fechado": number,
  "total_recebido": number,
  "diferenca": number,
  "pagamentos": [
    { "forma": string, "valor_fechado": number, "valor_recebido": number, "diferenca": number }
  ]
}

Regras:
- IMPORTANTE: As datas estão no formato DD.MM.YY (dia.mês.ano brasileiro). Ex: 02.06.26 = 2 de junho de 2026 = 2026-06-02. Converter para ISO 8601: YYYY-MM-DD.
- Campos não encontrados: usar null
- pagamentos: array vazio [] se não houver`;

const VENDA_PROMPT_1 = `Extraia os dados deste relatório Lorean de Venda e retorne APENAS JSON válido, sem texto adicional, sem markdown.

Extraia SOMENTE estes 3 arrays: grupos de produto, descontos e cancelamentos.

Formato esperado:
{
  "grupos": [
    { "grupo": string, "pct_bruto": number, "bruto": number, "desconto": number, "gorjeta": number, "consumo": number }
  ],
  "descontos": [
    { "motivo": string, "qtd": number, "consumo": number }
  ],
  "cancelamentos": [
    { "motivo": string, "qtd": number, "consumo": number }
  ]
}

Regras:
- pct_bruto: valor decimal (ex: 0.17 para 17%)
- Arrays vazios se a seção não existir no PDF: []`;

const VENDA_PROMPT_2 = `Extraia os dados deste relatório Lorean de Venda e retorne APENAS JSON válido, sem texto adicional, sem markdown.

Extraia SOMENTE estes 2 arrays: vendas por horário e vendas por garçom/usuário.

Formato esperado:
{
  "horarios": [
    { "hora": number, "clientes": number, "gorjeta": number, "produto": number, "consumo": number }
  ],
  "usuarios": [
    { "usuario": string, "qtd": number, "gorjeta": number, "produto": number, "consumo": number }
  ]
}

Regras:
- horarios.hora: número inteiro da hora (12, 13, 14 ... 23)
- Arrays vazios se a seção não existir no PDF: []`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

async function fileToBase64(file: File): Promise<string> {
  // Buffer.from() is O(n) — safe for multi-MB PDFs
  const buf = await file.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}

async function parsePdf(pdfBase64: string, prompt: string, label: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });
  const response = await (client.messages.create as any)({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const textBlock = (response.content as any[]).find((b: any) => b.type === "text");
  if (!textBlock) throw new Error(`No text block from Claude for ${label}`);
  const clean = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  if (!clean.startsWith("{")) throw new Error(`Claude response not JSON for ${label}: ${clean.slice(0, 80)}`);
  return JSON.parse(clean);
}

function extractDateFromFilename(filename: string): string | null {
  const m = filename.match(/\[(\d{2})\.(\d{2})\.(\d{2})\]/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  return `20${yy}-${mm}-${dd}`;
}

function classifyTurno(aberturaAt: string): "almoco" | "jantar" {
  const hora = new Date(aberturaAt).getHours();
  return hora >= 10 && hora < 17 ? "almoco" : "jantar";
}

// ── DB inserts ────────────────────────────────────────────────────────────────

async function insertWorkday(
  supabase: ReturnType<typeof getServiceClient>,
  parsed: any,
  unitId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("lorean_workdays")
    .select("id, abertura_at")
    .eq("unit_id", unitId)
    .eq("data", parsed.data)
    .maybeSingle();

  let turno = "dia_inteiro";
  if (existing) {
    const turnoExistente = classifyTurno(existing.abertura_at);
    await supabase.from("lorean_workdays").update({ turno: turnoExistente }).eq("id", existing.id);
    turno = classifyTurno(parsed.abertura_at);
  }

  const { data: wd, error } = await supabase
    .from("lorean_workdays")
    .upsert(
      {
        unit_id: unitId,
        data: parsed.data,
        workday_id: parsed.workday_id,
        turno,
        abertura_at: parsed.abertura_at,
        fechamento_at: parsed.fechamento_at,
        receita_bruta: parsed.receita_bruta,
        desconto: parsed.desconto,
        gorjeta: parsed.gorjeta,
        receita_liquida: parsed.receita_liquida,
        custo: parsed.custo,
        cmv_pct: parsed.cmv_pct,
        lucro: parsed.lucro,
        clientes: parsed.clientes,
        ticket_medio: parsed.ticket_medio,
        ticket_real: parsed.ticket_real,
        permanencia_media: parsed.permanencia_media,
        previsto: parsed.previsto,
        devedor: parsed.devedor,
      },
      { onConflict: "unit_id,data,turno" },
    )
    .select()
    .single();

  if (error) throw new Error(`lorean_workdays: ${error.message}`);

  await Promise.all([
    supabase.from("lorean_pagamentos").delete().eq("workday_id_fk", wd.id),
    supabase.from("lorean_ambientes").delete().eq("workday_id_fk", wd.id),
    supabase.from("lorean_turnos").delete().eq("workday_id_fk", wd.id),
    supabase.from("lorean_grupos").delete().eq("workday_id_fk", wd.id),
    supabase.from("lorean_descontos").delete().eq("workday_id_fk", wd.id),
  ]);

  const inserts: PromiseLike<any>[] = [];
  if (parsed.pagamentos?.length) inserts.push(supabase.from("lorean_pagamentos").insert(parsed.pagamentos.map((r: any) => ({ ...r, workday_id_fk: wd.id }))).then());
  if (parsed.ambientes?.length)  inserts.push(supabase.from("lorean_ambientes").insert(parsed.ambientes.map((r: any) => ({ ...r, workday_id_fk: wd.id }))).then());
  if (parsed.turnos?.length)     inserts.push(supabase.from("lorean_turnos").insert(parsed.turnos.map((r: any) => ({ ...r, workday_id_fk: wd.id }))).then());
  if (parsed.grupos?.length)     inserts.push(supabase.from("lorean_grupos").insert(parsed.grupos.map((r: any) => ({ ...r, workday_id_fk: wd.id }))).then());
  if (parsed.descontos?.length)  inserts.push(supabase.from("lorean_descontos").insert(parsed.descontos.map((r: any) => ({ ...r, workday_id_fk: wd.id }))).then());
  await Promise.all(inserts as Promise<any>[]);

  return wd.id;
}

async function insertVenda(
  supabase: ReturnType<typeof getServiceClient>,
  parsed: any,
  unitId: string,
  workdayUuid: string | null,
  filename: string,
): Promise<void> {
  let wdId = workdayUuid;

  // Fall back to filename-based lookup if UUID not provided
  if (!wdId) {
    const wdMatch = filename.match(/\((\d+)/);
    const loreanWorkdayId = wdMatch ? parseInt(wdMatch[1]!, 10) : null;
    if (!loreanWorkdayId) throw new Error(`Cannot extract workday_id from filename: "${filename}"`);
    const { data: wd } = await supabase
      .from("lorean_workdays")
      .select("id")
      .eq("unit_id", unitId)
      .eq("workday_id", loreanWorkdayId)
      .maybeSingle();
    if (!wd) throw new Error(`Workday não encontrado para workday_id=${loreanWorkdayId} — importe Movimento primeiro`);
    wdId = wd.id;
  }

  await Promise.all([
    supabase.from("lorean_grupos").delete().eq("workday_id_fk", wdId),
    supabase.from("lorean_descontos").delete().eq("workday_id_fk", wdId),
    supabase.from("lorean_cancelamentos").delete().eq("workday_id_fk", wdId),
    supabase.from("lorean_horarios").delete().eq("workday_id_fk", wdId),
    supabase.from("lorean_usuarios").delete().eq("workday_id_fk", wdId),
  ]);

  const inserts: PromiseLike<any>[] = [];
  if (parsed.grupos?.length)        inserts.push(supabase.from("lorean_grupos").insert(parsed.grupos.map((r: any) => ({ ...r, workday_id_fk: wdId }))).then());
  if (parsed.descontos?.length)     inserts.push(supabase.from("lorean_descontos").insert(parsed.descontos.map((r: any) => ({ ...r, workday_id_fk: wdId }))).then());
  if (parsed.cancelamentos?.length) inserts.push(supabase.from("lorean_cancelamentos").insert(parsed.cancelamentos.map((r: any) => ({ ...r, workday_id_fk: wdId }))).then());
  if (parsed.horarios?.length)      inserts.push(supabase.from("lorean_horarios").insert(parsed.horarios.map((r: any) => ({ ...r, workday_id_fk: wdId }))).then());
  if (parsed.usuarios?.length)      inserts.push(supabase.from("lorean_usuarios").insert(parsed.usuarios.map((r: any) => ({ ...r, workday_id_fk: wdId }))).then());
  await Promise.all(inserts as Promise<any>[]);
}

async function insertCaixa(
  supabase: ReturnType<typeof getServiceClient>,
  parsed: any,
  unitId: string,
  workdayUuid: string | null,
): Promise<void> {
  const wdId = workdayUuid ?? (await supabase
    .from("lorean_workdays")
    .select("id")
    .eq("unit_id", unitId)
    .eq("data", parsed.data)
    .maybeSingle()
    .then(({ data }) => data?.id ?? null));

  await supabase.from("lorean_caixas").insert({
    workday_id_fk: wdId,
    caixa_id: parsed.caixa_id,
    operador: parsed.operador,
    abertura_at: parsed.abertura_at,
    fechamento_at: parsed.fechamento_at,
    total_fechado: parsed.total_fechado,
    total_recebido: parsed.total_recebido,
    diferenca: parsed.diferenca,
  });
}

// ── Route handler — processes ONE PDF per call ────────────────────────────────

export async function POST(request: Request) {
  console.log("[lorean/import] POST called");

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (e) {
      return Response.json({ success: false, errors: [`formData: ${String(e)}`] }, { status: 400 });
    }

    const tipo = formData.get("tipo") as string | null;          // "movimento" | "venda" | "caixa"
    const arquivo = formData.get("arquivo") as File | null;
    const unitId = formData.get("unit_id") as string | null;
    const workdayUuid = formData.get("workday_id") as string | null; // Supabase UUID from Movimento step

    console.log("[lorean/import] tipo:", tipo, "unit_id:", unitId, "workday_id:", workdayUuid, "file:", arquivo?.name, arquivo?.size);

    if (!tipo || !arquivo || !unitId) {
      return Response.json({ success: false, errors: ["tipo, arquivo e unit_id são obrigatórios"] }, { status: 400 });
    }
    if (!["movimento", "venda", "caixa"].includes(tipo)) {
      return Response.json({ success: false, errors: [`tipo inválido: ${tipo}`] }, { status: 400 });
    }

    let supabase: ReturnType<typeof getServiceClient>;
    try {
      supabase = getServiceClient();
    } catch (e) {
      return Response.json({ success: false, errors: [`supabase: ${String(e)}`] }, { status: 500 });
    }

    const b64 = await fileToBase64(arquivo);
    console.log("[lorean/import] b64 length:", b64.length);

    let workday_id: string | null = workdayUuid;

    if (tipo === "movimento") {
      const parsed = await parsePdf(b64, WORKDAY_PROMPT, "movimento");
      const dateOverride = extractDateFromFilename(arquivo.name);
      if (dateOverride) parsed.data = dateOverride;
      workday_id = await insertWorkday(supabase, parsed, unitId);
      console.log("[lorean/import] Movimento done, workday_id:", workday_id);
    }

    else if (tipo === "venda") {
      // Two Claude calls in parallel — both read the same PDF, each takes ~10s
      const [part1, part2] = await Promise.all([
        parsePdf(b64, VENDA_PROMPT_1, "venda-part1"),
        parsePdf(b64, VENDA_PROMPT_2, "venda-part2"),
      ]);
      await insertVenda(supabase, { ...part1, ...part2 }, unitId, workdayUuid, arquivo.name);
      console.log("[lorean/import] Venda done");
    }

    else if (tipo === "caixa") {
      const parsed = await parsePdf(b64, CAIXA_PROMPT, "caixa");
      const dateOverride = extractDateFromFilename(arquivo.name);
      if (dateOverride) parsed.data = dateOverride;
      await insertCaixa(supabase, parsed, unitId, workdayUuid);
      console.log("[lorean/import] Caixa done");
    }

    return Response.json({ success: true, workday_id, errors: [] });
  } catch (e) {
    console.error("[lorean/import] unhandled error:", e);
    return Response.json({ success: false, workday_id: null, errors: [String(e)] }, { status: 500 });
  }
}
