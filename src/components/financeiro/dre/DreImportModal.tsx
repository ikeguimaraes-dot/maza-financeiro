"use client"

import { useRef, useState } from "react"
import * as XLSX from "xlsx"
import {
  deleteDreLinhasRealizado,
  deleteDreLinhasOrcado,
  insertDreLinhas,
  getCurrentUnitId,
} from "@/app/financeiro/dre/actions"
import type { DreLinhaInsert } from "@/app/financeiro/dre/actions"

// Excel section header → banco grupo
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

// descricao Excel → descricao banco
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

// CAPS rows that are legitimate detail lines (not group headers, not calculation rows)
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

interface MonthCol {
  mesAno: string
  colIdx: number
  avIdx: number  // -1 if no AV column
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
      if (mesNum !== undefined) {
        cols.push({ mesAno: `${year}-${mesNum}`, colIdx: i, avIdx: -1 })
      }
    }
  }
  // avIdx: if next col is NOT another month col, treat it as AV
  const monthColIdxSet = new Set(cols.map(c => c.colIdx))
  for (const col of cols) {
    const nextIdx = col.colIdx + 1
    if (!monthColIdxSet.has(nextIdx)) col.avIdx = nextIdx
  }
  return cols
}

// mesAno → grupoBanco → declared total from the group header row
type TotaisDeclarados = Map<string, Map<string, number>>

interface ParseResult {
  rows: DreLinhaInsert[]
  totaisDeclarados: TotaisDeclarados
}

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

  if (monthCols.length === 0) throw new Error(`Nenhuma coluna de mês detectada na aba '${sheetName}' (procura até a linha 15).`)
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
      // Capture declared totals from the group header row
      for (const mc of monthCols) {
        const val = toNum(row[mc.colIdx])
        if (val === null) continue
        if (!totaisDeclarados.has(mc.mesAno)) totaisDeclarados.set(mc.mesAno, new Map())
        const grupoMap = totaisDeclarados.get(mc.mesAno)!
        // If same banco grupo appears twice (e.g. two Excel headers → RECEITA), accumulate
        grupoMap.set(currentGrupo, (grupoMap.get(currentGrupo) ?? 0) + val)
      }
      continue
    }

    // ALL-CAPS line not in GRUPO_MAP: sub-item or calculation/total row
    if (desc === desc.toUpperCase() && /\p{L}/u.test(desc)) {
      if (!SUB_ITENS.has(normalizeSpaces(desc).toUpperCase())) {
        currentGrupo = null  // calculation/total row — stop collecting until next group
      }
      // SUB_ITEM: fall through to detail processing
    }

    if (!currentGrupo) continue

    const contaRaw = toStr(row[contaColIdx])
    const conta = contaRaw && !contaRaw.startsWith("x.x.") ? contaRaw : null
    const descBanco = DESCRICAO_MAP[desc] ?? desc

    for (const mc of monthCols) {
      const val = toNum(row[mc.colIdx])
      if (val === null) continue

      byMonth.get(mc.mesAno)!.push({
        unit_id:       unitId,
        mes_ano:       mc.mesAno,
        tipo,
        grupo:         currentGrupo,
        descricao:     descBanco,
        conta,
        valor:         val,
        av_percentual: mc.avIdx >= 0 ? toNum(row[mc.avIdx]) : null,
        custo_tipo:    null,
      })
    }
  }

  const rows: DreLinhaInsert[] = []
  for (const [mesAno, monthRows] of byMonth) {
    if (tipo === "realizado") {
      const nonZero = monthRows.filter(r => r.valor !== null && r.valor !== 0).length
      if (nonZero < 10) {
        // Sparse month — also remove its declared totals so reconciliation stays in sync
        totaisDeclarados.delete(mesAno)
        continue
      }
    }
    rows.push(...monthRows)
  }

  return { rows, totaisDeclarados }
}

// ── Reconciliation types ───────────────────────────────────────────────────────

