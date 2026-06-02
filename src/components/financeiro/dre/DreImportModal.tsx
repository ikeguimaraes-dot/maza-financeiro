"use client"

import { useRef, useState } from "react"
import * as XLSX from "xlsx"
import {
  deleteDreLinhasRealizado,
  deleteDreLinhasOrcado,
  insertDreLinhas,
  deleteDreGorjeta,
  insertDreGorjeta,
  deleteDreReceita,
  insertDreReceita,
  deleteDreMensal,
  insertDreMensal,
  deleteDreKpis,
  insertDreKpis,
  deleteDreIndicadores,
  insertDreIndicadores,
  deleteDreDespesa,
  insertDreDespesa,
  deleteDreFaturamento,
  insertDreFaturamento,
  deleteDreContratos,
  insertDreContratos,
  deleteDreFolha,
  insertDreFolha,
  deleteDrePessoal,
  insertDrePessoal,
  deleteDreManutencao,
  insertDreManutencao,
  deleteDrePrestadores,
  insertDrePrestadores,
  getCurrentUnitId,
} from "@/app/financeiro/dre/actions"
import type {
  DreLinhaInsert,
  DreGorjetaInsert,
  DreReceitaInsert,
  DreMensalInsert,
  DreKpisInsert,
  DreIndicadoresInsert,
  DreDespesaInsert,
  DreFaturamentoInsert,
  DreContratosInsert,
  DreFolhaInsert,
  DrePessoalInsert,
  DreManutencaoInsert,
  DrePrestadoresInsert,
} from "@/app/financeiro/dre/actions"

// ── Lookup maps ────────────────────────────────────────────────────────────────

const GRUPO_MAP: Record<string, string> = {
  "FATURAMENTO":                        "RECEITA",
  "FATURAMENTO Liquido de Gorjeta":     "RECEITA",
  "CUSTOS DOS PRODUTOS VENDIDOS":       "CMV",
  "PESSOAL":                            "PESSOAL",
  "OCUPAÇÃO":                           "OCUPAÇÃO",
  "UTILIDADES/ CONSUMO":                "UTILIDADES",
  "MANUTENÇÃO":                         "MANUTENÇÃO",
  "OPERAÇÃO":                           "OPERAÇÃO",
  "ADMINISTRATIVA":                     "ADMINISTRATIVA",
  "MARKETING":                          "MARKETING",
  "TAXAS CARTÃO DE CRÉDITO":            "TAXAS CARTÃO",
  "DESPESAS FINANCEIRAS":               "DESP. FINANCEIRAS",
  "IMPOSTOS":                           "IMPOSTOS",
}

const DESCRICAO_MAP: Record<string, string> = {
  "Prestação de Serviço Pessoa Jurídica OP":  "PJ Operacional",
  "Prestação de Serviço Pessoa Jurídica ADM": "PJ Administrativo",
  "Prestação de Servço Informatica":          "Prestação de Serviço TI",
  "Serviços de Informatica/TI":              "Prestação de Serviço TI",
  "Correio/Cartório/Protestos":               "Correio/Cartório",
  "Cartório/Protestos":                       "Correio/Cartório",
  "Propaganda, Publicidade e Patrocínio":     "Propaganda e Publicidade",
  "Outras Despesas":                          "Outras Despesas ADM",
  "Retenção de Gorjetas":                     "Retenção de Gorjeta",
  "Outras":                                   "Outras Taxas",
}

const MES_MAP: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4,
  MAI: 5, MAIO: 5,
  JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
}

const MES_NOME = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

const MES_PT: Record<string, number> = {
  janeiro:   1,
  fevereiro: 2,
  março:     3, marco: 3,      // "março" com ç; "marco" sem ç como fallback
  abril:     4,
  maio:      5,
  junho:     6,
  julho:     7,
  agosto:    8,
  setembro:  9,
  outubro:   10,
  novembro:  11,
  dezembro:  12,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function mesAnoLabel(mesAno: string): string {
  const [ano, mes] = mesAno.split("-")
  return `${MES_NOME[Number(mes)] ?? mes}/${ano}`
}

function fmtR(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0,
  }).format(v)
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s || null
}

function normalizeSpaces(s: string): string {
  return s.trim().replace(/\s+/g, " ")
}

// "janeiro 2026" → "2026-1", etc.
// Uses [^\s]+ instead of \w+ so ç/accented chars are captured correctly
function parseMesAno(cell: string): string | null {
  const s = normalizeSpaces(cell).toLowerCase()
  const m = s.match(/^([^\s]+)\s+(\d{4})$/)
  if (!m) return null
  const mes = MES_PT[m[1]!]
  if (!mes) return null
  return `${m[2]}-${mes}`
}

// ── SUB_ITENS (CAPS that are detail rows, not group/calc headers) ──────────────

const SUB_ITENS = new Set(
  [
    "IR/INSS", "FGTS", "DSR",
    "GRATIFICAÇÃO -  INSS", "GRATIFICAÇÃO 13. SALÁRIO",
    "GRATIFICAÇÃO FGTS", "GRATIFICAÇÃO FÉRIAS",
    "IPTU",
    "(-) ICMS", "(-) COFINS", "(-) PIS/Pasep",
    "(-) ISS", "IRPJ", "CSLL",
  ].map(s => normalizeSpaces(s).toUpperCase())
)

// ── MonthCol detection ─────────────────────────────────────────────────────────

interface MonthCol {
  mesAno: string
  colIdx: number
  avIdx: number
}

function detectMonthCols(headerRow: unknown[]): MonthCol[] {
  const cols: MonthCol[] = []
  for (let i = 0; i < headerRow.length; i++) {
    const cell = toStr(headerRow[i])
    if (!cell) continue
    const m = cell.match(/^(JAN|FEV|MAR|ABR|MAIO?|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})$/)
    if (m) {
      const mesNum = MES_MAP[m[1]!]
      const year   = m[2]!
      if (mesNum !== undefined) cols.push({ mesAno: `${year}-${mesNum}`, colIdx: i, avIdx: -1 })
    }
  }
  const monthIdxSet = new Set(cols.map(c => c.colIdx))
  for (const col of cols) {
    if (!monthIdxSet.has(col.colIdx + 1)) col.avIdx = col.colIdx + 1
  }
  return cols
}

// Month cols for gorjeta: accepts "JAN 2026" or bare "JAN" (defaults to defaultYear)
interface SimpleMonthCol { mesAno: string; colIdx: number }

function detectGorjetaMonthCols(headerRow: unknown[], defaultYear: number): SimpleMonthCol[] {
  const cols: SimpleMonthCol[] = []
  for (let i = 0; i < headerRow.length; i++) {
    const cell = toStr(headerRow[i])
    if (!cell) continue
    const trimmed = normalizeSpaces(cell).toUpperCase()
    const m2 = trimmed.match(/^(JAN|FEV|MAR|ABR|MAIO?|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})$/)
    if (m2) {
      const mesNum = MES_MAP[m2[1]!]
      if (mesNum !== undefined) cols.push({ mesAno: `${m2[2]}-${mesNum}`, colIdx: i })
      continue
    }
    const m1 = trimmed.match(/^(JAN|FEV|MAR|ABR|MAIO?|JUN|JUL|AGO|SET|OUT|NOV|DEZ)$/)
    if (m1) {
      const mesNum = MES_MAP[m1[1]!]
      if (mesNum !== undefined) cols.push({ mesAno: `${defaultYear}-${mesNum}`, colIdx: i })
    }
  }
  return cols
}

// ── Parse results & reconciliation types ──────────────────────────────────────

type TotaisDeclarados = Map<string, Map<string, number>>

interface ParseResult {
  rows: DreLinhaInsert[]
  totaisDeclarados: TotaisDeclarados
}

interface ReconciliationItem {
  grupo: string
  declarado: number
  capturado: number
  diferenca: number
  ok: boolean
}

interface GorjetaReconItem {
  mesAno: string
  recebida: number
  paga: number
  retencaoCalc: number
  retencaoDecl: number
  ok: boolean
}

interface ReceitaReconItem {
  mesAno: string
  totalDRE: number
  totalReceita: number
  diferenca: number
  ok: boolean
}

interface GorjetaParseResult {
  rows: DreGorjetaInsert[]
  recon: GorjetaReconItem[]
  missing: boolean
  parseError?: string
}

interface ReceitaParseResult {
  rows: DreReceitaInsert[]
  somaByMes: Map<string, number>
  missing: boolean
  parseError?: string
}

interface KpisParseResult {
  rows: DreKpisInsert[]
  clientesPorMes: Map<string, number>
  ticketPorMes: Map<string, number>
}

interface ReviewData {
  realizadoRows: DreLinhaInsert[]
  orcadoRows: DreLinhaInsert[]
  gorjetaRows: DreGorjetaInsert[]
  receitaRows: DreReceitaInsert[]
  mensalRows: DreMensalInsert[]
  kpisRows: DreKpisInsert[]
  indicadoresRows: DreIndicadoresInsert[]
  despesaRows: DreDespesaInsert[]
  faturamentoRows: DreFaturamentoInsert[]
  contratosRows: DreContratosInsert[]
  folhaRows: DreFolhaInsert[]
  pessoalRows: DrePessoalInsert[]
  manutencaoRows: DreManutencaoInsert[]
  prestadoresRows: DrePrestadoresInsert[]
  reconciliation: ReconciliationItem[]
  gorjetaRecon: GorjetaReconItem[]
  receitaRecon: ReceitaReconItem[]
  latestMonth: string
  descricoes: string[]
  gorjetaMissing: boolean
  gorjetaError?: string
  receitaMissing: boolean
  receitaError?: string
}

// ── parseSheet (realizado / orçado) ───────────────────────────────────────────

function parseSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  tipo: "realizado" | "orcado",
  unitId: string
): ParseResult {
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Aba '${sheetName}' não encontrada no arquivo.`)

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })

  let headerRowIdx = -1
  let monthCols: MonthCol[] = []
  let descColIdx = -1
  let contaColIdx = -1

  for (let i = 0; i < Math.min(raw.length, 15); i++) {
    const row = (raw[i] ?? []) as unknown[]
    const cols = detectMonthCols(row)
    if (cols.length >= 1) {
      headerRowIdx = i
      monthCols = cols
      for (let j = 0; j < row.length; j++) {
        const v = toStr(row[j])
        if (!v) continue
        const up = v.toUpperCase()
        if (up === "DESCRIÇÃO" || up === "DESCRICAO") descColIdx = j
        else if (up === "CONTA") contaColIdx = j
      }
      break
    }
  }

  if (monthCols.length === 0) throw new Error(`Nenhuma coluna de mês na aba '${sheetName}'.`)
  if (descColIdx  === -1) descColIdx  = monthCols[0]!.colIdx - 2
  if (contaColIdx === -1) contaColIdx = monthCols[0]!.colIdx - 1

  const byMonth = new Map<string, DreLinhaInsert[]>()
  for (const mc of monthCols) byMonth.set(mc.mesAno, [])

  const totaisDeclarados: TotaisDeclarados = new Map()
  let currentGrupo: string | null = null

  for (let rowIdx = headerRowIdx + 1; rowIdx < raw.length; rowIdx++) {
    const row = (raw[rowIdx] ?? []) as unknown[]
    const descRaw = toStr(row[descColIdx])
    if (!descRaw) continue
    const desc = descRaw.trim()

    if (desc in GRUPO_MAP) {
      currentGrupo = GRUPO_MAP[desc]!
      for (const mc of monthCols) {
        const val = toNum(row[mc.colIdx])
        if (val === null) continue
        if (!totaisDeclarados.has(mc.mesAno)) totaisDeclarados.set(mc.mesAno, new Map())
        const gm = totaisDeclarados.get(mc.mesAno)!
        gm.set(currentGrupo, (gm.get(currentGrupo) ?? 0) + val)
      }
      continue
    }

    if (desc === desc.toUpperCase() && /\p{L}/u.test(desc)) {
      if (!SUB_ITENS.has(normalizeSpaces(desc).toUpperCase())) currentGrupo = null
    }

    if (!currentGrupo) continue

    const contaRaw = toStr(row[contaColIdx])
    const conta = contaRaw && !contaRaw.startsWith("x.x.") ? contaRaw : null
    const descBanco = DESCRICAO_MAP[desc] ?? desc

    for (const mc of monthCols) {
      const val = toNum(row[mc.colIdx])
      if (val === null) continue
      byMonth.get(mc.mesAno)!.push({
        unit_id: unitId, mes_ano: mc.mesAno, tipo,
        grupo: currentGrupo, descricao: descBanco, conta,
        valor: val,
        av_percentual: mc.avIdx >= 0 ? toNum(row[mc.avIdx]) : null,
        custo_tipo: null,
      })
    }
  }

  const rows: DreLinhaInsert[] = []
  for (const [mesAno, monthRows] of byMonth) {
    if (tipo === "realizado") {
      const nonZero = monthRows.filter(r => r.valor !== null && r.valor !== 0).length
      if (nonZero < 10) { totaisDeclarados.delete(mesAno); continue }
    }
    rows.push(...monthRows)
  }

  return { rows, totaisDeclarados }
}

// ── parseGorjeta ──────────────────────────────────────────────────────────────

const GORJETA_LABELS = [
  "GORJETA RECEBIDA",
  "GORJETA PAGA",
  "RETENÇÃO",
  "FÉRIAS",
  "13º",
  "FGTS",
  "INSS",
  "TOTAL",
] as const
type GorjetaLabel = typeof GORJETA_LABELS[number]

function parseGorjeta(wb: XLSX.WorkBook, unitId: string): GorjetaParseResult {
  if (!wb.Sheets["Base Gorjeta"]) return { rows: [], recon: [], missing: true }

  try {
    const ws = wb.Sheets["Base Gorjeta"]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })

    const MONTH_ABBREVS = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"]
    const MONTH_NUM: Record<string, number> = {
      JAN:1, FEV:2, MAR:3, ABR:4, MAI:5, JUN:6,
      JUL:7, AGO:8, SET:9, OUT:10, NOV:11, DEZ:12,
    }

    // Find the row that has ≥ 3 cells whose text starts with a month abbreviation
    const monthRow = (raw as unknown[][]).find(r =>
      r.filter(cell =>
        typeof cell === "string" &&
        MONTH_ABBREVS.some(m => (cell as string).toUpperCase().startsWith(m))
      ).length >= 3
    )
    if (!monthRow) throw new Error("Linha de meses não encontrada na aba 'Base Gorjeta'.")

    const monthCols: SimpleMonthCol[] = []
    monthRow.forEach((cell, idx) => {
      if (typeof cell !== "string") return
      const abbrev = MONTH_ABBREVS.find(m => (cell as string).toUpperCase().startsWith(m))
      if (!abbrev) return
      const mesNum = MONTH_NUM[abbrev]!
      if (mesNum <= 4) {  // only Jan–Abr (realizado)
        monthCols.push({ colIdx: idx, mesAno: `2026-${mesNum}` })
      }
    })
    if (monthCols.length === 0) throw new Error("Nenhum mês Jan–Abr encontrado na linha de cabeçalho.")

    const headerRowIdx = raw.indexOf(monthRow as unknown[])

    // Labels are in col index 1 of each row (confirmed by debug)
    const LABEL_COL = 1
    const labelRowIdx = new Map<GorjetaLabel, number>()

    for (let rowIdx = headerRowIdx + 1; rowIdx < raw.length; rowIdx++) {
      const row = (raw[rowIdx] ?? []) as unknown[]
      const cell = toStr(row[LABEL_COL])
      if (!cell) continue
      const norm = normalizeSpaces(cell).toUpperCase()

      for (const label of GORJETA_LABELS) {
        if (labelRowIdx.has(label)) continue
        const matches =
          label === "TOTAL" ? norm === "TOTAL" :
          label === "13º"   ? norm.includes("13") :
          norm.includes(label)

        if (matches) {
          if (label === "FÉRIAS" || label === "TOTAL") {
            const hasPos = monthCols.some(mc => {
              const v = toNum(row[mc.colIdx])
              return v !== null && v > 0
            })
            if (!hasPos) continue
          }
          labelRowIdx.set(label, rowIdx)
        }
      }
      if (labelRowIdx.size >= GORJETA_LABELS.length) break
    }

    const getVal = (label: GorjetaLabel, colIdx: number): number | null => {
      const ri = labelRowIdx.get(label)
      if (ri === undefined) return null
      return toNum(((raw[ri] ?? []) as unknown[])[colIdx])
    }

    const rows: DreGorjetaInsert[] = []
    const recon: GorjetaReconItem[] = []

    for (const mc of monthCols) {
      const recebida = getVal("GORJETA RECEBIDA", mc.colIdx)
      if (recebida === null || recebida === 0) continue

      const paga        = getVal("GORJETA PAGA", mc.colIdx)
      const retencaoDecl = getVal("RETENÇÃO", mc.colIdx)

      rows.push({
        unit_id: unitId,
        mes_ano: mc.mesAno,
        gorjeta_recebida: recebida,
        gorjeta_paga:     paga,
        retencao:         retencaoDecl,
        ferias:           getVal("FÉRIAS", mc.colIdx),
        decimo_terceiro:  getVal("13º", mc.colIdx),
        fgts:             getVal("FGTS", mc.colIdx),
        inss:             getVal("INSS", mc.colIdx),
        encargos_total:   getVal("TOTAL", mc.colIdx),
      })

      if (paga !== null && retencaoDecl !== null) {
        const retencaoCalc = recebida - paga
        recon.push({
          mesAno: mc.mesAno,
          recebida, paga,
          retencaoCalc,
          retencaoDecl,
          ok: Math.abs(retencaoCalc - retencaoDecl) <= 1,
        })
      }
    }

    return { rows, recon, missing: false }
  } catch (e) {
    return { rows: [], recon: [], missing: false, parseError: String(e) }
  }
}

// ── parseReceita ──────────────────────────────────────────────────────────────

function parseReceita(wb: XLSX.WorkBook, unitId: string): ReceitaParseResult {
  if (!wb.Sheets["B.Receita"]) return { rows: [], somaByMes: new Map(), missing: true }

  try {
    const ws = wb.Sheets["B.Receita"]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })

    let headerRowIdx = -1
    let bandeiraCol = -1, valorCol = -1, classCol = -1, grupoCol = -1, mesCol = -1

    for (let i = 0; i < Math.min(raw.length, 5); i++) {
      const row = (raw[i] ?? []) as unknown[]
      let found = false
      for (let j = 0; j < row.length; j++) {
        const v = toStr(row[j])
        if (!v) continue
        const up = normalizeSpaces(v).toUpperCase()
        if      (up === "BANDEIRA")                              { bandeiraCol = j; found = true }
        else if (up === "VALOR")                                  valorCol    = j
        else if (up === "CLASSIFICAÇÃO" || up === "CLASSIFICACAO") classCol   = j
        else if (up === "GRUPO")                                  grupoCol    = j
        else if (up.includes("PAGTO"))                            mesCol      = j
      }
      if (found) { headerRowIdx = i; break }
    }

    if (headerRowIdx === -1 || valorCol === -1 || mesCol === -1) {
      throw new Error("Aba 'B.Receita': colunas BANDEIRA, VALOR ou MÊS PAGTO não encontradas.")
    }

    const aggMap = new Map<string, DreReceitaInsert>()

    for (let rowIdx = headerRowIdx + 1; rowIdx < raw.length; rowIdx++) {
      const row = (raw[rowIdx] ?? []) as unknown[]
      const mesCell = toStr(row[mesCol])
      if (!mesCell) continue
      const mesAno = parseMesAno(mesCell)
      if (!mesAno) continue

      const valor = toNum(row[valorCol])
      if (valor === null) continue

      const bandeira      = bandeiraCol >= 0 ? toStr(row[bandeiraCol]) : null
      const classificacao = classCol    >= 0 ? toStr(row[classCol])    : null
      const grupo         = grupoCol    >= 0 ? toStr(row[grupoCol])    : null

      const key = `${mesAno}||${bandeira ?? ""}||${classificacao ?? ""}||${grupo ?? ""}`
      if (aggMap.has(key)) {
        aggMap.get(key)!.valor += valor
      } else {
        aggMap.set(key, { unit_id: unitId, mes_ano: mesAno, bandeira, classificacao, grupo, valor })
      }
    }

    const rows = [...aggMap.values()]
    const somaByMes = new Map<string, number>()
    for (const r of rows) somaByMes.set(r.mes_ano, (somaByMes.get(r.mes_ano) ?? 0) + r.valor)

    return { rows, somaByMes, missing: false }
  } catch (e) {
    return { rows: [], somaByMes: new Map(), missing: false, parseError: String(e) }
  }
}

// ── Reconciliation builders ────────────────────────────────────────────────────

function buildDreReconciliation(
  rows: DreLinhaInsert[],
  totaisDeclarados: TotaisDeclarados,
  latestMonth: string
): ReconciliationItem[] {
  const capturado = new Map<string, number>()
  for (const r of rows) {
    if (r.mes_ano !== latestMonth) continue
    capturado.set(r.grupo, (capturado.get(r.grupo) ?? 0) + (r.valor ?? 0))
  }
  const declMes = totaisDeclarados.get(latestMonth) ?? new Map<string, number>()
  const grupos = new Set([...declMes.keys(), ...capturado.keys()])
  return [...grupos].map(grupo => {
    const decl = declMes.get(grupo) ?? 0
    const capt = capturado.get(grupo) ?? 0
    const diff = decl - capt
    return { grupo, declarado: decl, capturado: capt, diferenca: diff, ok: Math.abs(diff) <= 1 }
  }).sort((a, b) => a.grupo.localeCompare(b.grupo))
}

function buildReceitaReconciliation(
  realizadoRows: DreLinhaInsert[],
  somaByMes: Map<string, number>
): ReceitaReconItem[] {
  const receitaDRE = new Map<string, number>()
  for (const r of realizadoRows) {
    if (r.grupo !== "RECEITA") continue
    receitaDRE.set(r.mes_ano, (receitaDRE.get(r.mes_ano) ?? 0) + (r.valor ?? 0))
  }
  return [...somaByMes.entries()].map(([mesAno, totalReceita]) => {
    const totalDRE = receitaDRE.get(mesAno) ?? 0
    const diferenca = totalDRE - totalReceita
    return { mesAno, totalDRE, totalReceita, diferenca, ok: Math.abs(diferenca) <= 1 }
  }).sort((a, b) => a.mesAno.localeCompare(b.mesAno))
}

// ── deriveDreMensal ───────────────────────────────────────────────────────────

function deriveDreMensal(
  realizadoTotais: TotaisDeclarados,
  orcadoTotais: TotaisDeclarados,
  clientesPorMes: Map<string, number>,
  ticketPorMes: Map<string, number>,
  unitId: string
): DreMensalInsert[] {
  const result: DreMensalInsert[] = []

  const processType = (totais: TotaisDeclarados, tipo: "realizado" | "orcado") => {
    for (const [mesAno, grupoMap] of totais) {
      if (grupoMap.size === 0) continue
      const g = (grupo: string) => grupoMap.get(grupo) ?? 0

      const receita_bruta  = g("RECEITA")
      const cmv            = g("CMV")
      const pessoal        = g("PESSOAL")
      const ocupacao       = g("OCUPAÇÃO")
      const utilidades     = g("UTILIDADES")
      const operacao       = g("OPERAÇÃO")
      const manutencao     = g("MANUTENÇÃO")
      const administrativa = g("ADMINISTRATIVA")
      const marketing      = g("MARKETING")
      const taxa_cartao    = g("TAXAS CARTÃO")
      const impostos       = g("IMPOSTOS")
      const desp_fin       = g("DESP. FINANCEIRAS")

      // Cost groups come as negative values; summing gives EBITDA
      const ebitda = receita_bruta + impostos + cmv + pessoal +
        ocupacao + utilidades + operacao + manutencao +
        administrativa + marketing + taxa_cartao

      result.push({
        unit_id: unitId, mes_ano: mesAno, tipo,
        receita_bruta, cmv, pessoal, ocupacao, utilidades,
        operacao, manutencao, administrativa, marketing,
        taxa_cartao, impostos, ebitda,
        resultado_liquido: ebitda + desp_fin,
        clientes:     tipo === "realizado" ? (clientesPorMes.get(mesAno) ?? null) : null,
        ticket_medio: tipo === "realizado" ? (ticketPorMes.get(mesAno) ?? null) : null,
      })
    }
  }

  processType(realizadoTotais, "realizado")
  processType(orcadoTotais, "orcado")
  return result
}

// ── parseKpis ─────────────────────────────────────────────────────────────────

function parseKpis(
  wb: XLSX.WorkBook,
  realizadoRows: DreLinhaInsert[],
  gorjetaRows: DreGorjetaInsert[],
  unitId: string
): KpisParseResult {
  const clientesPorMes = new Map<string, number>()
  const ticketPorMes   = new Map<string, number>()

  try {
    const ws = wb.Sheets["Base Realizado"]
    if (ws) {
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })

      // Re-find header row and descColIdx (same logic as parseSheet)
      let headerRowIdx = -1
      let monthCols: MonthCol[] = []
      let descColIdx = -1

      for (let i = 0; i < Math.min(raw.length, 15); i++) {
        const row = (raw[i] ?? []) as unknown[]
        const cols = detectMonthCols(row)
        if (cols.length >= 1) {
          headerRowIdx = i; monthCols = cols
          for (let j = 0; j < row.length; j++) {
            const v = toStr(row[j])
            if (!v) continue
            const up = v.toUpperCase()
            if (up === "DESCRIÇÃO" || up === "DESCRICAO") descColIdx = j
          }
          break
        }
      }
      if (descColIdx === -1 && monthCols.length > 0) descColIdx = monthCols[0]!.colIdx - 2

      // Scan rows before first group header for CLIENTES / TICKET MEDIO
      if (headerRowIdx >= 0 && descColIdx >= 0) {
        for (let rowIdx = headerRowIdx + 1; rowIdx < raw.length; rowIdx++) {
          const row = (raw[rowIdx] ?? []) as unknown[]
          const descRaw = toStr(row[descColIdx])
          if (!descRaw) continue
          if (descRaw.trim() in GRUPO_MAP) break  // reached first group
          const norm = normalizeSpaces(descRaw).toUpperCase()
          if (norm.includes("CLIENTES")) {
            for (const mc of monthCols) {
              const v = toNum(row[mc.colIdx]); if (v !== null) clientesPorMes.set(mc.mesAno, v)
            }
          } else if (norm.includes("TICKET")) {
            for (const mc of monthCols) {
              const v = toNum(row[mc.colIdx]); if (v !== null) ticketPorMes.set(mc.mesAno, v)
            }
          }
        }
      }
    }
  } catch { /* sheet missing or parse error — continue with empty maps */ }

  const gorjetaPorMes = new Map(gorjetaRows.map(g => [g.mes_ano, g.gorjeta_recebida ?? null]))
  const impostosRows  = realizadoRows.filter(r => r.grupo === "IMPOSTOS")

  const getImposto = (prefix: string, mes: string): number | null =>
    impostosRows.find(r =>
      r.mes_ano === mes && normalizeSpaces(r.descricao).toUpperCase().startsWith(prefix)
    )?.valor ?? null

  const meses = [...new Set(realizadoRows.map(r => r.mes_ano))].sort()

  return {
    rows: meses.map(mes => ({
      unit_id: unitId,
      mes_ano: mes,
      clientes:           clientesPorMes.get(mes) ?? null,
      ticket_medio:       ticketPorMes.get(mes)   ?? null,
      gorjetas_recebidas: gorjetaPorMes.get(mes)  ?? null,
      icms:   getImposto("(-) ICMS",   mes),
      cofins: getImposto("(-) COFINS", mes),
      pis:    getImposto("(-) PIS",    mes),
      iss:    getImposto("(-) ISS",    mes),
    })),
    clientesPorMes,
    ticketPorMes,
  }
}

// ── parseIndicadores ──────────────────────────────────────────────────────────

const INDIC_SLUG: Record<string, string> = {
  "CMV":                  "cmv",
  "PESSOAL":              "pessoal",
  "OCUPAÇÃO":             "ocupacao",
  "UTILIDADES/ CONSUMO":  "utilidades",
  "UTILIDADES":           "utilidades",
  "OPERAÇÃO":             "operacao",
  "MANUTENÇÃO E CONSERV": "manutencao",
  "MANUTENÇÃO":           "manutencao",
  "ADMINISTRATIVA":       "administrativa",
  "MARKETING":            "marketing",
  "TX CARTÕES":           "taxa_cartao",
  "TAXAS CARTÃO":         "taxa_cartao",
  "EBITDA":               "ebitda",
  "RESULTADO LÍQUIDO":    "resultado_liquido",
  "RESULTADO":            "resultado_liquido",
}

function resolveIndicSlug(label: string): string | null {
  const upper = normalizeSpaces(label).toUpperCase()
  for (const key of Object.keys(INDIC_SLUG)) {
    if (upper.startsWith(key.toUpperCase())) return INDIC_SLUG[key]!
  }
  return null
}

function parseIndicadores(wb: XLSX.WorkBook, unitId: string): DreIndicadoresInsert[] {
  const sheetName = " 01-INDIC"
  if (!wb.Sheets[sheetName]) return []

  try {
    const ws  = wb.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })

    interface IndicCol { colIdx: number; tipo: "realizado" | "orcado"; mesAno: string }
    let headerRowIdx = -1
    let indicCols: IndicCol[] = []

    for (let i = 0; i < Math.min(raw.length, 10); i++) {
      const row = (raw[i] ?? []) as unknown[]
      const cols: IndicCol[] = []
      for (let j = 0; j < row.length; j++) {
        const cell = toStr(row[j])
        if (!cell) continue
        // Match "BD JAN.26" or "REAL JAN.26"
        const m = normalizeSpaces(cell).toUpperCase().match(/^(BD|REAL)\s+([A-Z]{3})[.\s](\d{2})$/)
        if (!m) continue
        const tipo: "realizado" | "orcado" = m[1] === "REAL" ? "realizado" : "orcado"
        const mesNum = MES_MAP[m[2]!]
        if (!mesNum) continue
        cols.push({ colIdx: j, tipo, mesAno: `20${m[3]}-${mesNum}` })
      }
      if (cols.length >= 2) { headerRowIdx = i; indicCols = cols; break }
    }
    if (indicCols.length === 0) return []

    const result: DreIndicadoresInsert[] = []
    for (let rowIdx = headerRowIdx + 1; rowIdx < raw.length; rowIdx++) {
      const row = (raw[rowIdx] ?? []) as unknown[]
      const labelCell = toStr(row[1])
      if (!labelCell) continue
      const slug = resolveIndicSlug(labelCell)
      if (!slug) continue
      for (const ic of indicCols) {
        const cellValue = row[ic.colIdx]
        const valor = typeof cellValue === "number"
          ? cellValue * 100
          : parseFloat(String(cellValue)) * 100
        result.push({ unit_id: unitId, mes_ano: ic.mesAno, tipo: ic.tipo, indicador: slug, valor: isFinite(valor) ? valor : null })
      }
    }

    const seen = new Set<string>()
    return result.filter(r => {
      const key = `${r.mes_ano}|${r.tipo}|${r.indicador}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  } catch {
    return []
  }
}

