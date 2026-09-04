import "server-only"
import { createHash } from "node:crypto"
import { createServiceClient } from "@kph/db/supabase/server"
import type { MazaBatchPreview, NfEntradaRow, ContaPagarRow, ReceitaCaixaRow } from "./types"

export class ImportConflictError extends Error {
  constructor(message: string) { super(message); this.name = "ImportConflictError" }
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const chunks = <T>(rows: T[], size = 300) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size))

export async function persistMazaArchive(input: {
  unitId: string; unitName: string; userId: string; fileName: string; bytes: Buffer; preview: MazaBatchPreview; replaceExisting: boolean
}) {
  const db = createServiceClient() as any
  if (!db) throw new Error("Banco de dados indisponível.")
  if (input.preview.kind === "unknown" || input.preview.kind === "folha" || !input.preview.records.length) throw new Error("Pacote sem registros válidos para importar.")
  const checksum = hash(input.bytes.toString("base64"))
  const { data: previous } = await db.from("financeiro_importacoes").select("id,status,registros").eq("unit_id", input.unitId).eq("checksum_sha256", checksum).maybeSingle()
  if (previous?.status === "concluido") return { ok: true, duplicate: true, imported: previous.registros, importId: previous.id }

  const safeName = input.fileName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-")
  const storagePath = `${input.unitId}/${checksum.slice(0, 16)}-${safeName}`
  const { error: uploadError } = await db.storage.from("financeiro-importacoes").upload(storagePath, input.bytes, { contentType: "application/zip", upsert: true })
  if (uploadError) throw new Error(`Falha ao preservar arquivo original: ${uploadError.message}`)
  const audit = { unit_id: input.unitId, tipo: input.preview.kind, arquivo: input.fileName, checksum_sha256: checksum, storage_path: storagePath,
    registros: input.preview.records.length, totais: input.preview.totals, avisos: input.preview.warnings, status: "processando", criado_por: input.userId }
  const { data: batch, error: batchError } = previous
    ? await db.from("financeiro_importacoes").update(audit).eq("id", previous.id).select("id").single()
    : await db.from("financeiro_importacoes").insert(audit).select("id").single()
  if (batchError) throw new Error(batchError.message)

  try {
    if (input.preview.kind === "nf_entrada") await persistNf(db, batch.id, input.unitId, input.preview.records as NfEntradaRow[])
    if (input.preview.kind === "contas_pagar") await persistPayables(db, batch.id, input.unitId, input.unitName, input.preview.records as ContaPagarRow[])
    if (input.preview.kind === "receita") await persistRevenue(db, batch.id, input.unitId, input.preview.records as ReceitaCaixaRow[], input.replaceExisting)
    await db.from("financeiro_importacoes").update({ status: "concluido", concluido_em: new Date().toISOString(), erro: null }).eq("id", batch.id)
    return { ok: true, duplicate: false, imported: input.preview.records.length, importId: batch.id }
  } catch (error) {
    await db.from("financeiro_importacoes").update({ status: "erro", erro: error instanceof Error ? error.message : String(error) }).eq("id", batch.id)
    throw error
  }
}

async function persistNf(db: any, importId: string, unitId: string, rows: NfEntradaRow[]) {
  const records = rows.map((row) => {
    const identity = hash(`${row.fornecedor}|${row.dataEntrada}|${row.numeroNf ?? ""}|${row.produto}|${row.valorTotal}`).slice(0, 24)
    const [year, month] = row.dataEntrada.split("-").map(Number)
    return { unit_id: unitId, importacao_id: importId, fornecedor_nome: row.fornecedor, nr_danfe: row.numeroNf ?? `SEM-NF-${identity}`,
      v_total_danfe: row.valorTotal, dt_emissao: row.dataEntrada, item_codigo: `MAZA-${identity}`, item_descricao: row.produto,
      v_total_embalagem: row.valorTotal, v_custo_total: row.valorTotal, calcula_cmv: true, desc_gerencial: row.produto.split(" - ")[0] || "SEM CLASSIFICAÇÃO",
      mes_lancamento: month, ano_lancamento: year, observacao_origem: row.observacao, desconto_origem: row.desconto, pedido_origem: row.pedido, direcao_nfe: "entrada" }
  })
  for (const part of chunks(records)) {
    const { error } = await db.from("produtos_relatorio").upsert(part, { onConflict: "unit_id,nr_danfe,item_codigo" })
    if (error) throw new Error(`Notas de entrada: ${error.message}`)
  }
}

