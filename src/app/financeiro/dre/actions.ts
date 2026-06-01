"use server"

import { createSupabaseServerClient } from "@kph/db/supabase/server"

export type DreLinhaInsert = {
  unit_id: string
  mes_ano: string
  tipo: "realizado" | "orcado"
  grupo: string
  descricao: string
  conta: string | null
  valor: number | null
  av_percentual: number | null
  custo_tipo: null
}

export async function deleteDreLinhasRealizado(
  unitId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) return { ok: false, error: "Sem conexão com banco" }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db
      .from("dre_linhas_detalhadas")
      .delete()
      .eq("unit_id", unitId)
      .eq("tipo", "realizado")
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function insertDreLinhas(
  rows: DreLinhaInsert[]
): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) return { ok: false, count: 0, error: "Sem conexão com banco" }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error, count } = await db
      .from("dre_linhas_detalhadas")
      .insert(rows)
      .select("id", { count: "exact", head: true })
    if (error) return { ok: false, count: 0, error: error.message }
    return { ok: true, count: count ?? rows.length }
  } catch (e) {
    return { ok: false, count: 0, error: String(e) }
  }
}
