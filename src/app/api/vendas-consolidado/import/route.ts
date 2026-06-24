// Importação de relatório CONSOLIDADO de produtos (período longo).
// A extração do PDF de Venda é IDÊNTICA ao import diário — ambos importam a MESMA
// função de @/lib/lorean/vendaExtract (mesmo modelo, max_tokens, streaming e parse).
// A ÚNICA diferença é o DESTINO: aqui grava nas tabelas vendas_consolidado_* (por
// período), no diário grava nas lorean_* (por dia/turno).
import { createClient } from "@supabase/supabase-js";
import { VENDA_PROMPT, fileToBase64, parsePdf } from "@/lib/lorean/vendaExtract";

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

// ── Helper local: só o cliente Supabase (a extração do PDF é compartilhada) ─────
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
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

    // 1) Extrai os produtos do PDF de Venda — MESMA chamada do import diário
    //    (parsePdf compartilhada, max_tokens 32768, igual ao diário na linha do "venda").
    const vendaB64 = await fileToBase64(vendaFile);
    console.log("[vc] chamando parsePdf (compartilhada com import diário)");
    const parsed = await parsePdf(vendaB64, VENDA_PROMPT, "venda_consolidado", 32768);
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
