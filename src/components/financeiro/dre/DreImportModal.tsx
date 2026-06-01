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
  // Determine avIdx: if next col is NOT another month col, treat it as AV
  const monthColIdxSet = new Set(cols.map(c => c.colIdx))
  for (const col of cols) {
    const nextIdx = col.colIdx + 1
    if (!monthColIdxSet.has(nextIdx)) {
      col.avIdx = nextIdx
    }
  }
  return cols
}

function parseSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  tipo: "realizado" | "orcado",
  unitId: string
): DreLinhaInsert[] {
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

  // Buffer per-month so we can filter sparse months (realizado only)
  const byMonth = new Map<string, DreLinhaInsert[]>()
  for (const mc of monthCols) byMonth.set(mc.mesAno, [])

  let currentGrupo: string | null = null

  for (let rowIdx = headerRowIdx + 1; rowIdx < raw.length; rowIdx++) {
    const row = (raw[rowIdx] ?? []) as unknown[]
    const descRaw = toStr(row[descColIdx])
    if (!descRaw) continue

    const desc = descRaw.trim()

    if (desc in GRUPO_MAP) {
      currentGrupo = GRUPO_MAP[desc]!
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

  const result: DreLinhaInsert[] = []
  for (const [, rows] of byMonth) {
    // For realizado, discard months where fewer than 10 rows have a non-zero value
    // (Excel artefact: future months carry a single stray value)
    if (tipo === "realizado") {
      const nonZero = rows.filter(r => r.valor !== null && r.valor !== 0).length
      if (nonZero < 10) continue
    }
    result.push(...rows)
  }

  return result
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  onSuccess: () => void
}

type Status = "idle" | "loading_unit" | "ready" | "parsing" | "uploading" | "done" | "error"

export function DreImportModal({ onClose, onSuccess }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName]       = useState<string | null>(null)
  const [unitId, setUnitId]           = useState<string | null>(null)
  const [status, setStatus]           = useState<Status>("idle")
  const [phase, setPhase]             = useState<string>("")
  const [progress, setProgress]       = useState(0)
  const [totalRows, setTotalRows]     = useState(0)
  const [importedRows, setImportedRows] = useState(0)
  const [errorMsg, setErrorMsg]       = useState<string | null>(null)
  const [monthsRealizado, setMonthsRealizado] = useState<string[]>([])
  const [monthsOrcado, setMonthsOrcado]       = useState<string[]>([])

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

      const realizadoRows = parseSheet(wb, "Base Realizado",       "realizado", unitId)
      const orcadoRows    = parseSheet(wb, "04 -Base Orçado 2026", "orcado",    unitId)

      const total = realizadoRows.length + orcadoRows.length
      if (total === 0) {
        setErrorMsg("Nenhuma linha válida encontrada nas abas 'Base Realizado' e '04 -Base Orçado 2026'.")
        setStatus("error")
        return
      }

      setMonthsRealizado([...new Set(realizadoRows.map(r => r.mes_ano))].sort())
      setMonthsOrcado([...new Set(orcadoRows.map(r => r.mes_ano))].sort())
      setTotalRows(total)
      setStatus("uploading")

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
        width: 520,
        maxWidth: "90vw",
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
                  background: "transparent", color: "var(--text-3)", cursor: busy ? "not-allowed" : "pointer", fontSize: 13,
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
                  cursor: (fileName && unitId && !busy) ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600,
                }}
              >
                Importar
              </button>
            </div>
          </>
        )}

        {status === "parsing" && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-3)", fontSize: 14 }}>
            Lendo abas do Excel…
          </div>
        )}

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

        {status === "done" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
              {importedRows} linhas importadas
            </p>
            {monthsRealizado.length > 0 && (
              <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>
                Realizado: {monthsRealizado.join(", ")}
              </p>
            )}
            {monthsOrcado.length > 0 && (
              <p style={{ fontSize: 12, color: "var(--text-3)" }}>
                Orçado: {monthsOrcado.join(", ")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
