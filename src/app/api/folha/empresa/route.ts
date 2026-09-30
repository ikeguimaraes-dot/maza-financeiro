import { z } from "zod"
import { createFinanceiroClient } from "@/lib/financeiro/db/client"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const unit = z.string().uuid().safeParse(params.get("unit_id"))
  if (!unit.success) return Response.json({ error: "Unidade inválida." }, { status: 400 })
  try {
    const db = await createFinanceiroClient()
    const mes = params.get("competencia")
    if (mes && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(mes)) return Response.json({ error: "Competência inválida." }, { status: 400 })
    // Bounded, indexed reads; no payroll recalculation or third-party calls.
    const { data: meses, error: erroMeses } = await db.rpc("folha_empresa_competencias", { p_unit_id: unit.data })
      .abortSignal(AbortSignal.timeout(15000))
    if (erroMeses) throw erroMeses
    const competencias = (meses ?? []).map((r: { competencia: string }) => r.competencia)
    const competencia = mes ?? competencias[0] ?? null
    if (!competencia) return Response.json({ competencias, competencia, linhas: [] }, { headers: { "Cache-Control": "private, no-store" } })
    const linhas = []
    for (let offset = 0; ; offset += 500) {
      const { data: pagina, error } = await db.from("folha_empresa")
      .select("id,nome,nome_chave,pagamento,bonificacao,etapa,fontes,arquivo,atualizado_em")
      .eq("unit_id", unit.data).eq("competencia", competencia).order("nome").order("id").range(offset, offset + 499)
      .abortSignal(AbortSignal.timeout(15000))
      if (error) throw error
      linhas.push(...(pagina ?? []))
      if (!pagina || pagina.length < 500) break
    }
    return Response.json({ competencias, competencia, linhas }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return Response.json({ error: "Não foi possível carregar a Folha Empresa. Tente novamente." }, { status: 500 })
  }
}