interface ReconciliationItem {
  grupo: string
  declarado: number
  capturado: number
  diferenca: number
  ok: boolean
}

interface ReviewData {
  realizadoRows: DreLinhaInsert[]
  orcadoRows: DreLinhaInsert[]
  reconciliation: ReconciliationItem[]
  latestMonth: string
  descricoes: string[]
}

function buildReconciliation(
  rows: DreLinhaInsert[],
  totaisDeclarados: TotaisDeclarados,
  latestMonth: string
): ReconciliationItem[] {
  // Sum captured values per grupo for the latest month
  const capturado = new Map<string, number>()
  for (const r of rows) {
    if (r.mes_ano !== latestMonth) continue
    capturado.set(r.grupo, (capturado.get(r.grupo) ?? 0) + (r.valor ?? 0))
  }

  const declaradoMes = totaisDeclarados.get(latestMonth) ?? new Map<string, number>()

  // Union of all grupos that appear in either declared or captured
  const grupos = new Set([...declaradoMes.keys(), ...capturado.keys()])

  return [...grupos].map(grupo => {
    const decl = declaradoMes.get(grupo) ?? 0
    const capt = capturado.get(grupo) ?? 0
    const diff = decl - capt
    return {
      grupo,
      declarado: decl,
      capturado: capt,
      diferenca: diff,
      ok: Math.abs(diff) <= 1,
    }
  }).sort((a, b) => a.grupo.localeCompare(b.grupo))
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  onSuccess: () => void
}

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
      setErrorMsg("Não foi possível determinar o unit_id. Verifique se você está autenticado.")
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

      const total = realizadoResult.rows.length + orcadoResult.rows.length
      if (total === 0) {
        setErrorMsg("Nenhuma linha válida encontrada nas abas 'Base Realizado' e '04 -Base Orçado 2026'.")
        setStatus("error")
        return
      }

      const mesesR = [...new Set(realizadoResult.rows.map(r => r.mes_ano))].sort()
      const latestMonth = mesesR.at(-1) ?? ""

      const reconciliation = latestMonth
        ? buildReconciliation(realizadoResult.rows, realizadoResult.totaisDeclarados, latestMonth)
        : []

      const descricoes = [...new Set(
        realizadoResult.rows.map(r => `${r.grupo} | ${r.descricao}`)
      )].sort()

      setReviewData({
        realizadoRows: realizadoResult.rows,
        orcadoRows: orcadoResult.rows,
        reconciliation,
        latestMonth,
        descricoes,
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

    const { realizadoRows, orcadoRows } = reviewData
    const total = realizadoRows.length + orcadoRows.length
    setStatus("uploading")

    try {
      let imported = 0

      // ── Realizado ──────────────────────────────────────────────────────────
      setPhase("Importando Realizado…")
      const delR = await deleteDreLinhasRealizado(unitId)
      if (!delR.ok) { setErrorMsg(delR.error ?? "Erro ao limpar realizado."); setStatus("error"); return }

      const BATCH = 500
      for (let i = 0; i < realizadoRows.length; i += BATCH) {
        const batch = realizadoRows.slice(i, i + BATCH)
        const result = await insertDreLinhas(batch)
        if (!result.ok) { setErrorMsg(result.error ?? "Erro ao inserir realizado."); setStatus("error"); return }
        imported += batch.length
        setImportedRows(imported)
        setProgress(Math.round((imported / total) * 100))
      }

      // ── Orçado ─────────────────────────────────────────────────────────────
      setPhase("Importando Orçado…")
      const delO = await deleteDreLinhasOrcado(unitId)
      if (!delO.ok) { setErrorMsg(delO.error ?? "Erro ao limpar orçado."); setStatus("error"); return }

      for (let i = 0; i < orcadoRows.length; i += BATCH) {
        const batch = orcadoRows.slice(i, i + BATCH)
        const result = await insertDreLinhas(batch)
        if (!result.ok) { setErrorMsg(result.error ?? "Erro ao inserir orçado."); setStatus("error"); return }
        imported += batch.length
        setImportedRows(imported)
        setProgress(Math.round((imported / total) * 100))
      }

      setStatus("done")
      setTimeout(() => { onSuccess(); onClose() }, 1500)
    } catch (e) {
      setErrorMsg(String(e))
      setStatus("error")
    }
  }

  const busy = status === "loading_unit" || status === "parsing" || status === "uploading"

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
        width: status === "review" ? 620 : 520,
        maxWidth: "95vw",
        maxHeight: "90vh",
        overflowY: "auto",
      }}>
        {/* Title row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
            Importar DRE (.xlsx)
          </span>
          {!busy && (
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 18 }}
            >
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
              Selecione o arquivo Excel da DRE. As abas <strong>"Base Realizado"</strong> e{" "}
              <strong>"04 -Base Orçado 2026"</strong> serão importadas em sequência.
            </p>

            <label style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              border: "2px dashed var(--border)", borderRadius: 8, padding: "24px 16px",
              cursor: "pointer", gap: 8, marginBottom: 16,
              background: fileName ? "var(--surface-2)" : "transparent",
            }}>
              <span style={{ fontSize: 28 }}>📂</span>
              {status === "loading_unit" ? (
                <span style={{ fontSize: 13, color: "var(--text-3)" }}>Verificando autenticação…</span>
              ) : (
                <span style={{ fontSize: 13, color: "var(--text-3)" }}>
                  {fileName ?? "Clique ou arraste o arquivo .xlsx"}
                </span>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={handleFileChange}
                disabled={busy}
              />
            </label>

            {errorMsg && (
              <div style={{
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 6, padding: "10px 14px", marginBottom: 16,
                fontSize: 13, color: "#f87171",
              }}>
                {errorMsg}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                disabled={busy}
                style={{
                  padding: "8px 18px", borderRadius: 6, border: "1px solid var(--border)",
                  background: "transparent", color: "var(--text-3)",
                  cursor: busy ? "not-allowed" : "pointer", fontSize: 13,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={!fileName || !unitId || busy}
                style={{
                  padding: "8px 20px", borderRadius: 6, border: "none",
                  background: (fileName && unitId && !busy) ? "var(--brand)" : "var(--surface-2)",
                  color: (fileName && unitId && !busy) ? "#fff" : "var(--text-3)",
                  cursor: (fileName && unitId && !busy) ? "pointer" : "not-allowed",
                  fontSize: 13, fontWeight: 600,
                }}
              >
                Importar
              </button>
            </div>
          </>
        )}

        {/* ── Parsing spinner ── */}
        {status === "parsing" && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-3)", fontSize: 14 }}>
            Lendo abas do Excel…
          </div>
        )}

        {/* ── Review / reconciliation ── */}
        {status === "review" && reviewData && (
          <>
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                Conferência — {mesAnoLabel(reviewData.latestMonth)}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 8 }}>
                (mês mais recente do realizado)
              </span>
            </div>

            {/* Reconciliation table */}
            <div style={{
              border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 16,
            }}>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px 90px 90px 28px",
                gap: 0,
                background: "var(--surface-2)",
                padding: "6px 12px",
                fontSize: 11, fontWeight: 600, color: "var(--text-3)",
              }}>
                <span>Grupo</span>
                <span style={{ textAlign: "right" }}>Declarado</span>
                <span style={{ textAlign: "right" }}>Capturado</span>
                <span style={{ textAlign: "right" }}>Diferença</span>
                <span style={{ textAlign: "center" }}></span>
              </div>

              {reviewData.reconciliation.map((item, i) => (
                <div
                  key={item.grupo}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 90px 90px 90px 28px",
                    gap: 0,
                    padding: "6px 12px",
                    fontSize: 12,
                    borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                    background: item.ok ? "transparent" : "rgba(251,191,36,0.06)",
                    color: "var(--text)",
                  }}
                >
                  <span style={{ color: "var(--text-3)", fontSize: 11 }}>{item.grupo}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmtR(item.declarado)}
                  </span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmtR(item.capturado)}
                  </span>
                  <span style={{
                    textAlign: "right", fontVariantNumeric: "tabular-nums",
                    color: item.ok ? "var(--text-3)" : "#f59e0b",
                    fontWeight: item.ok ? 400 : 600,
                  }}>
                    {item.ok ? "—" : fmtR(item.diferenca)}
                  </span>
                  <span style={{ textAlign: "center" }}>
                    {item.ok ? "✅" : "⚠️"}
                  </span>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div style={{
              fontSize: 12, color: "var(--text-3)", marginBottom: 16,
              display: "flex", gap: 16, flexWrap: "wrap",
            }}>
              <span>Realizado: <strong style={{ color: "var(--text)" }}>{reviewData.realizadoRows.length}</strong> linhas</span>
              <span>Orçado: <strong style={{ color: "var(--text)" }}>{reviewData.orcadoRows.length}</strong> linhas</span>
              <span>Meses realizado: <strong style={{ color: "var(--text)" }}>{monthsRealizado.map(mesAnoLabel).join(", ")}</strong></span>
            </div>

            {/* Descriptions list (informativo) */}
            <details style={{ marginBottom: 16 }}>
              <summary style={{ fontSize: 12, color: "var(--text-3)", cursor: "pointer", userSelect: "none" }}>
                Linhas capturadas ({reviewData.descricoes.length} combinações grupo|descrição)
              </summary>
              <div style={{
                marginTop: 8, maxHeight: 160, overflowY: "auto",
                border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px",
              }}>
                {reviewData.descricoes.map(d => (
                  <div key={d} style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.8 }}>{d}</div>
                ))}
              </div>
            </details>

            {/* Divergence note */}
            {reviewData.reconciliation.some(r => !r.ok) && (
              <div style={{
                background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)",
                borderRadius: 6, padding: "8px 12px", marginBottom: 16,
                fontSize: 12, color: "#f59e0b", lineHeight: 1.5,
              }}>
                ⚠️ Há divergências entre o total declarado e as linhas capturadas.
                Isso pode ocorrer no grupo PESSOAL (subtotal parcial) ou se alguma linha não foi mapeada.
                O import continua disponível — verifique antes de confirmar.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                style={{
                  padding: "8px 18px", borderRadius: 6, border: "1px solid var(--border)",
                  background: "transparent", color: "var(--text-3)", cursor: "pointer", fontSize: 13,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  padding: "8px 20px", borderRadius: 6, border: "none",
                  background: "var(--brand)", color: "#fff",
                  cursor: "pointer", fontSize: 13, fontWeight: 600,
                }}
              >
                Confirmar Importação
              </button>
            </div>
          </>
        )}

        {/* ── Upload progress ── */}
        {status === "uploading" && (
          <div style={{ padding: "8px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, color: "var(--text-3)" }}>
              <span>{phase}</span>
              <span>{importedRows} / {totalRows}</span>
            </div>
            <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: "var(--brand)",
                width: `${progress}%`, transition: "width 0.3s ease",
              }} />
            </div>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 10, textAlign: "center" }}>
              {progress}% concluído
            </p>
          </div>
        )}

        {/* ── Done ── */}
        {status === "done" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
              {importedRows} linhas importadas
            </p>
            {monthsRealizado.length > 0 && (
              <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>
                Realizado: {monthsRealizado.map(mesAnoLabel).join(", ")}
              </p>
            )}
            {monthsOrcado.length > 0 && (
              <p style={{ fontSize: 12, color: "var(--text-3)" }}>
                Orçado: {monthsOrcado.map(mesAnoLabel).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
