import { getCurrentUnit } from "@maza/auth/unit"
import { createSupabaseServerClient } from "@maza/db/supabase/server"

export const runtime = "nodejs"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const [{ id }, unit] = await Promise.all([context.params, getCurrentUnit()])
  if (!unit) return Response.json({ error: "Unidade não selecionada" }, { status: 401 })
  const db: any = await createSupabaseServerClient()
  if (!db) return Response.json({ error: "Banco não configurado" }, { status: 500 })
  const { data: row, error } = await db
    .from("dre_folha")
    .select("documento_path, documento_nome, documento_pagina")
    .eq("id", id)
    .eq("unit_id", unit.id)
    .maybeSingle()
  if (error || !row?.documento_path) return Response.json({ error: "PDF não encontrado para este colaborador" }, { status: 404 })
  const { data, error: signError } = await db.storage.from("folha-documentos").createSignedUrl(row.documento_path, 300)
  if (signError) return Response.json({ error: signError.message }, { status: 500 })
  return Response.json({ url: data.signedUrl, nome: row.documento_nome, pagina: row.documento_pagina })
}
