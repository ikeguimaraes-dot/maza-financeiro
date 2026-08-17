export const runtime = "nodejs"
export const maxDuration = 60

import * as XLSX from "xlsx"
import { createOperationsClient } from "@kph/db/supabase/operations-client"
import { requireUser } from "@kph/auth/server"
import { mapRow, normalizeUnitName } from "@/lib/pagar-import/parse-titulos"

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try { await requireUser() }
  catch { return Response.json({ error: "Não autorizado" }, { status: 401 }) }

  let formData: FormData
  try { formData = await req.formData() }
  catch { return Response.json({ error: "Requisição inválida" }, { status: 400 }) }

  const file = formData.get("file") as File | null
  if (!file) return Response.json({ error: "Arquivo não enviado" }, { status: 400 })
  const diagnostico = formData.get("mode") === "diagnostico"

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return Response.json({ error: "Planilha sem abas" }, { status: 400 })

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!, { defval: null })
  if (!rows.length) return Response.json({ error: "Nenhuma linha encontrada" }, { status: 400 })

  const db = createOperationsClient() as any
  if (!db) return Response.json({ error: "Banco indisponível" }, { status: 500 })
  const { data: units, error: unitsError } = await db.from("units").select("id,name")
  if (unitsError) return Response.json({ error: `Erro ao carregar unidades: ${unitsError.message}` }, { status: 500 })
  const unitMap = new Map<string, string>((units ?? []).map((unit: { id: string; name: string }) => [normalizeUnitName(unit.name), unit.id]))

  const importadoEm = new Date().toISOString()
  const unknownEmpresas = new Map<string, number>()
  const allRecords: Record<string, unknown>[] = []
  let linhasDescartadas = 0

  for (const r of rows) {
    const { record, fantasiaEmpresa } = mapRow(r, unitMap)
    if (!record) {
      if (fantasiaEmpresa) {
        // Fantasia Empresa presente mas não reconhecida — conta pra
        // reportar/abortar; não é a linha de rodapé (essa tem
        // Fantasia Empresa e Fornecedor ambos vazios).
        unknownEmpresas.set(fantasiaEmpresa, (unknownEmpresas.get(fantasiaEmpresa) ?? 0) + 1)
      } else {
        linhasDescartadas++
      }
      continue
    }
    allRecords.push({ ...record, importado_em: importadoEm })
  }

  // ── Modo Diagnóstico — só analisa, não grava nada no banco ──────────────────
  if (diagnostico) {
    const situacoes = new Map<string, number>()
    for (const rec of allRecords) {
      const s = String(rec.situacao_atual ?? "(vazio)")
      situacoes.set(s, (situacoes.get(s) ?? 0) + 1)
    }

    // Colisões de chave de dedup com valor divergente (mesmo diagnóstico
    // usado no import de produtos) — indicaria a mesma parcela aparecendo
    // duas vezes no arquivo com dados diferentes.
    const byKey = new Map<string, Record<string, unknown>[]>()
    for (const rec of allRecords) {
      const key = `${rec.n_titulo}|${rec.parcela}|${rec.fantasia_empresa}|${rec.ref_mes}`
      const bucket = byKey.get(key) ?? []
      bucket.push(rec)
      byKey.set(key, bucket)
    }
    const colisoes = [...byKey.entries()].filter(([, recs]) => recs.length > 1)

    const amostra = allRecords.slice(0, 15).map((rec) => ({
      id: rec.id, n_titulo: rec.n_titulo, parcela: rec.parcela,
      fantasia_empresa: rec.fantasia_empresa, ref_mes: rec.ref_mes,
      v_titulo: rec.v_titulo, v_saldo_atual: rec.v_saldo_atual,
      v_pagamento: rec.v_pagamento, situacao_atual: rec.situacao_atual,
      posicao: rec.posicao, dre: rec.dre, d_vencimento: rec.d_vencimento,
    }))

    return Response.json({
      ok: true,
      diagnostico: true,
      totalLinhasArquivo: rows.length,
      totalTitulosValidos: allRecords.length,
      linhasDescartadasSemFantasiaOuFornecedor: linhasDescartadas,
      fantasiaEmpresaNaoReconhecida: [...unknownEmpresas.entries()].map(([empresa, count]) => ({ empresa, count })),
      situacaoContagem: [...situacoes.entries()].sort((a, b) => b[1] - a[1]),
      colisoesDedupNaChave: colisoes.length,
      amostraColisoes: colisoes.slice(0, 5).map(([key, recs]) => ({ key, ocorrencias: recs.length })),
      amostraRegistros: amostra,
    })
  }

  // ── Import de verdade ────────────────────────────────────────────────────────
  // Aborta o import inteiro se alguma Fantasia Empresa não estiver no
  // UNIT_MAP — não grava nada com unit_id nulo nem pula em silêncio.
  if (unknownEmpresas.size > 0) {
    const detalhe = [...unknownEmpresas.entries()]
      .map(([empresa, count]) => `"${empresa}" (${count} linha${count !== 1 ? "s" : ""})`)
      .join(", ")
    return Response.json(
      { error: `Import abortado — Fantasia Empresa não reconhecida: ${detalhe}. Atualize o mapa de unidades antes de importar.` },
      { status: 400 },
    )
  }

  // Dedup em memória pela chave natural (n_titulo, parcela, fantasia_empresa,
  // ref_mes) — mantém a última ocorrência, pra não conflitar dentro do mesmo
  // upsert quando a planilha traz a mesma parcela repetida internamente.
  const dedup = new Map<string, Record<string, unknown>>()
  for (const rec of allRecords) {
    const key = `${rec.n_titulo}|${rec.parcela}|${rec.fantasia_empresa}|${rec.ref_mes}`
    dedup.set(key, rec)
  }
  const records = [...dedup.values()]

  // Delete por (unit_id, ref_mes), não só ref_mes — um reimport que traz
  // só algumas unidades não pode apagar títulos de outras unidades no
  // mesmo mês (mesmo padrão do import de produtos: delete escopado por
  // unidade, não só por período).
  const refMesesSet = new Set<string>()
  const refMesesPorUnidade = new Map<string, Set<string>>()
  for (const rec of records) {
    if (!rec.ref_mes) continue
    const unitId = rec.unit_id as string
    const bucket = refMesesPorUnidade.get(unitId) ?? new Set<string>()
    bucket.add(rec.ref_mes as string)
    refMesesPorUnidade.set(unitId, bucket)
    refMesesSet.add(rec.ref_mes as string)
  }

  for (const [unitId, refMesesDaUnidade] of refMesesPorUnidade) {
    const { error: delErr } = await db
      .from("titulos_a_pagar")
      .delete()
      .eq("unit_id", unitId)
      .in("ref_mes", [...refMesesDaUnidade])
    if (delErr) return Response.json({ error: `Erro ao limpar dados: ${delErr.message}` }, { status: 500 })
  }

  const BATCH = 200
  let inserted = 0
  for (let i = 0; i < records.length; i += BATCH) {
    const { error: insErr } = await db
      .from("titulos_a_pagar")
      .upsert(records.slice(i, i + BATCH) as any, { onConflict: "n_titulo,parcela,fantasia_empresa,ref_mes" })
    if (insErr) return Response.json({ error: `Erro ao inserir lote ${i / BATCH + 1}: ${insErr.message}` }, { status: 500 })
    inserted += Math.min(BATCH, records.length - i)
  }

  return Response.json({ ok: true, inserted, ref_meses: [...refMesesSet] })
}