async function persistPayables(db: any, importId: string, unitId: string, unitName: string, rows: ContaPagarRow[]) {
  const records = rows.map((row) => {
    const identity = hash(`${unitId}|${row.fornecedor}|${row.numeroNf ?? ""}|${row.vencimento}|${row.parcela ?? ""}|${row.valorParcela}`)
    const settled = /\bOK\b|PAG|LIQUID/i.test(row.liquidacao ?? "")
    return { id: identity, unit_id: unitId, importacao_id: importId, origem: "PLANILHA MAZA", empresa: unitName, fantasia_empresa: unitName,
      fornecedor: row.fornecedor, fantasia_fornecedor: row.fornecedor, n_nota_fiscal: row.numeroNf,
      n_titulo: row.numeroNf ? `${row.numeroNf}-${identity.slice(0, 8)}` : identity.slice(0, 16),
      parcela: row.parcela, documento: row.categoria, d_lancamento: row.dataEntrada, d_competencia: row.dataEntrada, d_vencimento: row.vencimento,
      v_titulo: row.valorParcela, v_original: row.valorParcela, v_saldo_atual: settled ? 0 : row.valorParcela, v_pagamento: settled ? row.valorParcela : 0,
      situacao_atual: settled ? "LIQUIDADO" : "ATIVO", d_liquidacao: null, posicao: settled ? "PAGO" : "A PAGAR", dre: "Sim",
      ref_mes: `${row.vencimento.slice(0, 7)}-01`, ano: Number(row.vencimento.slice(0, 4)), valor_total_nf_origem: row.valorTotalNf, liquidacao_origem: row.liquidacao }
  })
  for (const part of chunks(records, 200)) {
    const { error } = await db.from("titulos_a_pagar").upsert(part, { onConflict: "n_titulo,parcela,fantasia_empresa,ref_mes" })
    if (error) throw new Error(`Contas a pagar: ${error.message}`)
  }
}

async function persistRevenue(db: any, importId: string, unitId: string, rows: ReceitaCaixaRow[], replaceExisting: boolean) {
  const unique = new Map<string, ReceitaCaixaRow>()
  for (const row of rows) {
    const key = `${row.data}|${row.turno}`
    if (unique.has(key)) throw new ImportConflictError(`A receita contém mais de um registro para ${row.data} (${row.turno}).`)
    unique.set(key, row)
  }
  const dates = [...new Set(rows.map((row) => row.data))]
  const existing: any[] = []
  for (const part of chunks(dates, 100)) {
    const { data, error } = await db.from("lorean_workdays").select("id,data,turno,importacao_id").eq("unit_id", unitId).in("data", part)
    if (error) throw new Error(error.message); existing.push(...(data ?? []))
  }
  if (existing.some((row) => !row.importacao_id) && !replaceExisting) {
    throw new ImportConflictError(`Já existem ${existing.filter((row) => !row.importacao_id).length} registros de receita nessas datas. Confirme a substituição explicitamente.`)
  }
  if (existing.length) {
    const ids = existing.map((row) => row.id)
    for (const part of chunks(ids, 200)) await db.from("lorean_pagamentos").delete().in("workday_id_fk", part)
    for (const part of chunks(ids, 200)) { const { error } = await db.from("lorean_workdays").delete().in("id", part); if (error) throw new Error(error.message) }
  }
  const workdays = [...unique.values()].map((row) => ({ unit_id: unitId, importacao_id: importId,
    workday_id: 96_000_000_000 + Number(row.data.replaceAll("-", "")) * 10 + (row.turno === "jantar" ? 2 : row.turno === "almoco" ? 1 : 0),
    data: row.data, turno: row.turno, receita_bruta: row.receitaBruta, previsto: row.receitaBruta,
    desconto: Math.max(0, row.receitaBruta - row.receitaLiquida), gorjeta: row.taxaServico, gorjeta_colaborador: row.taxaColaborador,
    gorjeta_casa: row.taxaCasa, gorjeta_terceiro: row.taxaTerceiro, receita_liquida: row.receitaLiquida, clientes: row.clientes,
    ticket_medio: row.clientes ? row.receitaBruta / row.clientes : null, ticket_real: row.clientes ? row.receitaLiquida / row.clientes : null,
    custo: null, lucro: row.receitaLiquida, cmv_pct: null, devedor: 0 }))
  const inserted: any[] = []
  for (const part of chunks(workdays, 100)) {
    const { data, error } = await db.from("lorean_workdays").insert(part).select("id,workday_id")
    if (error) throw new Error(`Receita: ${error.message}`); inserted.push(...(data ?? []))
  }
  const ids = new Map(inserted.map((row) => [String(row.workday_id), row.id]))
  const payments = [...unique.values()].flatMap((row) => {
    const workdayId = 96_000_000_000 + Number(row.data.replaceAll("-", "")) * 10 + (row.turno === "jantar" ? 2 : row.turno === "almoco" ? 1 : 0)
    const id = ids.get(String(workdayId)); if (!id) return []
    return row.pagamentos.map((payment) => ({ workday_id_fk: id, forma: payment.descricao, valor_fechado: payment.valor, valor_recebido: payment.valor }))
  })
  for (const part of chunks(payments, 300)) { const { error } = await db.from("lorean_pagamentos").insert(part); if (error) throw new Error(error.message) }
}
