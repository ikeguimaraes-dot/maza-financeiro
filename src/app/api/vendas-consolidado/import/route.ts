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

async function parsePdf(pdfBase64: string, prompt: string, label: string, maxTokens = 32768) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
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
  const response = await stream.finalMessage();

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

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (e) {
      return Response.json({ success: false, errors: [`formData: ${String(e)}`] }, { status: 400, headers: CORS });
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
      "venda:", vendaFile?.name, "movimento:", movimentoFile?.name, "caixa:", caixaFile?.name);

    if (!unitId || !dataInicio || !dataFim) {
      return Response.json({ success: false, errors: ["unit_id, data_inicio e data_fim são obrigatórios"] }, { status: 400, headers: CORS });
    }
    if (!vendaFile) {
      return Response.json({ success: false, errors: ["O PDF de Venda é obrigatório (origem dos produtos consolidados)"] }, { status: 400, headers: CORS });
    }

    let supabase: ReturnType<typeof getServiceClient>;
    try {
      supabase = getServiceClient();
    } catch (e) {
      return Response.json({ success: false, errors: [`supabase: ${String(e)}`] }, { status: 500, headers: CORS });
    }

    // 1) Extrai os produtos do PDF de Venda
    const vendaB64 = await fileToBase64(vendaFile);
    const parsed = await parsePdf(vendaB64, VENDA_PROMPT, "venda_consolidado");
    const produtosRaw: any[] = parsed.produtos ?? [];
    console.log("[vendas-consolidado/import] produtos extraídos:", produtosRaw.length);

    if (!produtosRaw.length) {
      return Response.json({ success: false, errors: ["Nenhum produto extraído do PDF de Venda"] }, { status: 422, headers: CORS });
    }

    // 2) Agrega por grupo+produto (defensivo: somar caso haja linhas repetidas)
    const map = new Map<string, { grupo: string; produto: string; quantidade: number; valor_bruto: number; valor_desconto: number; valor_liquido: number }>();
    for (const p of produtosRaw) {
      const grupo   = String(p.grupo ?? "—");
      const produto = String(p.produto ?? "—");
      const key = `${grupo}::${produto}`;
      const ex = map.get(key);
      const qtd      = Number(p.qtd ?? 0);
      const bruto    = Number(p.bruto ?? 0);
      const desconto = Number(p.desconto ?? 0);
      const total    = Number(p.total ?? 0);
      if (ex) {
        ex.quantidade += qtd; ex.valor_bruto += bruto; ex.valor_desconto += desconto; ex.valor_liquido += total;
      } else {
        map.set(key, { grupo, produto, quantidade: qtd, valor_bruto: bruto, valor_desconto: desconto, valor_liquido: total });
      }
    }
    const agregados = Array.from(map.values());
    const totalLiquido = agregados.reduce((s, r) => s + r.valor_liquido, 0);

    // 3) Cria o período
    const label = labelRaw?.trim() || `${dataInicio} a ${dataFim}`;
    const { data: periodo, error: pErr } = await supabase
      .from("vendas_consolidado_periodo")
      .insert({ unit_id: unitId, data_inicio: dataInicio, data_fim: dataFim, label })
      .select()
      .single();
    if (pErr) throw new Error(`vendas_consolidado_periodo: ${pErr.message}`);

    // 4) Insere produtos com participação % calculada
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
    const { error: prodErr } = await supabase.from("vendas_consolidado_produtos").insert(rows);
    if (prodErr) {
      // rollback do período para não deixar período órfão sem produtos
      await supabase.from("vendas_consolidado_periodo").delete().eq("id", periodo.id);
      throw new Error(`vendas_consolidado_produtos: ${prodErr.message}`);
    }

    console.log(`[vendas-consolidado/import] done — periodo_id: ${periodo.id}, produtos: ${rows.length}`);
    return Response.json({ success: true, periodo_id: periodo.id, produtos: rows.length, errors: [] }, { headers: CORS });
  } catch (e) {
    console.error("[vendas-consolidado/import] unhandled error:", e);
    return Response.json({ success: false, periodo_id: null, errors: [String(e)] }, { status: 500, headers: CORS });
  }
}
