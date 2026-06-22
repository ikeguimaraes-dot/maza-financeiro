export const runtime = "nodejs"
export const maxDuration = 60

import * as XLSX from "xlsx"
import { createOperationsClient } from "@kph/db/supabase/operations-client"
import { requireUser } from "@kph/auth/server"

// ── helpers ───────────────────────────────────────────────────────────────────

function toDate(v: unknown): string | null {
  if (v == null || v === "") return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().split("T")[0]!
  if (typeof v === "number") return new Date((v - 25569) * 86400 * 1000).toISOString().split("T")[0]!
  if (typeof v === "string") {
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0]!
  }
  return null
}

function toStr(v: unknown): string | null {
  if (v == null || v === "" || v instanceof Date) return null
  const s = String(v).trim()
  return s === "" || s === "NaN" ? null : s
}

function toNum(v: unknown): number | null {
  if (v == null || v === "" || v instanceof Date) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v
  if (typeof v === "number") return v === 1
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "s" || v.toLowerCase() === "true"
  return false
}

function refMes(dateStr: string | null): string | null {
  if (!dateStr || dateStr.length < 7) return null
  return dateStr.slice(0, 7) + "-01"
}

function parseParcela(v: unknown): string | null {
  if (v == null || v === "") return null
  if (v instanceof Date) return String(v.getDate())
  return toStr(v)
}

function parseMes(v: unknown): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().split("T")[0]!
  return toStr(v)
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try { await requireUser() }
  catch { return Response.json({ error: "Não autorizado" }, { status: 401 }) }

  let formData: FormData
  try { formData = await req.formData() }
  catch { return Response.json({ error: "Requisição inválida" }, { status: 400 }) }

  const file = formData.get("file") as File | null
  if (!file) return Response.json({ error: "Arquivo não enviado" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return Response.json({ error: "Planilha sem abas" }, { status: 400 })

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!, { defval: null })
  if (!rows.length) return Response.json({ error: "Nenhuma linha encontrada" }, { status: 400 })

  const db = createOperationsClient()
  if (!db) return Response.json({ error: "Banco indisponível" }, { status: 500 })

  const importadoEm = new Date().toISOString()
  const refMesesSet = new Set<string>()

  const records = rows.map((r) => {
    const dComp = toDate(r["D. Competência"])
    const rm = refMes(dComp)
    if (rm) refMesesSet.add(rm)

    return {
      id:                    crypto.randomUUID(),
      tipo:                  toStr(r["Tipo"]),
      origem:                toStr(r["Origem"]),
      n_nota_fiscal:         toStr(r["N.Nota Fiscal"] != null ? String(Math.round(Number(r["N.Nota Fiscal"]))) : null),
      empresa:               toStr(r["Empresa"] != null ? String(r["Empresa"]) : null),
      fantasia_empresa:      toStr(r["Fantasia Empresa"]),
      fornecedor:            toStr(r["Fornecedor"] != null ? String(r["Fornecedor"]) : null),
      razao_fornecedor:      toStr(r["Razão Fornecedor"]),
      fantasia_fornecedor:   toStr(r["Fantasia Fornecedor"]),
      cnpj_cpf_fornecedor:   toStr(r["CNPJ/CPF Fornecedor"]),
      n_conta:               toStr(r["N. Conta"]),
      t_fornecedor:          toStr(r["T. Fornecedor"]),
      grupo_economico:       toStr(r["Grupo Econômico"] != null ? String(r["Grupo Econômico"]) : null),
      cep:                   toStr(r["CEP"]),
      bairro:                toStr(r["Bairro"]),
      cidade:                toStr(r["Cidade"]),
      uf:                    toStr(r["UF"]),
      pais:                  toStr(r["País"]),
      condicao_compra:       toStr(r["Condição Compra"]),
      prazo_medio:           toNum(r["Prazo Médio"]),
      serie:                 toStr(r["Série"]),
      n_titulo:              toStr(r["N. Título/Provisão"] != null ? String(r["N. Título/Provisão"]) : null),
      parcela:               parseParcela(r["Parcela"]),
      documento:             toStr(r["Documento"] != null ? String(r["Documento"]) : null),
      portador_num:          toStr(r["Portador"] != null ? String(r["Portador"]) : null),
      portador:              toStr(r["Descrição do Portador"]),
      c_gerencial:           toStr(r["C. Gerencial"] != null ? String(r["C. Gerencial"]) : null),
      descricao_c_gerencial: toStr(r["Descrição C. Gerencial"]),
      d_lancamento:          toDate(r["D. Lançamento"]),
      d_competencia:         dComp,
      d_autorizacao_pgto:    toDate(r["D. Autorização Pgto"]),
      d_vencimento:          toDate(r["D. Vencimento"]),
      dia_semana:            toStr(r["Dia Semana"]),
      v_desconto:            toNum(r["V. Desconto"]),
      v_multa_atraso:        toNum(r["V. Multa Atraso"]),
      v_juros_dia:           toNum(r["V. Juros Dia"]),
      v_titulo:              toNum(r["V. Título/Provisão"]),
      v_original:            toNum(r["V. Original"]),
      v_saldo_anterior:      toNum(r["V. Saldo Anterior"]),
      v_credito_periodo:     toNum(r["V. Crédito Período"]),
      v_debito_periodo:      toNum(r["V. Débito Período"]),
      d_liquidacao_periodo:  toDate(r["D. Liquidação Período"]),
      situacao_periodo:      toStr(r["Situação Período"]),
      v_saldo_periodo:       toNum(r["V. Saldo Período"]),
      dias_atraso_periodo:   toNum(r["Dias Atraso Período"]),
      v_atraso_periodo:      toNum(r["V. Atraso Período"]),
      v_atualizado_periodo:  toNum(r["V. Atualizado Período"]),
      d_liquidacao_atual:    toDate(r["D. Liquidação Atual"]),
      situacao_atual:        toStr(r["Situação Atual"]),
      v_saldo_atual:         toNum(r["V. Saldo Atual"]),
      dias_atraso_atual:     toNum(r["Dias Atraso Atual"]),
      v_atraso_atual:        toNum(r["V. Atraso Atual"]),
      v_atualizado_atual:    toNum(r["V. Atualizado Atual"]),
      ano:                   toNum(r["Ano"]),
      mes:                   parseMes(r["Mês"]),
      semana:                toNum(r["Semana"]),
      trimestre:             toNum(r["Trimestre"]),
      quadrimestre:          toNum(r["Quadrimestre"]),
      fluxo_de_caixa:        toBool(r["Fluxo de Caixa"]),
      tipo_sep:              toStr(r["Tipo SEP"] != null ? String(r["Tipo SEP"]) : null),
      ref_mes:               rm,
      importado_em:          importadoEm,
    }
  })

  if (refMesesSet.size > 0) {
    const { error: delErr } = await db.from("titulos_a_pagar").delete().in("ref_mes", [...refMesesSet])
    if (delErr) return Response.json({ error: `Erro ao limpar dados: ${delErr.message}` }, { status: 500 })
  }

  const BATCH = 200
  let inserted = 0
  for (let i = 0; i < records.length; i += BATCH) {
    const { error: insErr } = await db.from("titulos_a_pagar").insert(records.slice(i, i + BATCH) as any)
    if (insErr) return Response.json({ error: `Erro ao inserir lote ${i / BATCH + 1}: ${insErr.message}` }, { status: 500 })
    inserted += Math.min(BATCH, records.length - i)
  }

  return Response.json({ ok: true, inserted, ref_meses: [...refMesesSet] })
}
