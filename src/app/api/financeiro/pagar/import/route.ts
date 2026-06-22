export const runtime = "nodejs"
export const maxDuration = 60

import * as XLSX from "xlsx"
import { createOperationsClient } from "@kph/db/supabase/operations-client"
import { requireUser } from "@kph/auth/server"

// ── helpers ───────────────────────────────────────────────────────────────────

function toDate(v: unknown): string | null {
  if (v == null || v === "") return null
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    return v.toISOString().split("T")[0]!
  }
  if (typeof v === "number") {
    const d = new Date((v - 25569) * 86400 * 1000)
    return d.toISOString().split("T")[0]!
  }
  if (typeof v === "string") {
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0]!
  }
  return null
}

function toStr(v: unknown): string | null {
  if (v == null || v === "") return null
  if (v instanceof Date) return null
  return String(v).trim() || null
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null
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

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    await requireUser()
  } catch {
    return Response.json({ error: "Não autorizado" }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return Response.json({ error: "Requisição inválida" }, { status: 400 })
  }

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

    const parcelaRaw = r["Parcela"]
    let parcela: string | null = null
    if (parcelaRaw instanceof Date) {
      parcela = String(parcelaRaw.getDate())
    } else {
      parcela = toStr(parcelaRaw)
    }

    return {
      tipo:                  toStr(r["Tipo"]),
      n_nota_fiscal:         toStr(r["N.Nota Fiscal"] != null ? String(Math.round(Number(r["N.Nota Fiscal"]))) : null),
      razao_fornecedor:      toStr(r["Razão Fornecedor"]),
      fantasia_fornecedor:   toStr(r["Fantasia Fornecedor"]),
      cnpj_cpf_fornecedor:   toStr(r["CNPJ/CPF Fornecedor"]),
      t_fornecedor:          toStr(r["T. Fornecedor"]),
      descricao_c_gerencial: toStr(r["Descrição C. Gerencial"]),
      n_titulo:              toStr(r["N. Título/Provisão"] != null ? String(r["N. Título/Provisão"]) : null),
      parcela,
      portador:              toStr(r["Descrição do Portador"]),
      d_lancamento:          toDate(r["D. Lançamento"]),
      d_competencia:         dComp,
      d_vencimento:          toDate(r["D. Vencimento"]),
      v_titulo:              toNum(r["V. Título/Provisão"]) ?? toNum(r["V. Original"]),
      v_saldo_atual:         toNum(r["V. Saldo Atual"]),
      dias_atraso_atual:     toNum(r["Dias Atraso Atual"]),
      situacao_atual:        toStr(r["Situação Atual"]),
      fluxo_de_caixa:        toBool(r["Fluxo de Caixa"]),
      ref_mes:               rm,
      importado_em:          importadoEm,
    }
  })

  if (refMesesSet.size > 0) {
    const { error: delErr } = await db
      .from("titulos_a_pagar")
      .delete()
      .in("ref_mes", [...refMesesSet])
    if (delErr) return Response.json({ error: `Erro ao limpar dados anteriores: ${delErr.message}` }, { status: 500 })
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
