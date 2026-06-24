// Importação de relatório CONSOLIDADO de produtos (período longo).
// Reutiliza o MESMO VENDA_PROMPT e a mesma lógica de extração do import diário
// (src/app/api/lorean/import/route.ts), mas grava nas tabelas vendas_consolidado_*
// — que não dependem de workday/dia/turno.
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

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

// Helpers que GARANTEM resposta JSON (nunca new Response("texto"))
function jsonError(message: string, status = 500) {
  return Response.json({ success: false, error: message, errors: [message] }, { status, headers: CORS });
}
function jsonOk(body: Record<string, unknown>) {
  return Response.json({ success: true, errors: [], ...body }, { headers: CORS });
}

// ── Prompt (idêntico ao VENDA_PROMPT do import diário) ─────────────────────────
const VENDA_PROMPT = `Extraia TODOS os produtos vendidos de TODAS as seções de grupo deste relatório Lorean de Venda e retorne APENAS JSON válido, sem texto adicional, sem markdown.

Cada seção tem um título de grupo (ex: Soft Drinks, Vinho Tinto, Da Brasa) e linhas de produtos com colunas Qtde, Garrafa, CMV, Bruto, Desconto, Gorjeta, Total.

Formato esperado:
{
  "produtos": [
    { "grupo": string, "produto": string, "qtd": number, "cmv_pct": number, "bruto": number, "desconto": number, "gorjeta": number, "total": number }
  ]
}

Regras:
- cmv_pct: valor decimal (ex: 0.27 para 27%)
- Ignorar linhas de subtotal das seções
- Array vazio [] se não houver produtos`;

// ── Helpers (idênticos ao import diário) ───────────────────────────────────────
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}

async function parsePdf(pdfBase64: string, prompt: string, label: string, maxTokens = 16384) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  // NÃO-STREAMING: messages.create() resolve assim que a resposta completa chega.
  // O messages.stream()/finalMessage() depende do evento SSE message_stop e pode
  // ficar pendurado até o maxDuration se esse evento não fechar (causa do timeout
  // de 5min mesmo com o Claude tendo respondido 200 em ~7s).
  const client = new Anthropic({ apiKey });
  console.log("[vc] chamando Anthropic (create, não-streaming)");
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: prompt },
        ],
      },
    ],
  } as any);
  console.log("[vc] resposta Claude recebida, parseando — stop_reason:", response.stop_reason);

  if (response.stop_reason === "max_tokens") {
    throw new Error(`JSON truncado para ${label} — aumentar max_tokens`);
  }
  const textBlock = (response.content as any[]).find((b: any) => b.type === "text");
  if (!textBlock) throw new Error(`No text block from Claude for ${label}`);
  const clean = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  if (!clean.startsWith("{")) throw new Error(`Claude response not JSON for ${label}: ${clean.slice(0, 80)}`);
  return JSON.parse(clean);
}

