import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// CORS com allowlist — ecoa o Origin quando permitido. Em prod o shell fica
// em https://maza.vercel.app; em dev ele sobe em http://localhost:3000.
const CORS_ALLOWLIST = new Set([
  "https://maza.vercel.app",
  "http://localhost:3000",
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
  if (origin && CORS_ALLOWLIST.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function OPTIONS(request: Request) {
  return new Response(null, { headers: corsHeaders(request) });
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Supabase env vars not set");
  return createClient(url, key);
}

export async function GET(request: Request) {
  const CORS = corsHeaders(request);
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
    .select("id, data, turno, receita_bruta, desconto, gorjeta, receita_liquida, custo, cmv_pct, clientes, ticket_medio, previsto, devedor")
    .eq("unit_id", unit_id)
    .gte("data", start)
    .lte("data", end)
    .order("data", { ascending: false });

  if (wErr) return Response.json({ error: wErr.message }, { status: 500, headers: CORS });

  const ids: string[] = (workdays ?? []).map((w: any) => w.id);

  if (ids.length === 0) {
    return Response.json({ workdays: [], pagamentos: [], descontos: [], ambientes: [], turnos: [], grupos: [], horarios: [], usuarios: [], caixas: [], produtosDia: [], descontosDetalhe: [], cancelamentos: [], cancelamentosDetalhe: [], meta: null, metasDiaSemana: [], metasOverride: [] }, { headers: CORS });
  }

  const [pagRes, descRes, ambRes, turRes, grpRes, metaRes, metasDsRes, overrideRes, horRes, usuRes, caixasRes, prodRes, descDetRes, cancelRes, cancelDetRes] = await Promise.all([
    db.from("lorean_pagamentos").select("workday_id_fk, forma, valor_fechado, valor_recebido").in("workday_id_fk", ids),
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
    db.from("lorean_produtos_dia").select("workday_id_fk, grupo, produto, qtd, cmv_pct, bruto, desconto, gorjeta, total").in("workday_id_fk", ids),
    db.from("lorean_descontos_detalhe").select("workday_id_fk, item, usuario, motivo, qtd, valor").in("workday_id_fk", ids),
    db.from("lorean_cancelamentos").select("workday_id_fk, motivo, qtd, consumo").in("workday_id_fk", ids),
    db.from("lorean_cancelamentos_detalhe").select("workday_id_fk, item, usuario, motivo, qtd, valor").in("workday_id_fk", ids),
  ]);

  // Receita bruta da DRE = lorean_workdays.receita_bruta = PREVISTO (o que foi
  // vendido: convite+produto+gorjeta±pendência antiga) — já gravado corretamente
  // no import, não recalculado aqui. valor_recebido segue somado à parte (o que
  // de fato entrou no caixa); devedor_real = previsto - recebido, agora mais
  // completo que uma comparação puramente fechado-vs-recebido, porque previsto já
  // contabiliza pendência antiga que uma soma de pagamentos do dia nunca capturaria.
  const recebidoByWorkday = new Map<string, number>();
  for (const p of (pagRes.data ?? [])) {
    const wdId = (p as any).workday_id_fk as string;
    recebidoByWorkday.set(wdId, (recebidoByWorkday.get(wdId) ?? 0) + ((p as any).valor_recebido ?? 0));
  }

  const workdaysEnriched = (workdays ?? []).map((w: any) => {
    const receitaBruta = w.receita_bruta ?? 0;
    const recebido = recebidoByWorkday.get(w.id) ?? 0;
    return {
      ...w,
      receita_bruta_real: receitaBruta,
      recebido_real: recebido,
      devedor_real: receitaBruta - recebido,
    };
  });

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
        // Sem split fechado/recebido no nível de turno (lorean_turnos só tem consumo).
        recebido_real: null,
        devedor_real: null,
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
    caixas:           caixasRes.data  ?? [],
    produtosDia:      prodRes.data    ?? [],
    descontosDetalhe:     descDetRes.data   ?? [],
    cancelamentos:        cancelRes.data    ?? [],
    cancelamentosDetalhe: cancelDetRes.data ?? [],
    meta:           (metaRes as any).data?.meta_faturamento ?? null,
    metasDiaSemana: metasDsRes.data  ?? [],
    metasOverride:  overrideRes.data ?? [],
  }, { headers: CORS });
}