// ── parseDespesa ──────────────────────────────────────────────────────────────

const CATEG_DRE: Record<string, string> = {
  "BEBIDAS ALCOOLICAS":"CMV","BEBIDAS NAO ALCOOLICAS":"CMV",
  "CARNES E AVES":"CMV","CARVAO":"CMV","CERVEJA":"CMV",
  "ENLATADOS E CONSERVAS":"CMV","FRIOS E CONGELADOS":"CMV",
  "GELO":"CMV","HORTIFRUTI":"CMV","LATICINIOS / OVOS":"CMV",
  "PAES, MASSAS E SALGADOS":"CMV","PESCADOS":"CMV",
  "SECOS - MERCEARIA":"CMV",
  "ALIMENTACAO FUNCIONARIOS":"PESSOAL","FERIAS":"PESSOAL",
  "FGTS":"PESSOAL","SALARIOS":"PESSOAL",
  "RESCISOES TRABALHISTAS":"PESSOAL","PLANO DE SAUDE":"PESSOAL",
  "VALE TRANSPORTE":"PESSOAL","VALE COMBUSTIVEL":"PESSOAL",
  "UNIFORMES":"PESSOAL","SEGURO DE VIDA":"PESSOAL",
  "GORJETAS PAGAS":"PESSOAL","GORJETA ADIANTAMENTO":"PESSOAL",
  "EXTRAS MEET":"PESSOAL","EXAMES MEDICOS":"PESSOAL",
  "GRRF - GUIA RECOLHIMENTO RESCISORIO FGTS":"PESSOAL",
  "CURSOS E TREINAMENTOS / DESENVOLVIMENTO DE PESSOAS":"PESSOAL",
  "BONIFICAÇÃO":"PESSOAL","MAO DE OBRA - PJ":"PESSOAL",
  "IPTU":"OCUPAÇÃO","LOCACAO DE IMOVEL":"OCUPAÇÃO",
  "AGUA E ESGOTO":"UTILIDADES","ENERGIA ELETRICA":"UTILIDADES",
  "GAS":"UTILIDADES","TELEFONE E INTERNET":"UTILIDADES",
  "CONSULTORIA OPERACIONAL":"OPERAÇÃO","DEDETIZACAO":"OPERAÇÃO",
  "DESPESA COM SEGURANÇA":"OPERAÇÃO","DESPESA COM SEGURO":"OPERAÇÃO",
  "EMBALAGENS":"OPERAÇÃO","HOSTESS":"OPERAÇÃO",
  "COLETA DE LIXO":"OPERAÇÃO","LIMPEZA E CONSERVACAO":"OPERAÇÃO",
  "LOCACAO DE ENXOVAL":"OPERAÇÃO","LOCAÇÃO DE ESPAÇO":"OPERAÇÃO",
  "LOCACAO DE EQUIPAMENTOS":"OPERAÇÃO",
  "MATERIAL DE HIGIENE":"OPERAÇÃO","MATERIAL DE LIMPEZA":"OPERAÇÃO",
  "MATERIAL DE USO E CONSUMO":"OPERAÇÃO","NUTRICIONISTA":"OPERAÇÃO",
  "OUTROS UTENSILIOS":"OPERAÇÃO","SISTEMA E SOFTWARE OP":"OPERAÇÃO",
  "AUDIO E VISUAL":"OPERAÇÃO","SONORIZACAO / AMBIENTACAO":"OPERAÇÃO",
  "MANUTENCAO DE EQUIPAMENTOS":"MANUTENÇÃO",
  "MANUTENCAO PREDIAL":"MANUTENÇÃO","DECORACAO":"MANUTENÇÃO",
  "MATERIAIS DE CONSTRUCAO E REPAROS":"MANUTENÇÃO",
  "REFORMAS E MANUTENCAO":"MANUTENÇÃO",
  "CONTABILIDADE":"ADMINISTRATIVA","HONORARIOS":"ADMINISTRATIVA",
  "MATERIAL DE ESCRITORIO":"ADMINISTRATIVA",
  "SERVICOS ADMINISTRATIVOS":"ADMINISTRATIVA",
  "SERVICO TI":"ADMINISTRATIVA","SISTEMA E SOFTWARE ADM":"ADMINISTRATIVA",
  "CORREIOS":"ADMINISTRATIVA","DESPESAS JUDICIAIS":"ADMINISTRATIVA",
  "TRANSPORTE / FRETE":"ADMINISTRATIVA",
  "AVALIACAO DE MERCADO":"ADMINISTRATIVA",
  "PRESTADORES DE SERVIÇO PJ ADM":"ADMINISTRATIVA",
  "Prestação de Servço Informatica":"ADMINISTRATIVA",
  "INFLUENCER":"MARKETING","MIDIA":"MARKETING",
  "PROMOTER / RP":"MARKETING","AGENCIA PUBLICIDADE":"MARKETING",
  "ASSESSORIA DE IMPRENSA":"MARKETING",
  "TAXA ANTECIPACAO RECEBIVEIS":"TAXAS CARTÃO",
  "TAXA ADMINISTRATIVA":"TAXAS CARTÃO",
  "COMISSAO S/ VENDAS":"TAXAS CARTÃO",
  "TARIFAS BANCARIAS":"TAXAS CARTÃO",
  "MULTA E JUROS":"DESP. FINANCEIRAS",
  "IOF":"DESP. FINANCEIRAS","EMPRESTIMOS":"DESP. FINANCEIRAS",
  "ICMS":"IMPOSTOS","COFINS":"IMPOSTOS","PIS":"IMPOSTOS",
  "IRRF":"PESSOAL","INSS":"PESSOAL","CSRF":"PESSOAL",
}

