import { createFinanceiroClient } from "@/lib/financeiro/db/client";
import { validarMetasSemanais } from "@/lib/receita/metas";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const unit = new URL(request.url).searchParams.get("unit_id");
  if (!unit || !uuid.test(unit)) return Response.json({ error: "Unidade inválida" }, { status: 400 });
  try {
    const db = await createFinanceiroClient();
    const { data: allowed, error: accessError } = await db.rpc("financeiro_can_read", { p_unit: unit });
    if (accessError || !allowed) return Response.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    const { data, error } = await db.from("metas_dia_semana").select("dia_semana,meta").eq("unit_id", unit).order("dia_semana");
    if (error) throw error;
    return Response.json({ metas: data }, { headers });
  } catch { return Response.json({ error: "Não foi possível carregar as metas. Tente novamente." }, { status: 500, headers }); }
}

export async function PUT(request: Request) {
  let body: { unit_id?: unknown; metas?: unknown } | null;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }
  if (!body || typeof body.unit_id !== "string" || !uuid.test(body.unit_id) || !validarMetasSemanais(body.metas)) {
    return Response.json({ error: "Informe os sete dias, com valores a partir de zero e até duas casas decimais." }, { status: 400 });
  }
  const { unit_id: unitId, metas } = body;
  try {
    const db = await createFinanceiroClient();
    const { data: allowed, error: accessError } = await db.rpc("financeiro_can_write", { p_unit: unitId });
    if (accessError || !allowed) return Response.json({ error: "Sem permissão para editar metas desta unidade" }, { status: 403 });
    // One upsert is atomic; a failed request cannot save only part of the week.
    const { data, error } = await db.from("metas_dia_semana").upsert(
      metas.map(({ dia_semana, meta }) => ({ unit_id: unitId, dia_semana, meta, updated_at: new Date().toISOString() })),
      { onConflict: "unit_id,dia_semana" },
    ).select("dia_semana,meta");
    if (error) throw error;
    return Response.json({ metas: data }, { headers });
  } catch { return Response.json({ error: "Não foi possível salvar. As metas anteriores foram preservadas." }, { status: 500, headers }); }
}
