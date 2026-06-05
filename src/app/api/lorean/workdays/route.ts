import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Supabase env vars not set");
  return createClient(url, key);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unit_id = searchParams.get("unit_id");
  const start   = searchParams.get("start");
  const end     = searchParams.get("end");
  const mes_ano = searchParams.get("mes_ano");

  if (!unit_id || !start || !end) {
    return Response.json({ error: "unit_id, start e end são obrigatórios" }, { status: 400 });
  }

  let db: ReturnType<typeof getServiceClient>;
  try {
    db = getServiceClient();
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }

  const { data: workdays, error: wErr } = await db
    .from("lorean_workdays")
    .select("id, data, turno, receita_bruta, desconto, gorjeta, receita_liquida, custo, cmv_pct, clientes, ticket_medio")
    .eq("unit_id", unit_id)
    .gte("data", start)
    .lte("data", end)
    .order("data", { ascending: false });

  if (wErr) return Response.json({ error: wErr.message }, { status: 500 });

  const ids: string[] = (workdays ?? []).map((w: any) => w.id);

  if (ids.length === 0) {
    return Response.json({ workdays: [], pagamentos: [], descontos: [], ambientes: [], turnos: [], grupos: [], meta: null });
  }

  const [pagRes, descRes, ambRes, turRes, grpRes, metaRes] = await Promise.all([
    db.from("lorean_pagamentos").select("workday_id_fk, forma, valor_recebido").in("workday_id_fk", ids),
    db.from("lorean_descontos").select("motivo, consumo").in("workday_id_fk", ids),
    db.from("lorean_ambientes").select("ambiente, produto, clientes").in("workday_id_fk", ids),
    db.from("lorean_turnos").select("turno, produto, clientes").in("workday_id_fk", ids),
    db.from("lorean_grupos").select("grupo, bruto, pct_bruto").in("workday_id_fk", ids),
    mes_ano
      ? db.from("metas_projecoes").select("meta_faturamento").eq("mes_ano", mes_ano).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Soma valor_recebido por workday para calcular receita_bruta_real
  const receitaByWorkday = new Map<string, number>();
  for (const p of (pagRes.data ?? [])) {
    const wdId = (p as any).workday_id_fk as string;
    receitaByWorkday.set(wdId, (receitaByWorkday.get(wdId) ?? 0) + ((p as any).valor_recebido ?? 0));
  }

  const workdaysEnriched = (workdays ?? []).map((w: any) => ({
    ...w,
    receita_bruta_real: receitaByWorkday.get(w.id) ?? 0,
  }));

  // Remove workday_id_fk dos pagamentos antes de retornar (não necessário no cliente)
  const pagamentosClean = (pagRes.data ?? []).map(({ workday_id_fk: _fk, ...rest }: any) => rest);

  return Response.json({
    workdays:   workdaysEnriched,
    pagamentos: pagamentosClean,
    descontos:  descRes.data ?? [],
    ambientes:  ambRes.data  ?? [],
    turnos:     turRes.data  ?? [],
    grupos:     grpRes.data  ?? [],
    meta:       (metaRes as any).data?.meta_faturamento ?? null,
  });
}
