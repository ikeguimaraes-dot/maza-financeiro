import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const CORS = {
  "Access-Control-Allow-Origin": "https://maza.vercel.app",
  "Access-Control-Allow-Methods": "GET, POST",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS() {
  return new Response(null, { headers: CORS })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const unit_id = searchParams.get("unit_id")
  const mes = searchParams.get("mes")
  const ano = searchParams.get("ano")

  if (!unit_id) {
    return Response.json({ error: "unit_id obrigatório" }, { status: 400, headers: CORS })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let competencia: string

  if (mes && ano) {
    competencia = `${ano}-${String(mes).padStart(2, "0")}`
  } else {
    const { data: ultima } = await supabase
      .from("dre_folha")
      .select("competencia")
      .eq("unit_id", unit_id)
      .not("competencia", "is", null)
      .order("competencia", { ascending: false })
      .limit(1)
      .single()

    competencia = ultima?.competencia ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  }

  const { data: folha, error: errFolha } = await supabase
    .from("dre_folha")
    .select("id, nome, funcao, divisao, tipo, admissao, salario, custo_total, is_vaga, competencia")
    .eq("unit_id", unit_id)
    .eq("competencia", competencia)
    .eq("is_vaga", false)
    .order("divisao", { ascending: true })
    .order("nome", { ascending: true })

  if (errFolha) {
    return Response.json({ error: errFolha.message }, { status: 500, headers: CORS })
  }

  const { data: vagas } = await supabase
    .from("dre_folha")
    .select("id, funcao, divisao, salario, custo_total")
    .eq("unit_id", unit_id)
    .eq("competencia", competencia)
    .eq("is_vaga", true)

  const { data: competenciasRaw } = await supabase
    .from("dre_folha")
    .select("competencia")
    .eq("unit_id", unit_id)
    .not("competencia", "is", null)
    .order("competencia", { ascending: false })

  const competenciasDisponiveis = [
    ...new Set((competenciasRaw ?? []).map((r) => r.competencia)),
  ]

  const [anoNum, mesNum] = competencia.split("-").map(Number)

  const { data: gorjetaDist } = await supabase
    .from("gorjeta_distribuicao")
    .select("id, nome, cargo, percentual, valor_bruto, valor_liquido, mes, ano, periodo, employee_id")
    .eq("unit_id", unit_id)
    .eq("mes", mesNum)
    .eq("ano", anoNum)
    .order("valor_bruto", { ascending: false })

  let gorjetaFinal = gorjetaDist ?? []
  let gorjetaPeriodoLabel = gorjetaFinal.length > 0
    ? `${String(mesNum).padStart(2, "0")}/${anoNum}`
    : null

  if (gorjetaFinal.length === 0) {
    const { data: ultimaGorjeta } = await supabase
      .from("gorjeta_distribuicao")
      .select("mes, ano")
      .eq("unit_id", unit_id)
      .order("ano", { ascending: false })
      .order("mes", { ascending: false })
      .limit(1)
      .single()

    if (ultimaGorjeta) {
      const { data: gorjetaRecente } = await supabase
        .from("gorjeta_distribuicao")
        .select("id, nome, cargo, percentual, valor_bruto, valor_liquido, mes, ano, periodo, employee_id")
        .eq("unit_id", unit_id)
        .eq("mes", ultimaGorjeta.mes)
        .eq("ano", ultimaGorjeta.ano)
        .order("valor_bruto", { ascending: false })

      gorjetaFinal = gorjetaRecente ?? []
      gorjetaPeriodoLabel = gorjetaFinal.length > 0
        ? `${String(ultimaGorjeta.mes).padStart(2, "0")}/${ultimaGorjeta.ano} (último disponível)`
        : null
    }
  }

  const { data: cargoPontos } = await supabase
    .from("gorjeta_cargo_pontos")
    .select("cargo, pontos, ativo")
    .eq("unit_id", unit_id)
    .eq("ativo", true)
    .order("pontos", { ascending: false })

  const { data: gorjetaHistoricoRaw } = await supabase
    .from("gorjeta_distribuicao")
    .select("mes, ano, valor_bruto")
    .eq("unit_id", unit_id)

  const gorjetaPorPeriodo: Record<string, number> = {}
  for (const row of gorjetaHistoricoRaw ?? []) {
    const chave = `${row.ano}-${String(row.mes).padStart(2, "0")}`
    gorjetaPorPeriodo[chave] = (gorjetaPorPeriodo[chave] ?? 0) + (row.valor_bruto ?? 0)
  }
  const gorjetaHistorico = Object.entries(gorjetaPorPeriodo)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([periodo, total]) => ({ periodo, total }))

  const { data: folhaHistoricoRaw } = await supabase
    .from("dre_folha")
    .select("competencia, custo_total")
    .eq("unit_id", unit_id)
    .eq("is_vaga", false)
    .not("competencia", "is", null)

  const folhaPorCompetencia: Record<string, number> = {}
  for (const row of folhaHistoricoRaw ?? []) {
    const c = row.competencia as string
    folhaPorCompetencia[c] = (folhaPorCompetencia[c] ?? 0) + (row.custo_total ?? 0)
  }
  const folhaHistorico = Object.entries(folhaPorCompetencia)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([periodo, total]) => ({ periodo, total }))

  const colaboradores = folha ?? []
  const totalFolha = colaboradores.reduce((s, c) => s + (c.custo_total ?? 0), 0)
  const totalSalario = colaboradores.reduce((s, c) => s + (c.salario ?? 0), 0)
  const headcount = colaboradores.length
  const custoPorPessoa = headcount > 0 ? totalFolha / headcount : 0

  const porDivisao: Record<string, { custo: number; headcount: number }> = {}
  for (const c of colaboradores) {
    const div = c.divisao ?? "SEM DIVISÃO"
    if (!porDivisao[div]) porDivisao[div] = { custo: 0, headcount: 0 }
    porDivisao[div].custo += c.custo_total ?? 0
    porDivisao[div].headcount += 1
  }

  const porFuncao: Record<string, { custo: number; headcount: number }> = {}
  for (const c of colaboradores) {
    const fn = c.funcao ?? "SEM FUNÇÃO"
    if (!porFuncao[fn]) porFuncao[fn] = { custo: 0, headcount: 0 }
    porFuncao[fn].custo += c.custo_total ?? 0
    porFuncao[fn].headcount += 1
  }
  const topFuncoes = Object.entries(porFuncao)
    .sort(([, a], [, b]) => b.custo - a.custo)
    .slice(0, 10)
    .map(([funcao, dados]) => ({ funcao, ...dados }))

  const gorjetaTotalBruto = gorjetaFinal.reduce((s, g) => s + (g.valor_bruto ?? 0), 0)
  const gorjetaTotalLiquido = gorjetaFinal.reduce((s, g) => s + (g.valor_liquido ?? 0), 0)

  const pontosMap: Record<string, number> = {}
  for (const cp of cargoPontos ?? []) pontosMap[cp.cargo] = cp.pontos

  const gorjetaPorCargo: Record<string, { valor_bruto: number; headcount: number; pontos: number }> = {}
  for (const g of gorjetaFinal) {
    const cargo = g.cargo || "Sem cargo"
    if (!gorjetaPorCargo[cargo]) gorjetaPorCargo[cargo] = { valor_bruto: 0, headcount: 0, pontos: pontosMap[cargo] ?? 0 }
    gorjetaPorCargo[cargo].valor_bruto += g.valor_bruto ?? 0
    gorjetaPorCargo[cargo].headcount += 1
  }
  const gorjetaBreakdownCargo = Object.entries(gorjetaPorCargo)
    .sort(([, a], [, b]) => b.valor_bruto - a.valor_bruto)
    .map(([cargo, dados]) => ({
      cargo,
      pontos: dados.pontos,
      headcount: dados.headcount,
      valor_total: dados.valor_bruto,
      valor_medio: dados.headcount > 0 ? dados.valor_bruto / dados.headcount : 0,
    }))

  return Response.json(
    {
      competencia,
      competenciasDisponiveis,
      resumo: {
        totalFolha,
        totalSalario,
        headcount,
        custoPorPessoa,
        vagasAbertas: vagas?.length ?? 0,
      },
      colaboradores,
      porDivisao: Object.entries(porDivisao)
        .sort(([, a], [, b]) => b.custo - a.custo)
        .map(([divisao, dados]) => ({ divisao, ...dados })),
      topFuncoes,
      folhaHistorico,
      gorjeta: {
        periodo: gorjetaPeriodoLabel,
        totalBruto: gorjetaTotalBruto,
        totalLiquido: gorjetaTotalLiquido,
        headcount: gorjetaFinal.length,
        distribuicao: gorjetaFinal,
        breakdownCargo: gorjetaBreakdownCargo,
        historico: gorjetaHistorico,
        cargoPontos: cargoPontos ?? [],
      },
    },
    { headers: CORS }
  )
}