function excelDateToISO(v: unknown): string | null {
  if (v instanceof Date) {
    const y = v.getFullYear()
    const mo = String(v.getMonth() + 1).padStart(2, "0")
    const d  = String(v.getDate()).padStart(2, "0")
    return `${y}-${mo}-${d}`
  }
  if (typeof v === "number") {
    const info = XLSX.SSF.parse_date_code(v)
    if (!info) return null
    return `${info.y}-${String(info.m).padStart(2, "0")}-${String(info.d).padStart(2, "0")}`
  }
  if (typeof v === "string") {
    const parts = v.trim().split("/")
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  }
  return null
}

function parseDespesa(wb: XLSX.WorkBook, unitId: string): DreDespesaInsert[] {
  const sheetName = "B. Despesa"
  if (!wb.Sheets[sheetName]) return []
  try {
    const ws = wb.Sheets[sheetName]
    ws["!ref"] = "A1:I3241"
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true })
    const result: DreDespesaInsert[] = []
    for (let i = 1; i < raw.length; i++) {
      const row = (raw[i] ?? []) as unknown[]
      const valor = toNum(row[7])
      if (valor === null || valor === 0) continue
      const mesAnoRaw = toStr(row[8])
      const mes_ano = mesAnoRaw ? (parseMesAno(mesAnoRaw) ?? mesAnoRaw) : null
      if (!mes_ano) continue
      const categoria = toStr(row[6])
      const catUpper = (categoria ?? "").toUpperCase().trim()
      const classificacao = CATEG_DRE[catUpper] ?? CATEG_DRE[categoria ?? ""] ?? null
      result.push({
        unit_id: unitId,
        mes_ano,
        data_competencia: excelDateToISO(row[0]),
        descricao: toStr(row[3]),
        categoria,
        valor,
        tipo_despesa: toStr(row[5]),
        classificacao_dre: classificacao,
      })
    }
    return result
  } catch {
    return []
  }
}

