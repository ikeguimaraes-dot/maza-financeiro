"use server"

import { createSupabaseServerClient } from "@kph/db/supabase/server"
import { getCurrentUnit } from "@kph/auth/unit"

export type ProdutoInsert = {
  unit_id: string
  fornecedor_nome: string | null
  nr_danfe: string | null
  v_total_danfe: number | null
  dt_emissao: string | null
  item_codigo: string | null
  item_descricao: string | null
  unidade_medida: string | null
  tipo_item: string | null
  q_embalagem: number | null
  q_estoque: number | null
  v_embalagem: number | null
  v_total_embalagem: number | null
  v_custo_medio: number | null
  v_custo_compra: number | null
  v_custo_total: number | null
  perc_variacao: number | null
  calcula_cmv: boolean | null
  fornecedor_codigo: string | null
  codigo_gerencial: string | null
  desc_gerencial: string | null
  mes_lancamento: number
  ano_lancamento: number
}

export async function deleteProdutosMes(
  unitId: string,
  mes: number,
  ano: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) return { ok: false, error: "Sem conexão com banco" }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db
      .from("produtos_relatorio")
      .delete()
      .eq("unit_id", unitId)
      .eq("mes_lancamento", mes)
      .eq("ano_lancamento", ano)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function insertProdutos(
  rows: ProdutoInsert[]
): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) return { ok: false, count: 0, error: "Sem conexão com banco" }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error, count } = await db
      .from("produtos_relatorio")
      .insert(rows)
      .select("id", { count: "exact", head: true })

    if (error) return { ok: false, count: 0, error: error.message }
    return { ok: true, count: count ?? rows.length }
  } catch (e) {
    return { ok: false, count: 0, error: String(e) }
  }
}

export async function getProdutosMeses(
  unitId: string
): Promise<{ mes: number; ano: number; total: number }[]> {
  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data } = await db
      .from("produtos_relatorio")
      .select("mes_lancamento, ano_lancamento")
      .eq("unit_id", unitId)
    if (!data) return []
    const map = new Map<string, number>()
    for (const r of data) {
      const k = `${r.ano_lancamento}-${r.mes_lancamento}`
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([k, total]) => {
        const [ano, mes] = k.split("-").map(Number)
        return { mes: mes!, ano: ano!, total }
      })
      .sort((a, b) => a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes)
  } catch {
    return []
  }
}

export async function getCurrentUnitId(): Promise<string | null> {
  const unit = await getCurrentUnit()
  return unit?.id ?? null
}
