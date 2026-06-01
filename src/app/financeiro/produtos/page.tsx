import Link from "next/link"
import { redirect } from "next/navigation"
import { requireUser } from "@kph/auth/server"
import { getCurrentUnit } from "@kph/auth/unit"
import { createSupabaseServerClient } from "@kph/db/supabase/server"
import { ProdutosClient } from "@/components/financeiro/produtos/ProdutosClient"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ mes?: string; ano?: string; q?: string }>

export type ProdutoRow = {
  id: number
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

export default async function ProdutosPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser()
  const sp = await searchParams

  const now = new Date()
  const mes = sp.mes ? parseInt(sp.mes, 10) : now.getMonth() + 1
  const ano = sp.ano ? parseInt(sp.ano, 10) : now.getFullYear()
  const q   = sp.q?.trim() ?? ""

  const unit = await getCurrentUnit()
  const unitId = unit?.id ?? null
  console.log('[produtos] unitId:', unitId)

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uq = (qb: any) => unitId ? qb.eq("unit_id", unitId) : qb

  // Current month
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rowsQuery: any = uq(db.from("produtos_relatorio").select("*"))
    .eq("mes_lancamento", mes)
    .eq("ano_lancamento", ano)
    .order("fornecedor_nome")
    .order("item_descricao")
    .limit(2000)
  if (q) rowsQuery = rowsQuery.ilike("item_descricao", `%${q}%`)
  const { data: rows } = await rowsQuery

  // Previous month for MoM comparison
  const prevMes = mes === 1 ? 12 : mes - 1
  const prevAno = mes === 1 ? ano - 1 : ano
  const { data: prevRows } = await uq(
    db.from("produtos_relatorio").select("id,v_custo_total,calcula_cmv,desc_gerencial")
  )
    .eq("mes_lancamento", prevMes)
    .eq("ano_lancamento", prevAno)

  // Diagnostic: OJO DE BIFE cost columns — remove after review
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dq: any = db
      .from("produtos_relatorio")
      .select("item_descricao,q_estoque,v_embalagem,v_total_embalagem,v_custo_medio,v_custo_compra,v_custo_total,mes_lancamento,ano_lancamento")
      .ilike("item_descricao", "%OJO DE BIFE%")
      .limit(5)
    if (unitId) dq = dq.eq("unit_id", unitId)
    const { data: diagData } = await dq
    if (diagData && diagData.length > 0)
      console.log('[diagnóstico OJO DE BIFE]', JSON.stringify(diagData, null, 2))
    else
      console.log('[diagnóstico OJO DE BIFE] nenhum resultado encontrado')
  }

  // Available months for the selector
  const { data: mesesData } = await db.rpc('get_produto_meses', { p_unit_id: unitId })
  const meses: { mes: number; ano: number }[] = mesesData ?? []

  const mesDisponivel = meses.some(m => m.mes === mes && m.ano === ano)
  if (!mesDisponivel && meses.length > 0) {
    const ultimo = meses[meses.length - 1]!
    redirect(`/financeiro/produtos?mes=${ultimo.mes}&ano=${ultimo.ano}`)
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <Link
        href="/financeiro"
        style={{
          fontSize: 11, color: "var(--text-3)", textDecoration: "none",
          fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase",
        }}
      >
        ← Financeiro
      </Link>

      <ProdutosClient
        rows={(rows ?? []) as ProdutoRow[]}
        prevRows={(prevRows ?? []) as Pick<ProdutoRow, "id" | "v_custo_total" | "calcula_cmv" | "desc_gerencial">[]}
        mes={mes}
        ano={ano}
        meses={meses}
        unitId={unitId}
        q={q}
      />
    </div>
  )
}
