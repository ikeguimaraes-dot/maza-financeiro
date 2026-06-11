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
    return Response.json({ error: "unit_id, start e end são obrigatórios" }, { status: 400, headers: CORS });
  }

  let db: ReturnType<typeof getServiceClient>;
  try {
    db = getServiceClient();
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: CORS });
  }

  const { data: workdays, error: wErr } = await db
    .from("lorean_workdays")
    .select("id, data, turno, receita_bruta, desconto, gorjeta, receita_liquida, custo, cmv_pct, clientes, ticket_medio")
    .eq("unit_id", unit_id)
    .gte("data", start)
    .lte("data", end)
    .order("data", { ascending: false });

  if (wErr) return Response.json({ error: wErr.message }, { status: 500, headers: CORS });

  const ids: string[] = (workdays ?? []).map((w: any) => w.id);

  if (ids.length === 0) {
    return Response.json({ workdays: [], pagamentos: [], descontos: [], ambientes: [], turnos: [], grupos: [], horarios: [], usuarios: [], caixas: [], meta: null, metasDiaSemana: [], metasOverride: [] }, { headers: CORS });
  }

  const [pagRes, descRes, ambRes, turRes, grpRes, metaRes, metasDsRes, overrideRes, horRes, usuRes, caixasRes] = await Promise.all([
    db.from("lorean_pagamentos").select("workday_id_fk, forma, valor_recebido").in("workday_id_fk", ids),
    db.from("lorean_descontos").select("workday_id_fk, motivo, qtd, consumo").in("workday_id_fk", ids),
    db.from("lorean_ambientes").select("workday_id_fk, ambiente, produto, clientes").in("workday_id_fk", ids),
    db.from("lorean_turnos").select("workday_id_fk, turno, produto, clientes, gorjeta, consumo").in("workday_id_fk", ids),
    db.from("lorean_grupos").select("grupo, bruto, pct_bruto").in("workday_id_fk", ids),
    mes_ano
      ? db.from("metas_projecoes").select("meta_faturamento").eq("mes_ano", mes_ano).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("metas_dia_semana").select("dia_semana, meta").eq("unit_id", unit_id),
    db.from("metas_dia_override").select("data, meta").eq("unit_id", unit_id).gte("data", start).lte("data", end),
    db.from("lorean_horarios").select("workday_id_fk, hora, clientes, gorjeta, produto, consumo").in("workday_id_fk", ids),
    db.from("lorean_usuarios").select("workday_id_fk, usuario, qtd, gorjeta, produto, consumo").in("workday_id_fk", ids),
    db.from("lorean_caixas").select("workday_id_fk, operador, total_fechado, total_recebido, diferenca").in("workday_id_fk", ids),
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

  // Agrupa lorean_turnos por workday
  const turnosByWorkday = new Map<string, any[]>();
  for (const t of (turRes.data ?? [])) {
    const fk = (t as any).workday_id_fk as string;
    if (!turnosByWorkday.has(fk)) turnosByWorkday.set(fk, []);
    turnosByWorkday.get(fk)!.push(t);
  }

  // Quebra workdays dia_inteiro em linhas por turno
  const workdaysFinal: any[] = [];
  for (const w of workdaysEnriched) {
    if (w.turno !== "dia_inteiro") {
      workdaysFinal.push(w);
      continue;
    }
    const turnosDoDia = (turnosByWorkday.get(w.id) ?? [])
      .filter((t: any) => (t.consumo ?? 0) > 0);

    const temTarde = turnosDoDia.some((t: any) => (t.turno ?? "").toLowerCase().includes("tarde"));
    const temNoite = turnosDoDia.some((t: any) => (t.turno ?? "").toLowerCase().includes("noite"));

    if (!temTarde && !temNoite) {
      workdaysFinal.push(w);
      continue;
    }

    for (const t of turnosDoDia) {
      const nome = (t.turno ?? "").toLowerCase();
      const turnoLabel = nome.includes("tarde") ? "almoco" : nome.includes("noite") ? "jantar" : null;
      if (!turnoLabel) continue;
      workdaysFinal.push({
        ...w,
        id: `${w.id}::${turnoLabel}`,
        turno: turnoLabel,
        receita_bruta: t.consumo,
        receita_bruta_real: t.consumo,
        gorjeta: t.gorjeta,
        clientes: t.clientes,
        ticket_medio: t.clientes > 0 ? t.consumo / t.clientes : null,
        _derivado_de_dia_inteiro: true,
      });
    }
  }

  return Response.json({
    workdays:       workdaysFinal,
    pagamentos:     pagRes.data      ?? [],
    descontos:      descRes.data     ?? [],
    ambientes:      ambRes.data      ?? [],
    turnos:         turRes.data      ?? [],
    grupos:         grpRes.data      ?? [],
    horarios:       horRes.data      ?? [],
    usuarios:       usuRes.data      ?? [],
    caixas:         caixasRes.data   ?? [],
    meta:           (metaRes as any).data?.meta_faturamento ?? null,
    metasDiaSemana: metasDsRes.data  ?? [],
    metasOverride:  overrideRes.data ?? [],
  }, { headers: CORS });
}