// ── Route handler ──────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  console.log("[vendas-consolidado/import] POST called");
  console.log("[vendas-consolidado] ANTHROPIC_API_KEY:", !!process.env.ANTHROPIC_API_KEY);
  console.log("[vendas-consolidado] SERVICE_ROLE:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Falha cedo e com JSON se as envs não estão configuradas
    if (!process.env.ANTHROPIC_API_KEY) return jsonError("ANTHROPIC_API_KEY não configurada no ambiente", 500);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return jsonError("Supabase (URL/SERVICE_ROLE) não configurado no ambiente", 500);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (e) {
      return jsonError(`formData: ${String(e)}`, 400);
    }

    const unitId     = formData.get("unit_id") as string | null;
    const dataInicio = formData.get("data_inicio") as string | null;
    const dataFim    = formData.get("data_fim") as string | null;
    const labelRaw   = formData.get("label") as string | null;
    // Mesmos 3 PDFs do Lorean. O consolidado de produtos vem do relatório de Venda.
    const vendaFile     = formData.get("venda") as File | null;
    const movimentoFile = formData.get("movimento") as File | null;
    const caixaFile     = formData.get("caixa") as File | null;

    console.log("[vendas-consolidado/import] unit_id:", unitId, "inicio:", dataInicio, "fim:", dataFim,
      "venda:", vendaFile?.name, vendaFile?.size, "movimento:", movimentoFile?.name, "caixa:", caixaFile?.name);

    if (!unitId || !dataInicio || !dataFim) {
      return jsonError("unit_id, data_inicio e data_fim são obrigatórios", 400);
    }
    if (!vendaFile) {
      return jsonError("O PDF de Venda é obrigatório (origem dos produtos consolidados)", 400);
    }

    let supabase: ReturnType<typeof getServiceClient>;
    try {
      supabase = getServiceClient();
    } catch (e) {
      return jsonError(`supabase: ${String(e)}`, 500);
    }

    // 1) Extrai os produtos do PDF de Venda
    const vendaB64 = await fileToBase64(vendaFile);
    const parsed = await parsePdf(vendaB64, VENDA_PROMPT, "venda_consolidado");
    const produtosRaw: any[] = Array.isArray(parsed.produtos) ? parsed.produtos : [];
    console.log("[vc] produtos parseados:", produtosRaw.length);

    if (!produtosRaw.length) {
      return jsonError("Nenhum produto extraído do PDF de Venda", 422);
    }

    // 2) Agrega por grupo+produto (for finito sobre o array parseado — sem loop infinito)
    const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
    const map = new Map<string, { grupo: string; produto: string; quantidade: number; valor_bruto: number; valor_desconto: number; valor_liquido: number }>();
    for (const p of produtosRaw) {
      const grupo   = String(p.grupo ?? "—");
      const produto = String(p.produto ?? "—");
      const key = `${grupo}::${produto}`;
      const ex = map.get(key);
      const qtd = num(p.qtd), bruto = num(p.bruto), desconto = num(p.desconto), total = num(p.total);
      if (ex) {
        ex.quantidade += qtd; ex.valor_bruto += bruto; ex.valor_desconto += desconto; ex.valor_liquido += total;
      } else {
        map.set(key, { grupo, produto, quantidade: qtd, valor_bruto: bruto, valor_desconto: desconto, valor_liquido: total });
      }
    }
    const agregados = Array.from(map.values());
    const totalLiquido = agregados.reduce((s, r) => s + r.valor_liquido, 0);
    console.log("[vc] agregados:", agregados.length, "totalLiquido:", totalLiquido);

    // 3) Cria o período
    const label = labelRaw?.trim() || `${dataInicio} a ${dataFim}`;
    console.log("[vc] inserindo periodo");
    const { data: periodo, error: pErr } = await supabase
      .from("vendas_consolidado_periodo")
      .insert({ unit_id: unitId, data_inicio: dataInicio, data_fim: dataFim, label })
      .select("id")
      .single();
    if (pErr) throw new Error(`vendas_consolidado_periodo: ${pErr.message}`);
    console.log("[vc] periodo inserido, id:", periodo.id);

    // 4) Monta as linhas com participação % calculada (sempre numérica finita)
    const rows = agregados.map((r) => ({
      periodo_id:       periodo.id,
      grupo:            r.grupo,
      produto:          r.produto,
      quantidade:       r.quantidade,
      valor_bruto:      r.valor_bruto,
      valor_desconto:   r.valor_desconto,
      valor_liquido:    r.valor_liquido,
      participacao_pct: totalLiquido > 0 ? (r.valor_liquido / totalLiquido) * 100 : 0,
    }));

    // Insere em lote, em chunks de 500 (cada chunk é um único insert com await)
    console.log("[vc] inserindo", rows.length, "produtos em lote");
    const CHUNK = 500;
    let prodErr: { message: string } | null = null;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error } = await supabase.from("vendas_consolidado_produtos").insert(slice);
      if (error) { prodErr = error; break; }
      console.log(`[vc] chunk inserido ${i + slice.length}/${rows.length}`);
    }
    if (prodErr) {
      // rollback do período para não deixar período órfão sem produtos
      await supabase.from("vendas_consolidado_periodo").delete().eq("id", periodo.id);
      throw new Error(`vendas_consolidado_produtos: ${prodErr.message}`);
    }

    console.log("[vc] produtos inseridos");
    console.log("[vc] done — periodo_id:", periodo.id, "produtos:", rows.length);
    return jsonOk({ periodo_id: periodo.id, produtos: rows.length });
  } catch (e) {
    console.error("[vendas-consolidado/import] unhandled error:", e);
    return jsonError(String(e), 500);
  }
}