// ── parseFaturamento ──────────────────────────────────────────────────────────

const MES_NOMES_FAT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3,
  abril: 4, maio: 5, junho: 6, julho: 7,
  agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}

function parseFaturamento(wb: XLSX.WorkBook, unitId: string): DreFaturamentoInsert[] {
  const sheetName = "Base Faturamento"
  if (!wb.Sheets[sheetName]) return []
  try {
    const ws  = wb.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true })
    const result: DreFaturamentoInsert[] = []
    // data rows: index 5–16 (Janeiro=5 … Dezembro=16), skip index 17 (Total)
    for (let i = 5; i <= 16; i++) {
      const row = (raw[i] ?? []) as unknown[]
      const nomeMes = toStr(row[0])
      if (!nomeMes) continue
      const mes_num = MES_NOMES_FAT[nomeMes.toLowerCase().trim()]
      if (!mes_num) continue
      result.push({
        unit_id: unitId,
        mes_num,
        categoria: "restaurante",
        rec_2022:    toNum(row[1]),
        rec_2023:    toNum(row[2]),
        rec_2024:    toNum(row[4]),
        rec_2025:    toNum(row[6]),
        rec_2026_bd: toNum(row[8]),
        clientes_bd: (() => { const v = row[10]; return typeof v === "number" ? Math.round(v) : null })(),
        ticket_bd:   toNum(row[11]),
      })
    }
    return result
  } catch {
    return []
  }
}

// ── parseContratos ────────────────────────────────────────────────────────────

function parseContratos(wb: XLSX.WorkBook, unitId: string): DreContratosInsert[] {
  const sheetName = "Serv"
  if (!wb.Sheets[sheetName]) return []
  try {
    const ws  = wb.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true })
    const result: DreContratosInsert[] = []
    // headers at index 3, data from index 6
    for (let i = 6; i < raw.length; i++) {
      const row = (raw[i] ?? []) as unknown[]
      const razao_social = toStr(row[0])
      const valor_mensal = toNum(row[2])
      if (!razao_social || valor_mensal === null) continue
      result.push({
        unit_id: unitId,
        razao_social,
        descricao:       toStr(row[1]),
        valor_mensal,
        codigo_contabil: toStr(row[3]),
        tipo:            toStr(row[4]),
      })
    }
    return result
  } catch {
    return []
  }
}

// ── parseFolha ────────────────────────────────────────────────────────────────

function parseFolha(wb: XLSX.WorkBook, unitId: string): DreFolhaInsert[] {
  const sheetName = "Base Folha"
  if (!wb.Sheets[sheetName]) return []
  try {
    const ws  = wb.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true })
    const result: DreFolhaInsert[] = []
    // data from row index 4 (r5 in Excel)
    // sheet starts at col B → SheetJS index 0 = col B
    for (let i = 4; i < raw.length; i++) {
      const row = (raw[i] ?? []) as unknown[]
      const tipo = typeof row[0] === "string" ? row[0].trim() : null
      if (!tipo) continue
      const nomeRaw = toStr(row[1])
      if (!nomeRaw) continue
      const salario = toNum(row[6]) ?? 0
      if (salario <= 0) continue
      const custoRaw = toNum(row[25])
      const custo_total = (custoRaw !== null && isFinite(custoRaw)) ? custoRaw : salario
      const is_vaga = nomeRaw.toLowerCase().includes("vaga")
      result.push({
        unit_id: unitId,
        tipo,
        nome:     nomeRaw,
        funcao:   toStr(row[2]),
        divisao:  toStr(row[3]),
        admissao: excelDateToISO(row[4]),
        salario,
        custo_total,
        is_vaga,
      })
    }
    return result
  } catch {
    return []
  }
}

// ── parsePessoal ──────────────────────────────────────────────────────────────

function parsePessoal(wb: XLSX.WorkBook, unitId: string): DrePessoalInsert[] {
  const sheetName = "Planilha2"
  if (!wb.Sheets[sheetName]) return []
  try {
    const ws  = wb.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true })
    const result: DrePessoalInsert[] = []
    // col 2 = JAN 2026 (mes_ano "2026-1"), col 3 = FEV 2026 ("2026-2")
    const mesMap: [number, string][] = [[2, "2026-1"], [3, "2026-2"]]
    // data from row index 2
    for (let i = 2; i < raw.length; i++) {
      const row = (raw[i] ?? []) as unknown[]
      const categoria = toStr(row[1])
      if (!categoria) continue
      const catUpper = categoria.toUpperCase().trim()
      if (catUpper === "PESSOAL") continue
      for (const [colIdx, mesAno] of mesMap) {
        const valor = toNum(row[colIdx])
        if (valor === null || valor === 0) continue
        result.push({ unit_id: unitId, mes_ano: mesAno, categoria, valor })
      }
    }
    return result
  } catch {
    return []
  }
}

// ── parseManutencao ───────────────────────────────────────────────────────────

function parseManutencao(wb: XLSX.WorkBook, unitId: string): DreManutencaoInsert[] {
  const sheetName = "Planilha3"
  if (!wb.Sheets[sheetName]) return []
  try {
    const ws  = wb.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true })
    // find header row: scan first 6 rows for FORNECEDOR/CATEGORIA/VALOR
    let fornCol = -1, catCol = -1, valCol = -1, dataStart = 4
    for (let i = 0; i < Math.min(raw.length, 6); i++) {
      const row = (raw[i] ?? []) as unknown[]
      for (let j = 0; j < row.length; j++) {
        const h = toStr(row[j])?.toUpperCase().trim() ?? ""
        if (h.includes("FORNECEDOR") && fornCol === -1) fornCol = j
        if (h === "CATEGORIA" && catCol === -1) catCol = j
        if (h === "VALOR" && valCol === -1) valCol = j
      }
      if (fornCol !== -1 && catCol !== -1 && valCol !== -1) { dataStart = i + 1; break }
    }
    if (valCol === -1) return []
    const result: DreManutencaoInsert[] = []
    for (let i = dataStart; i < raw.length; i++) {
      const row = (raw[i] ?? []) as unknown[]
      const valor = toNum(fornCol !== -1 ? row[valCol] : row[valCol])
      if (valor === null || valor === 0) continue
      result.push({
        unit_id:    unitId,
        mes_ano:    null,
        fornecedor: fornCol !== -1 ? toStr(row[fornCol]) : null,
        categoria:  catCol  !== -1 ? toStr(row[catCol])  : null,
        valor,
      })
    }
    return result
  } catch {
    return []
  }
}

// ── parsePrestadores ──────────────────────────────────────────────────────────

function parsePrestadores(wb: XLSX.WorkBook, unitId: string): DrePrestadoresInsert[] {
  const result: DrePrestadoresInsert[] = []
  const abas: [string, string][] = [["Planilha4", "PJ OP"], ["Planilha5", "PJ ADM"]]
  for (const [sheetName, grupo] of abas) {
    if (!wb.Sheets[sheetName]) continue
    try {
      const ws  = wb.Sheets[sheetName]
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true })
      // data from row index 1 (row 0 = headers)
      for (let i = 1; i < raw.length; i++) {
        const row = (raw[i] ?? []) as unknown[]
        const mesAnoRaw = toStr(row[0])
        const mes_ano = mesAnoRaw ? parseMesAno(mesAnoRaw) : null
        if (!mes_ano) continue
        const nome = toStr(row[1])
        if (!nome) continue
        const valor = toNum(row[2])
        if (valor === null || valor === 0) continue
        result.push({ unit_id: unitId, mes_ano, nome, grupo, valor })
      }
    } catch {
      // skip this sheet on error
    }
  }
  return result
}

// ── Batch insert helper ────────────────────────────────────────────────────────

async function batchInsert<T>(
  rows: T[],
  insertFn: (batch: T[]) => Promise<{ ok: boolean; count: number; error?: string }>,
  onBatch: (n: number) => void,
  batchSize = 500
): Promise<string | null> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const result = await insertFn(rows.slice(i, i + batchSize))
    if (!result.ok) return result.error ?? "Erro desconhecido"
    onBatch(Math.min(batchSize, rows.length - i))
  }
  return null
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props { onClose: () => void; onSuccess: () => void }

type Status = "idle" | "loading_unit" | "ready" | "parsing" | "review" | "uploading" | "done" | "error"

