// Leitura dos dados consolidados de vendas.
// GET ?unit_id=&periodo_id=  → produtos do período (ou do último período da unidade).
// Sempre retorna a lista de períodos importados (para o seletor) + os produtos.
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin":  "https://kph-os.vercel.app",
  "Access-Control-Allow-Methods": "GET",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { headers: CORS });
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unitId = searchParams.get("unit_id");
    let periodoId = searchParams.get("periodo_id");

    if (!unitId) {
      return Response.json({ error: "unit_id é obrigatório" }, { status: 400, headers: CORS });
    }

    const supabase = getServiceClient();

    // Lista de períodos da unidade (mais recente primeiro)
    const { data: periodos, error: perErr } = await supabase
      .from("vendas_consolidado_periodo")
      .select("*")
      .eq("unit_id", unitId)
      .order("data_inicio", { ascending: false })
      .order("importado_em", { ascending: false });
    if (perErr) return Response.json({ error: perErr.message }, { status: 500, headers: CORS });

    if (!periodos?.length) {
      return Response.json({ periodos: [], periodo: null, produtos: [] }, { headers: CORS });
    }

    // Período selecionado (ou último)
    if (!periodoId || !periodos.some((p) => p.id === periodoId)) {
      periodoId = periodos[0]!.id;
    }
    const periodo = periodos.find((p) => p.id === periodoId) ?? periodos[0]!;

    const { data: produtos, error: prodErr } = await supabase
      .from("vendas_consolidado_produtos")
      .select("*")
      .eq("periodo_id", periodoId)
      .order("valor_liquido", { ascending: false });
    if (prodErr) return Response.json({ error: prodErr.message }, { status: 500, headers: CORS });

    return Response.json({ periodos, periodo, produtos: produtos ?? [] }, { headers: CORS });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: CORS });
  }
}
