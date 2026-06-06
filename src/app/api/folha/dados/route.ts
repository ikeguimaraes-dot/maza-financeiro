// src/app/api/folha/dados/route.ts
// Repo: kph-os-financeiro
// Caminho final: src/app/api/folha/dados/route.ts

import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const CORS = {
  "Access-Control-Allow-Origin": "https://kph-os.vercel.app",
  "Access-Control-Allow-Methods": "GET, POST",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS() {
  return new Response(null, { headers: CORS })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const unit_id = searchParams.get("unit_id")
  const mes = searchParams.get("mes")   // ex: "5"
  const ano = searchParams.get("ano")   // ex: "2026"

  if (!unit_id) {
    return Response.json({ error: "unit_id obrigatório" }, { status: 400, headers: CORS })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── 1. Folha de colaboradores (dre_folha) ──────────────────────────────────
  // Não tem coluna de mês — retorna todos os colaboradores ativos da unidade.
  // is_vaga = false filtra vagas abertas (headcount real).
  const { data: folha, error: errFolha } = await supabase
    .from("dre_folha")
    .select("id, nome, funcao, divisao, tipo, admissao, salario, custo_total, is_vaga")
    .eq("unit_id", unit_id)
    .eq("is_vaga", false)
    .order("divisao", { ascending: true })
    .order("nome", { ascending: true })

  if (errFolha) {
    return Response.json({ error: errFolha.message }, { status: 500, headers: CORS })
  }

  // ── 2. Vagas abertas (headcount planejado vs real) ─────────────────────────
  const { data: vagas } = await supabase
    .from("dre_folha")
    .select("id, funcao, divisao, salario, custo_total")
    .eq("unit_id", unit_id)
    .eq("is_vaga", true)

  // ── 3. Gorjeta distribuição ────────────────────────────────────────────────
  // Filtra por mês/ano se informado, senão retorna o período mais recente
  let gorjetaQuery = supabase
    .from("gorjeta_distribuicao")
    .select("id, nome, cargo, percentual, valor_bruto, valor_liquido, mes, ano, periodo, employee_id")
    .eq("unit_id", unit_id)

  if (mes && ano) {
    gorjetaQuery = gorjetaQuery.eq("mes", parseInt(mes)).eq("ano", parseInt(ano))
  } else {
    // Busca o período mais recente disponível
    const { data: ultimoPeriodo } = await supabase
      .from("gorjeta_distribuicao")
      .select("mes, ano")
      .eq("unit_id", unit_id)
      .order("ano", { ascending: false })
      .order("mes", { ascending: false })
      .limit(1)
      .single()

    if (ultimoPeriodo) {
      gorjetaQuery = gorjetaQuery
        .eq("mes", ultimoPeriodo.mes)
        .eq("ano", ultimoPeriodo.ano)
    }
  }

  const { data: gorjetaDist } = await gorjetaQuery
    .order("valor_bruto", { ascending: false })

  // ── 4. Pontos por cargo ────────────────────────────────────────────────────
  const { data: cargoPontos } = await supabase
    .from("gorjeta_cargo_pontos")
    .select("cargo, pontos, ativo")
    .eq("unit_id", unit_id)
    .eq("ativo", true)
    .order("pontos", { ascending: false })

  // ── 5. Histórico gorjeta mensal (para gráfico) ─────────────────────────────
  // Agrega SUM(valor_bruto) por mes+ano dos últimos 12 meses
  const { data: gorjetaHistorico } = await supabase
    .from("gorjeta_distribuicao")
    .select("mes, ano, valor_bruto")
    .eq("unit_id", unit_id)
    .order("ano", { ascending: false })
    .order("mes", { ascending: false })

  // Agrega manualmente (Supabase não tem GROUP BY via client)
  const gorjetaPorPeriodo: Record<string, number> = {}
  for (const row of gorjetaHistorico ?? []) {
    const chave = `${row.ano}-${String(row.mes).padStart(2, "0")}`
    gorjetaPorPeriodo[chave] = (gorjetaPorPeriodo[chave] ?? 0) + (row.valor_bruto ?? 0)
  }
  const gorjetaHistoricoAgregado = Object.entries(gorjetaPorPeriodo)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([periodo, total]) => ({ periodo, total }))

  // ── 6. Monta resumo ────────────────────────────────────────────────────────
  const colaboradores = folha ?? []
  const totalFolha = colaboradores.reduce((s, c) => s + (c.custo_total ?? 0), 0)
  const totalSalario = colaboradores.reduce((s, c) => s + (c.salario ?? 0), 0)
  const headcount = colaboradores.length
  const custoPorPessoa = headcount > 0 ? totalFolha / headcount : 0

  // Breakdown por divisão
  const porDivisao: Record<string, { custo: number; headcount: number }> = {}
  for (const c of colaboradores) {
    const div = c.divisao ?? "SEM DIVISÃO"
    if (!porDivisao[div]) porDivisao[div] = { custo: 0, headcount: 0 }
    porDivisao[div].custo += c.custo_total ?? 0
    porDivisao[div].headcount += 1
  }

  // Breakdown por função (top 10)
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

  // Gorjeta resumo
  const gorjeta = gorjetaDist ?? []
  const gorjetaTotalBruto = gorjeta.reduce((s, g) => s + (g.valor_bruto ?? 0), 0)
  const gorjetaTotalLiquido = gorjeta.reduce((s, g) => s + (g.valor_liquido ?? 0), 0)
  const gorjetaHeadcount = gorjeta.length

  // Gorjeta por cargo (agrega)
  const gorjetaPorCargo: Record<string, { valor_bruto: number; headcount: number; pontos: number }> = {}
  const pontosMap: Record<string, number> = {}
  for (const cp of cargoPontos ?? []) {
    pontosMap[cp.cargo] = cp.pontos
  }
  for (const g of gorjeta) {
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

  // Período da gorjeta (para exibir no header)
  const primeiraGorjeta = gorjeta[0]
  const periodoGorjeta = primeiraGorjeta
    ? `${primeiraGorjeta.mes?.toString().padStart(2, "0")}/${primeiraGorjeta.ano}`
    : null

  return Response.json(
    {
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
      gorjeta: {
        periodo: periodoGorjeta,
        totalBruto: gorjetaTotalBruto,
        totalLiquido: gorjetaTotalLiquido,
        headcount: gorjetaHeadcount,
        distribuicao: gorjeta,
        breakdownCargo: gorjetaBreakdownCargo,
        historico: gorjetaHistoricoAgregado,
        cargoPontos: cargoPontos ?? [],
      },
    },
    { headers: CORS }
  )
}