export function DreImportModal({ onClose, onSuccess }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName]   = useState<string | null>(null)
  const [unitId, setUnitId]       = useState<string | null>(null)
  const [status, setStatus]       = useState<Status>("idle")
  const [phase, setPhase]         = useState<string>("")
  const [progress, setProgress]   = useState(0)
  const [totalRows, setTotalRows] = useState(0)
  const [importedRows, setImportedRows] = useState(0)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [monthsRealizado, setMonthsRealizado] = useState<string[]>([])
  const [monthsOrcado, setMonthsOrcado]       = useState<string[]>([])
  const [reviewData, setReviewData] = useState<ReviewData | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    setErrorMsg(null)
    setStatus("loading_unit")
    const id = await getCurrentUnitId()
    if (!id) {
      setErrorMsg("Não foi possível determinar o unit_id. Verifique se está autenticado.")
      setStatus("error")
      return
    }
    setUnitId(id)
    setStatus("ready")
  }

  async function handleImport() {
    const f = inputRef.current?.files?.[0]
    if (!f || !unitId) return
    setErrorMsg(null)
    setStatus("parsing")

    try {
      const buf = await f.arrayBuffer()
      const wb  = XLSX.read(buf, { type: "array" })

      const realizadoResult = parseSheet(wb, "Base Realizado",       "realizado", unitId)
      const orcadoResult    = parseSheet(wb, "04 -Base Orçado 2026", "orcado",    unitId)

      let gorjetaResult: GorjetaParseResult
      try { gorjetaResult = parseGorjeta(wb, unitId) }
      catch (e) { gorjetaResult = { rows: [], recon: [], missing: false, parseError: String(e) } }

      let receitaResult: ReceitaParseResult
      try { receitaResult = parseReceita(wb, unitId) }
      catch (e) { receitaResult = { rows: [], somaByMes: new Map(), missing: false, parseError: String(e) } }

      const mesesR = [...new Set(realizadoResult.rows.map(r => r.mes_ano))].sort()
      const latestMonth = mesesR.at(-1) ?? ""

      const kpisResult      = parseKpis(wb, realizadoResult.rows, gorjetaResult.rows, unitId)
      const mensalRows      = deriveDreMensal(
        realizadoResult.totaisDeclarados, orcadoResult.totaisDeclarados,
        kpisResult.clientesPorMes, kpisResult.ticketPorMes, unitId
      )
      const indicadoresRows = parseIndicadores(wb, unitId)
      const despesaRows     = parseDespesa(wb, unitId)
      const faturamentoRows = parseFaturamento(wb, unitId)
      const contratosRows   = parseContratos(wb, unitId)
      const folhaRows       = parseFolha(wb, unitId)
      const pessoalRows     = parsePessoal(wb, unitId)
      const manutencaoRows  = parseManutencao(wb, unitId)
      const prestadoresRows = parsePrestadores(wb, unitId)

      const total =
        realizadoResult.rows.length + orcadoResult.rows.length +
        gorjetaResult.rows.length   + receitaResult.rows.length +
        mensalRows.length           + kpisResult.rows.length +
        indicadoresRows.length      + despesaRows.length +
        faturamentoRows.length      + contratosRows.length +
        folhaRows.length            + pessoalRows.length +
        manutencaoRows.length       + prestadoresRows.length

      if (total === 0) {
        setErrorMsg("Nenhuma linha válida encontrada no arquivo.")
        setStatus("error")
        return
      }

      const reconciliation = latestMonth
        ? buildDreReconciliation(realizadoResult.rows, realizadoResult.totaisDeclarados, latestMonth)
        : []

      const receitaRecon = receitaResult.rows.length > 0
        ? buildReceitaReconciliation(realizadoResult.rows, receitaResult.somaByMes)
        : []

      setReviewData({
        realizadoRows:  realizadoResult.rows,
        orcadoRows:     orcadoResult.rows,
        gorjetaRows:    gorjetaResult.rows,
        receitaRows:    receitaResult.rows,
        mensalRows,
        kpisRows:       kpisResult.rows,
        indicadoresRows,
        despesaRows,
        faturamentoRows,
        contratosRows,
        folhaRows,
        pessoalRows,
        manutencaoRows,
        prestadoresRows,
        reconciliation,
        gorjetaRecon:   gorjetaResult.recon,
        receitaRecon,
        latestMonth,
        descricoes: [...new Set(realizadoResult.rows.map(r => `${r.grupo} | ${r.descricao}`))].sort(),
        gorjetaMissing: gorjetaResult.missing,
        gorjetaError:   gorjetaResult.parseError,
        receitaMissing: receitaResult.missing,
        receitaError:   receitaResult.parseError,
      })
      setMonthsRealizado(mesesR)
      setMonthsOrcado([...new Set(orcadoResult.rows.map(r => r.mes_ano))].sort())
      setTotalRows(total)
      setStatus("review")
    } catch (e) {
      setErrorMsg(String(e))
      setStatus("error")
    }
  }

  async function handleConfirm() {
    if (!reviewData || !unitId) return
    const { realizadoRows, orcadoRows, gorjetaRows, receitaRows,
            mensalRows, kpisRows, indicadoresRows,
            despesaRows, faturamentoRows, contratosRows,
            folhaRows, pessoalRows, manutencaoRows, prestadoresRows } = reviewData
    setStatus("uploading")

    let imported = 0
    const bump = (n: number) => {
      imported += n
      setImportedRows(imported)
      setProgress(Math.round((imported / totalRows) * 100))
    }

    try {
      // ── Realizado ──────────────────────────────────────────────────────────
      setPhase("Importando Realizado…")
      const delR = await deleteDreLinhasRealizado(unitId)
      if (!delR.ok) { setErrorMsg(delR.error ?? "Erro ao limpar realizado."); setStatus("error"); return }
      const errR = await batchInsert(realizadoRows, insertDreLinhas, bump)
      if (errR) { setErrorMsg(errR); setStatus("error"); return }

      // ── Orçado ─────────────────────────────────────────────────────────────
      setPhase("Importando Orçado…")
      const delO = await deleteDreLinhasOrcado(unitId)
      if (!delO.ok) { setErrorMsg(delO.error ?? "Erro ao limpar orçado."); setStatus("error"); return }
      const errO = await batchInsert(orcadoRows, insertDreLinhas, bump)
      if (errO) { setErrorMsg(errO); setStatus("error"); return }

      // ── Gorjeta ────────────────────────────────────────────────────────────
      if (gorjetaRows.length > 0) {
        setPhase("Importando Gorjeta…")
        const delG = await deleteDreGorjeta(unitId)
        if (!delG.ok) { setErrorMsg(delG.error ?? "Erro ao limpar gorjeta."); setStatus("error"); return }
        const errG = await batchInsert(gorjetaRows, insertDreGorjeta, bump)
        if (errG) { setErrorMsg(errG); setStatus("error"); return }
      }

      // ── Receita ────────────────────────────────────────────────────────────
      if (receitaRows.length > 0) {
        setPhase("Importando Receita…")
        const delRc = await deleteDreReceita(unitId)
        if (!delRc.ok) { setErrorMsg(delRc.error ?? "Erro ao limpar receita."); setStatus("error"); return }
        const errRc = await batchInsert(receitaRows, insertDreReceita, bump)
        if (errRc) { setErrorMsg(errRc); setStatus("error"); return }
      }

      // ── DRE Mensal ─────────────────────────────────────────────────────────
      if (mensalRows.length > 0) {
        setPhase("Importando DRE Mensal…")
        const delM = await deleteDreMensal(unitId)
        if (!delM.ok) { setErrorMsg(delM.error ?? "Erro ao limpar DRE mensal."); setStatus("error"); return }
        const errM = await batchInsert(mensalRows, insertDreMensal, bump)
        if (errM) { setErrorMsg(errM); setStatus("error"); return }
      }

      // ── KPIs mensais ───────────────────────────────────────────────────────
      if (kpisRows.length > 0) {
        setPhase("Importando KPIs…")
        const delK = await deleteDreKpis(unitId)
        if (!delK.ok) { setErrorMsg(delK.error ?? "Erro ao limpar KPIs."); setStatus("error"); return }
        const errK = await batchInsert(kpisRows, insertDreKpis, bump)
        if (errK) { setErrorMsg(errK); setStatus("error"); return }
      }

      // ── Indicadores ────────────────────────────────────────────────────────
      if (indicadoresRows.length > 0) {
        setPhase("Importando Indicadores…")
        const delI = await deleteDreIndicadores(unitId)
        if (!delI.ok) { setErrorMsg(delI.error ?? "Erro ao limpar indicadores."); setStatus("error"); return }
        const errI = await batchInsert(indicadoresRows, insertDreIndicadores, bump)
        if (errI) { setErrorMsg(errI); setStatus("error"); return }
      }

      // ── Despesas ───────────────────────────────────────────────────────────
      if (despesaRows.length > 0) {
        setPhase("Importando Despesas…")
        const delD = await deleteDreDespesa(unitId)
        if (!delD.ok) { setErrorMsg(delD.error ?? "Erro ao limpar despesas."); setStatus("error"); return }
        const errD = await batchInsert(despesaRows, insertDreDespesa, bump)
        if (errD) { setErrorMsg(errD); setStatus("error"); return }
      }

      // ── Faturamento histórico ──────────────────────────────────────────────
      if (faturamentoRows.length > 0) {
        setPhase("Importando Faturamento…")
        const delF = await deleteDreFaturamento(unitId)
        if (!delF.ok) { setErrorMsg(delF.error ?? "Erro ao limpar faturamento."); setStatus("error"); return }
        const errF = await batchInsert(faturamentoRows, insertDreFaturamento, bump)
        if (errF) { setErrorMsg(errF); setStatus("error"); return }
      }

      // ── Contratos fixos ────────────────────────────────────────────────────
      if (contratosRows.length > 0) {
        setPhase("Importando Contratos…")
        const delC = await deleteDreContratos(unitId)
        if (!delC.ok) { setErrorMsg(delC.error ?? "Erro ao limpar contratos."); setStatus("error"); return }
        const errC = await batchInsert(contratosRows, insertDreContratos, bump)
        if (errC) { setErrorMsg(errC); setStatus("error"); return }
      }

      // ── Folha ──────────────────────────────────────────────────────────────
      if (folhaRows.length > 0) {
        setPhase("Importando Folha…")
        const delFo = await deleteDreFolha(unitId)
        if (!delFo.ok) { setErrorMsg(delFo.error ?? "Erro ao limpar folha."); setStatus("error"); return }
        const errFo = await batchInsert(folhaRows, insertDreFolha, bump)
        if (errFo) { setErrorMsg(errFo); setStatus("error"); return }
      }

      // ── Pessoal detalhado ──────────────────────────────────────────────────
      if (pessoalRows.length > 0) {
        setPhase("Importando Pessoal…")
        const delPe = await deleteDrePessoal(unitId)
        if (!delPe.ok) { setErrorMsg(delPe.error ?? "Erro ao limpar pessoal."); setStatus("error"); return }
        const errPe = await batchInsert(pessoalRows, insertDrePessoal, bump)
        if (errPe) { setErrorMsg(errPe); setStatus("error"); return }
      }

      // ── Manutenção ─────────────────────────────────────────────────────────
      if (manutencaoRows.length > 0) {
        setPhase("Importando Manutenção…")
        const delMa = await deleteDreManutencao(unitId)
        if (!delMa.ok) { setErrorMsg(delMa.error ?? "Erro ao limpar manutenção."); setStatus("error"); return }
        const errMa = await batchInsert(manutencaoRows, insertDreManutencao, bump)
        if (errMa) { setErrorMsg(errMa); setStatus("error"); return }
      }

      // ── Prestadores ────────────────────────────────────────────────────────
      if (prestadoresRows.length > 0) {
        setPhase("Importando Prestadores…")
        const delPr = await deleteDrePrestadores(unitId)
        if (!delPr.ok) { setErrorMsg(delPr.error ?? "Erro ao limpar prestadores."); setStatus("error"); return }
        const errPr = await batchInsert(prestadoresRows, insertDrePrestadores, bump)
        if (errPr) { setErrorMsg(errPr); setStatus("error"); return }
      }

      setStatus("done")
      setTimeout(() => { onSuccess(); onClose() }, 1500)
    } catch (e) {
      setErrorMsg(String(e))
      setStatus("error")
    }
  }

  const busy = status === "loading_unit" || status === "parsing" || status === "uploading"

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 28,
        width: status === "review" ? 640 : 520,
        maxWidth: "95vw",
        maxHeight: "90vh",
        overflowY: "auto",
      }}>
        {/* Title */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Importar DRE (.xlsx)</span>
          {!busy && (
            <button onClick={onClose}
              style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 18 }}>
              ✕
            </button>
          )}
        </div>
        {unitId && (
          <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 16 }}>
            unit_id: <code style={{ fontSize: 10 }}>{unitId}</code>
          </p>
        )}

        {/* ── File picker ── */}
        {(status === "idle" || status === "ready" || status === "loading_unit" || status === "error") && (
          <>
            <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16, lineHeight: 1.5 }}>
              Selecione o arquivo Excel da DRE. Abas importadas:{" "}
              <strong>Base Realizado</strong>, <strong>04 -Base Orçado 2026</strong>,{" "}
              <strong>Base Gorjeta</strong> e <strong>B.Receita</strong>.
            </p>
            <label style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              border: "2px dashed var(--border)", borderRadius: 8, padding: "24px 16px",
              cursor: "pointer", gap: 8, marginBottom: 16,
              background: fileName ? "var(--surface-2)" : "transparent",
            }}>
              <span style={{ fontSize: 28 }}>📂</span>
              {status === "loading_unit"
                ? <span style={{ fontSize: 13, color: "var(--text-3)" }}>Verificando autenticação…</span>
                : <span style={{ fontSize: 13, color: "var(--text-3)" }}>{fileName ?? "Clique ou arraste o arquivo .xlsx"}</span>
              }
              <input ref={inputRef} type="file" accept=".xlsx,.xls"
                style={{ display: "none" }} onChange={handleFileChange} disabled={busy} />
            </label>

            {errorMsg && (
              <div style={{
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 6, padding: "10px 14px", marginBottom: 16,
                fontSize: 13, color: "#f87171",
              }}>{errorMsg}</div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} disabled={busy} style={{
                padding: "8px 18px", borderRadius: 6, border: "1px solid var(--border)",
                background: "transparent", color: "var(--text-3)",
                cursor: busy ? "not-allowed" : "pointer", fontSize: 13,
              }}>Cancelar</button>
              <button onClick={handleImport} disabled={!fileName || !unitId || busy} style={{
                padding: "8px 20px", borderRadius: 6, border: "none",
                background: (fileName && unitId && !busy) ? "var(--brand)" : "var(--surface-2)",
                color: (fileName && unitId && !busy) ? "#fff" : "var(--text-3)",
                cursor: (fileName && unitId && !busy) ? "pointer" : "not-allowed",
                fontSize: 13, fontWeight: 600,
              }}>Importar</button>
            </div>
          </>
        )}

        {/* ── Parsing ── */}
        {status === "parsing" && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-3)", fontSize: 14 }}>
            Lendo abas do Excel…
          </div>
        )}

        {/* ── Review ── */}
        {status === "review" && reviewData && (() => {
          // Receita difference that is positive and < 30% of DRE total is expected gorjeta
          const isExpectedGorjetaDiff = (r: ReceitaReconItem) =>
            r.diferenca > 0 && r.totalDRE > 0 && r.diferenca < 0.3 * r.totalDRE

          const hasDivergence = reviewData.reconciliation.some(r => !r.ok)
            || reviewData.gorjetaRecon.some(r => !r.ok)
            || reviewData.receitaRecon.some(r => !r.ok && !isExpectedGorjetaDiff(r))

          return (
            <>
              {/* Section: DRE groups */}
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  Conferência DRE — {mesAnoLabel(reviewData.latestMonth)}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 8 }}>(mês mais recente)</span>
              </div>
              <ReconTable items={reviewData.reconciliation} />

              {/* Section: Gorjeta */}
              <div style={{ marginTop: 16, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Gorjeta</span>
                {reviewData.gorjetaMissing && (
                  <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 8 }}>aba não encontrada — ignorada</span>
                )}
                {reviewData.gorjetaError && (
                  <span style={{ fontSize: 11, color: "#f87171", marginLeft: 8 }}>{reviewData.gorjetaError}</span>
                )}
              </div>
              {reviewData.gorjetaRecon.length > 0 && (
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 4 }}>
                  <div style={{
                    display: "grid", gridTemplateColumns: "60px 90px 90px 90px 90px 28px",
                    background: "var(--surface-2)", padding: "6px 12px",
                    fontSize: 11, fontWeight: 600, color: "var(--text-3)", gap: 0,
                  }}>
                    <span>Mês</span>
                    <span style={{ textAlign: "right" }}>Recebida</span>
                    <span style={{ textAlign: "right" }}>Paga</span>
                    <span style={{ textAlign: "right" }}>Ret. calc.</span>
                    <span style={{ textAlign: "right" }}>Ret. decl.</span>
                    <span style={{ textAlign: "center" }}></span>
                  </div>
                  {reviewData.gorjetaRecon.map((g, i) => (
                    <div key={g.mesAno} style={{
                      display: "grid", gridTemplateColumns: "60px 90px 90px 90px 90px 28px",
                      padding: "6px 12px", fontSize: 12, gap: 0,
                      borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                      background: g.ok ? "transparent" : "rgba(251,191,36,0.06)",
                    }}>
                      <span style={{ color: "var(--text-3)", fontSize: 11 }}>{mesAnoLabel(g.mesAno)}</span>
                      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtR(g.recebida)}</span>
                      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtR(g.paga)}</span>
                      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtR(g.retencaoCalc)}</span>
                      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: g.ok ? "var(--text-3)" : "#f59e0b", fontWeight: g.ok ? 400 : 600 }}>
                        {fmtR(g.retencaoDecl)}
                      </span>
                      <span style={{ textAlign: "center" }}>{g.ok ? "✅" : "⚠️"}</span>
                    </div>
                  ))}
                </div>
              )}
              {reviewData.gorjetaRows.length === 0 && !reviewData.gorjetaMissing && !reviewData.gorjetaError && (
                <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>Nenhuma linha de gorjeta com valor.</p>
              )}

              {/* Section: Receita */}
              <div style={{ marginTop: 16, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Receita por mês</span>
                {reviewData.receitaMissing && (
                  <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 8 }}>aba não encontrada — ignorada</span>
                )}
                {reviewData.receitaError && (
                  <span style={{ fontSize: 11, color: "#f87171", marginLeft: 8 }}>{reviewData.receitaError}</span>
                )}
              </div>
              {reviewData.receitaRecon.length > 0 && (
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 4 }}>
                  <div style={{
                    display: "grid", gridTemplateColumns: "60px 1fr 1fr 90px 28px",
                    background: "var(--surface-2)", padding: "6px 12px",
                    fontSize: 11, fontWeight: 600, color: "var(--text-3)", gap: 0,
                  }}>
                    <span>Mês</span>
                    <span style={{ textAlign: "right" }}>DRE</span>
                    <span style={{ textAlign: "right" }}>Planilha</span>
                    <span style={{ textAlign: "right" }}>Diferença</span>
                    <span style={{ textAlign: "center" }}></span>
                  </div>
                  {reviewData.receitaRecon.map((r, i) => {
                    const gorjetaExp = !r.ok && isExpectedGorjetaDiff(r)
                    return (
                      <div key={r.mesAno} style={{
                        display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr 28px",
                        padding: "6px 12px", fontSize: 12, gap: 0,
                        borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                        background: (!r.ok && !gorjetaExp) ? "rgba(251,191,36,0.06)" : "transparent",
                      }}>
                        <span style={{ color: "var(--text-3)", fontSize: 11 }}>{mesAnoLabel(r.mesAno)}</span>
                        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtR(r.totalDRE)}</span>
                        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtR(r.totalReceita)}</span>
                        <span style={{
                          textAlign: "right", fontVariantNumeric: "tabular-nums",
                          color: gorjetaExp ? "var(--text-3)" : (!r.ok ? "#f59e0b" : "var(--text-3)"),
                          fontWeight: (!r.ok && !gorjetaExp) ? 600 : 400,
                          fontSize: gorjetaExp ? 10 : 12,
                        }}>
                          {r.ok ? "—" : gorjetaExp ? `✦ gorjetas (${fmtR(r.diferenca)})` : fmtR(r.diferenca)}
                        </span>
                        <span style={{ textAlign: "center" }}>
                          {r.ok ? "✅" : gorjetaExp ? "✦" : "⚠️"}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Section: DRE Mensal / KPIs / Indicadores */}
              {(reviewData.mensalRows.length > 0 || reviewData.kpisRows.length > 0 || reviewData.indicadoresRows.length > 0) && (
                <div style={{ marginTop: 16, marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>DRE Mensal derivado</div>
                  <div style={{
                    border: "1px solid var(--border)", borderRadius: 8,
                    padding: "10px 14px", fontSize: 12, color: "var(--text-3)",
                    display: "flex", gap: 20, flexWrap: "wrap",
                  }}>
                    {reviewData.mensalRows.length > 0 && (() => {
                      const real = reviewData.mensalRows.filter(r => r.tipo === "realizado").length
                      const orc  = reviewData.mensalRows.filter(r => r.tipo === "orcado").length
                      return (
                        <span>
                          dre_mensal:{" "}
                          <strong style={{ color: "var(--text)" }}>{reviewData.mensalRows.length}</strong>
                          {" "}linhas ({real} realizado, {orc} orçado)
                        </span>
                      )
                    })()}
                    {reviewData.kpisRows.length > 0 && (
                      <span>
                        dre_kpis_mensais:{" "}
                        <strong style={{ color: "var(--text)" }}>{reviewData.kpisRows.length}</strong> meses
                      </span>
                    )}
                    {reviewData.indicadoresRows.length > 0 && (() => {
                      const real = reviewData.indicadoresRows.filter(r => r.tipo === "realizado").length
                      const orc  = reviewData.indicadoresRows.filter(r => r.tipo === "orcado").length
                      return (
                        <span>
                          dre_indicadores:{" "}
                          <strong style={{ color: "var(--text)" }}>{reviewData.indicadoresRows.length}</strong>
                          {" "}linhas ({real} real, {orc} orc)
                        </span>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* Section: Lançamentos e Referência */}
              {(reviewData.despesaRows.length > 0 || reviewData.faturamentoRows.length > 0 || reviewData.contratosRows.length > 0) && (
                <div style={{ marginTop: 16, marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>Lançamentos e Referência</div>
                  <div style={{
                    border: "1px solid var(--border)", borderRadius: 8,
                    padding: "10px 14px", fontSize: 12, color: "var(--text-3)",
                    display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    {reviewData.despesaRows.length > 0 && (() => {
                      const porMes = new Map<string, number>()
                      reviewData.despesaRows.forEach(r => porMes.set(r.mes_ano, (porMes.get(r.mes_ano) ?? 0) + 1))
                      const mesesStr = [...porMes.entries()]
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([m, n]) => `${mesAnoLabel(m)} ${n}`)
                        .join(" | ")
                      return (
                        <span>
                          Despesas:{" "}
                          <strong style={{ color: "var(--text)" }}>{reviewData.despesaRows.length}</strong>
                          {" "}linhas — {mesesStr}
                        </span>
                      )
                    })()}
                    {reviewData.faturamentoRows.length > 0 && (
                      <span>
                        Faturamento histórico:{" "}
                        <strong style={{ color: "var(--text)" }}>{reviewData.faturamentoRows.length}</strong>
                        {" "}meses (2022 → 2026 BD)
                      </span>
                    )}
                    {reviewData.contratosRows.length > 0 && (
                      <span>
                        Contratos fixos:{" "}
                        <strong style={{ color: "var(--text)" }}>{reviewData.contratosRows.length}</strong>
                        {" "}contratos
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Section: Pessoal e Detalhes */}
              {(reviewData.folhaRows.length > 0 || reviewData.pessoalRows.length > 0 || reviewData.manutencaoRows.length > 0 || reviewData.prestadoresRows.length > 0) && (
                <div style={{ marginTop: 16, marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>Pessoal e Detalhes</div>
                  <div style={{
                    border: "1px solid var(--border)", borderRadius: 8,
                    padding: "10px 14px", fontSize: 12, color: "var(--text-3)",
                    display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    {reviewData.folhaRows.length > 0 && (() => {
                      const vagas = reviewData.folhaRows.filter(r => r.is_vaga).length
                      return (
                        <span>
                          Folha:{" "}
                          <strong style={{ color: "var(--text)" }}>{reviewData.folhaRows.length}</strong>
                          {" "}colaboradores{vagas > 0 ? ` (${vagas} vagas)` : ""}
                        </span>
                      )
                    })()}
                    {reviewData.pessoalRows.length > 0 && (
                      <span>
                        Pessoal detalhado:{" "}
                        <strong style={{ color: "var(--text)" }}>{reviewData.pessoalRows.length}</strong>
                        {" "}linhas (Jan+Fev)
                      </span>
                    )}
                    {reviewData.manutencaoRows.length > 0 && (
                      <span>
                        Manutenção:{" "}
                        <strong style={{ color: "var(--text)" }}>{reviewData.manutencaoRows.length}</strong>
                        {" "}lançamentos
                      </span>
                    )}
                    {reviewData.prestadoresRows.length > 0 && (() => {
                      const op  = reviewData.prestadoresRows.filter(r => r.grupo === "PJ OP").length
                      const adm = reviewData.prestadoresRows.filter(r => r.grupo === "PJ ADM").length
                      return (
                        <span>
                          Prestadores PJ:{" "}
                          <strong style={{ color: "var(--text)" }}>{reviewData.prestadoresRows.length}</strong>
                          {" "}linhas ({op} OP, {adm} ADM)
                        </span>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8, marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span>Realizado: <strong style={{ color: "var(--text)" }}>{reviewData.realizadoRows.length}</strong></span>
                <span>Orçado: <strong style={{ color: "var(--text)" }}>{reviewData.orcadoRows.length}</strong></span>
                {reviewData.gorjetaRows.length > 0 && <span>Gorjeta: <strong style={{ color: "var(--text)" }}>{reviewData.gorjetaRows.length}</strong> meses</span>}
                {reviewData.receitaRows.length > 0 && <span>Receita: <strong style={{ color: "var(--text)" }}>{reviewData.receitaRows.length}</strong> linhas</span>}
                <span>Meses realizado: <strong style={{ color: "var(--text)" }}>{monthsRealizado.map(mesAnoLabel).join(", ")}</strong></span>
              </div>

              {/* Descriptions */}
              <details style={{ marginBottom: 12 }}>
                <summary style={{ fontSize: 12, color: "var(--text-3)", cursor: "pointer", userSelect: "none" }}>
                  Linhas DRE capturadas ({reviewData.descricoes.length} grupo|descrição)
                </summary>
                <div style={{ marginTop: 8, maxHeight: 140, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px" }}>
                  {reviewData.descricoes.map(d => (
                    <div key={d} style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.8 }}>{d}</div>
                  ))}
                </div>
              </details>

              {hasDivergence && (
                <div style={{
                  background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)",
                  borderRadius: 6, padding: "8px 12px", marginBottom: 12,
                  fontSize: 12, color: "#f59e0b", lineHeight: 1.5,
                }}>
                  ⚠️ Há divergências. Verifique antes de confirmar — o import está disponível mesmo assim.
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={onClose} style={{
                  padding: "8px 18px", borderRadius: 6, border: "1px solid var(--border)",
                  background: "transparent", color: "var(--text-3)", cursor: "pointer", fontSize: 13,
                }}>Cancelar</button>
                <button onClick={handleConfirm} style={{
                  padding: "8px 20px", borderRadius: 6, border: "none",
                  background: "var(--brand)", color: "#fff",
                  cursor: "pointer", fontSize: 13, fontWeight: 600,
                }}>Confirmar Importação</button>
              </div>
            </>
          )
        })()}

        {/* ── Uploading ── */}
        {status === "uploading" && (
          <div style={{ padding: "8px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, color: "var(--text-3)" }}>
              <span>{phase}</span><span>{importedRows} / {totalRows}</span>
            </div>
            <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "var(--brand)", width: `${progress}%`, transition: "width 0.3s ease" }} />
            </div>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 10, textAlign: "center" }}>{progress}% concluído</p>
          </div>
        )}

        {/* ── Done ── */}
        {status === "done" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{importedRows} linhas importadas</p>
            {monthsRealizado.length > 0 && (
              <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>Realizado: {monthsRealizado.map(mesAnoLabel).join(", ")}</p>
            )}
            {monthsOrcado.length > 0 && (
              <p style={{ fontSize: 12, color: "var(--text-3)" }}>Orçado: {monthsOrcado.map(mesAnoLabel).join(", ")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Recon table sub-component (DRE groups) ─────────────────────────────────────

function ReconTable({ items }: { items: ReconciliationItem[] }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 4 }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 28px",
        background: "var(--surface-2)", padding: "6px 12px",
        fontSize: 11, fontWeight: 600, color: "var(--text-3)", gap: 0,
      }}>
        <span>Grupo</span>
        <span style={{ textAlign: "right" }}>Declarado</span>
        <span style={{ textAlign: "right" }}>Capturado</span>
        <span style={{ textAlign: "right" }}>Diferença</span>
        <span style={{ textAlign: "center" }}></span>
      </div>
      {items.map((item, i) => (
        <div key={item.grupo} style={{
          display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 28px",
          padding: "6px 12px", fontSize: 12, gap: 0,
          borderTop: i > 0 ? "1px solid var(--border)" : undefined,
          background: item.ok ? "transparent" : "rgba(251,191,36,0.06)",
        }}>
          <span style={{ color: "var(--text-3)", fontSize: 11 }}>{item.grupo}</span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtR(item.declarado)}</span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtR(item.capturado)}</span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: item.ok ? "var(--text-3)" : "#f59e0b", fontWeight: item.ok ? 400 : 600 }}>
            {item.ok ? "—" : fmtR(item.diferenca)}
          </span>
          <span style={{ textAlign: "center" }}>{item.ok ? "✅" : "⚠️"}</span>
        </div>
      ))}
    </div>
  )
}
