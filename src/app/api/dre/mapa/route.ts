import { getServiceClient, jsonOk, jsonError, corsOptions, LINHAS_DRE } from "@/lib/dre/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function OPTIONS() {
  return corsOptions();
}

// GET /api/dre/mapa
// Retorna o mapa atual + TODAS as contas distintas da titulos_a_pagar com seus
// totais (sum v_titulo, contagem). Cada conta vem com o mapeamento atual (se já
// classificada) ou marcada como a classificar.
export async function GET() {
  try {
    const supabase = getServiceClient();

    const [titRes, mapaRes] = await Promise.all([
      supabase.from("titulos_a_pagar").select("descricao_c_gerencial, v_titulo"),
      supabase.from("mapa_conta_dre").select("descricao_c_gerencial, linha_dre, esperada_mensal"),
    ]);
    if (titRes.error) return jsonError(`titulos_a_pagar: ${titRes.error.message}`);
    if (mapaRes.error) return jsonError(`mapa_conta_dre: ${mapaRes.error.message}`);

    const mapa = new Map<string, { linha_dre: string | null; esperada_mensal: boolean }>();
    for (const m of mapaRes.data ?? []) {
      mapa.set(m.descricao_c_gerencial, { linha_dre: m.linha_dre ?? null, esperada_mensal: !!m.esperada_mensal });
    }

    // Agrega títulos por conta gerencial (v_titulo é positivo = despesa).
    const agg = new Map<string, { total: number; count: number }>();
    for (const t of titRes.data ?? []) {
      const k = t.descricao_c_gerencial ?? "(sem conta)";
      const ex = agg.get(k) ?? { total: 0, count: 0 };
      ex.total += Number(t.v_titulo ?? 0);
      ex.count += 1;
      agg.set(k, ex);
    }

    const contas = Array.from(agg.entries())
      .map(([descricao_c_gerencial, { total, count }]) => {
        const m = mapa.get(descricao_c_gerencial);
        return {
          descricao_c_gerencial,
          total,
          count,
          linha_dre: m?.linha_dre ?? null,
          esperada_mensal: m?.esperada_mensal ?? false,
          classificada: !!m?.linha_dre,
        };
      })
      .sort((a, b) => b.total - a.total);

    const a_classificar = contas.filter((c) => !c.classificada).length;

    return jsonOk({ contas, linhas: LINHAS_DRE, a_classificar });
  } catch (e) {
    return jsonError(String(e));
  }
}

// POST /api/dre/mapa  { mapeamentos: [{ descricao_c_gerencial, linha_dre, esperada_mensal }] }
// Upsert no mapa_conta_dre (chave: descricao_c_gerencial).
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      mapeamentos?: { descricao_c_gerencial: string; linha_dre: string | null; esperada_mensal?: boolean }[];
    };
    const lista = (body.mapeamentos ?? []).filter((m) => m.descricao_c_gerencial);
    if (!lista.length) return jsonError("nenhum mapeamento enviado", 400);

    const supabase = getServiceClient();
    const rows = lista.map((m) => ({
      descricao_c_gerencial: m.descricao_c_gerencial,
      linha_dre: m.linha_dre || null,
      esperada_mensal: !!m.esperada_mensal,
      atualizado_em: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("mapa_conta_dre")
      .upsert(rows, { onConflict: "descricao_c_gerencial" });
    if (error) return jsonError(error.message);

    return jsonOk({ ok: true, salvos: rows.length });
  } catch (e) {
    return jsonError(String(e));
  }
}
