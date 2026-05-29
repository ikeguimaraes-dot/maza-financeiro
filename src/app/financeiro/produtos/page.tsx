import Link from "next/link"
import { requireUser } from "@kph/auth/server"
import { getCurrentUnit } from "@kph/auth/unit"
import { createSupabaseServerClient } from "@kph/db/supabase/server"
import { ProdutosClient } from "@/components/financeiro/produtos/ProdutosClient"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ mes?: string; ano?: string }>

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

  const unit = await getCurrentUnit()
  const unitId = unit?.id ?? null

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const uq = (q: any) => unitId ? q.eq("unit_id", unitId) : q

  // Current month
  const { data: rows } = await uq(
    db.from("produtos_relatorio").select("*")
  )
    .eq("mes_lancamento", mes)
    .eq("ano_lancamento", ano)
    .order("fornecedor_nome")
    .order("item_descricao")

  // Previous month for MoM comparison
  const prevMes = mes === 1 ? 12 : mes - 1
  const prevAno = mes === 1 ? ano - 1 : ano
  const { data: prevRows } = await uq(
    db.from("produtos_relatorio").select("id,v_custo_total,calcula_cmv,desc_gerencial")
  )
    .eq("mes_lancamento", prevMes)
    .eq("ano_lancamento", prevAno)

  // Available months for the selector
  let meses: { mes: number; ano: number }[] = []
  if (unitId) {
    const { data: mesData } = await db
      .from("produtos_relatorio")
      .select("mes_lancamento, ano_lancamento")
      .eq("unit_id", unitId)
    if (mesData) {
      const seen = new Set<string>()
      for (const r of mesData as { mes_lancamento: number; ano_lancamento: number }[]) {
        const k = `${r.ano_lancamento}-${r.mes_lancamento}`
        if (!seen.has(k)) { seen.add(k); meses.push({ mes: r.mes_lancamento, ano: r.ano_lancamento }) }
      }
      meses.sort((a, b) => a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes)
    }
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
      />
    </div>
  )
}
