"use client"

import { useRef, useState } from "react"
import * as XLSX from "xlsx"
import { deleteDreLinhasRealizado, insertDreLinhas } from "@/app/financeiro/dre/actions"
import type { DreLinhaInsert } from "@/app/financeiro/dre/actions"

const UNIT_TESTE = "00000000-0000-0000-0000-000000000099"

// Excel section header → banco grupo
const GRUPO_MAP: Record<string, string> = {
  "FATURAMENTO":                   "RECEITA",
  "CUSTOS DOS PRODUTOS VENDIDOS":  "CMV",
  "PESSOAL":                       "PESSOAL",
  "OCUPAÇÃO":                      "OCUPAÇÃO",
  "UTILIDADES/ CONSUMO":           "UTILIDADES",
  "MANUTENÇÃO":                    "MANUTENÇÃO",
  "OPERAÇÃO":                      "OPERAÇÃO",
  "ADMINISTRATIVA":                "ADMINISTRATIVA",
  "MARKETING":                     "MARKETING",
  "TAXAS CARTÃO DE CRÉDITO":       "TAXAS CARTÃO",
  "DESPESAS FINANCEIRAS":          "DESP. FINANCEIRAS",
  "IMPOSTOS":                      "IMPOSTOS",
}

// descricao Excel → descricao banco
const DESCRICAO_MAP: Record<string, string> = {
  "Prestação de Serviço Pessoa Jurídica OP":  "PJ Operacional",
  "Prestação de Serviço Pessoa Jurídica ADM": "PJ Administrativo",
  "Prestação de Servço Informatica":          "Prestação de Serviço TI",
  "Correio/Cartório/Protestos":               "Correio/Cartório",
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

function isGroupHeader(s: string): boolean {
  const t = s.trim()
  return t.length > 2 && t === t.toUpperCase()
}

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
    // Match "JAN 2026", "MAIO 2026", etc. — some months use 3 letters, MAIO uses 4
    const m = cell.match(/^(JAN|FEV|MAR|ABR|MAIO?|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})$/)
    if (m) {
      const mesNum = MES_MAP[m[1]!]
      const year   = m[2]!
      if (mesNum !== undefined) {
        cols.push({ mesAno: `${year}-${mesNum}`, colIdx: i, avIdx: i + 1 })
      }
    }
  }
  return cols
}

function parseBaseRealizado(wb: XLSX.WorkBook): DreLinhaInsert[] {
  const ws = wb.Sheets["Base Realizado"]
  if (!ws) throw new Error("Aba 'Base Realizado' não encontrada no arquivo.")

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })

  // Scan first 15 rows for the header row that contains month names.
  // Do NOT hardcode row index — SheetJS may omit empty rows before it,
  // and the column offset (A=0 vs B=0) can vary by xlsx version.
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
      // Locate DESCRIÇÃO and CONTA in the same header row
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

  if (monthCols.length === 0) throw new Error("Nenhuma coluna de mês detectada (procura até a linha 15).")
  // If DESCRIÇÃO/CONTA headers not found, fall back to relative offsets from first month col
  if (descColIdx  === -1) descColIdx  = monthCols[0]!.colIdx - 2
  if (contaColIdx === -1) contaColIdx = monthCols[0]!.colIdx - 1

  const result: DreLinhaInsert[] = []
  let currentGrupo: string | null = null

  for (let rowIdx = headerRowIdx + 1; rowIdx < raw.length; rowIdx++) {
    const row = (raw[rowIdx] ?? []) as unknown[]
    const descRaw = toStr(row[descColIdx])
    if (!descRaw) continue

    const desc = descRaw.trim()

    if (isGroupHeader(desc)) {
      currentGrupo = GRUPO_MAP[desc] ?? null
      continue
    }

    if (!currentGrupo) continue

    const contaRaw = toStr(row[contaColIdx])
    const conta = contaRaw && !contaRaw.startsWith("x.x.") ? contaRaw : null
    const descBanco = DESCRICAO_MAP[desc] ?? desc

    for (const mc of monthCols) {
      const val = toNum(row[mc.colIdx])
      if (val === null) continue  // skip months with no entry

      result.push({
        unit_id:       UNIT_TESTE,
        mes_ano:       mc.mesAno,
        tipo:          "realizado",
        grupo:         currentGrupo,
        descricao:     descBanco,
        conta,
        valor:         val,
        av_percentual: toNum(row[mc.avIdx]),
        custo_tipo:    null,
      })
    }
  }

  return result
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export function DreImportModal({ onClose, onSuccess }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName]       = useState<string | null>(null)
  const [status, setStatus]           = useState<"idle" | "parsing" | "uploading" | "done" | "error">("idle")
  const [progress, setProgress]       = useState(0)
  const [totalRows, setTotalRows]     = useState(0)
  const [importedRows, setImportedRows] = useState(0)
  const [errorMsg, setErrorMsg]       = useState<string | null>(null)
  const [monthsFound, setMonthsFound] = useState<string[]>([])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) { setFileName(f.name); setErrorMsg(null) }
  }

  async function handleImport() {
    const f = inputRef.current?.files?.[0]
    if (!f) return

    setErrorMsg(null)
    setStatus("parsing")

    try {
      const buf = await f.arrayBuffer()
      const wb  = XLSX.read(buf, { type: "array" })

      const allRows = parseBaseRealizado(wb)

      if (allRows.length === 0) {
        setErrorMsg("Nenhuma linha válida encontrada na aba 'Base Realizado'.")
        setStatus("error")
        return
      }

      const months = [...new Set(allRows.map(r => r.mes_ano))].sort()
      setMonthsFound(months)
      setTotalRows(allRows.length)
      setStatus("uploading")

      // Delete all existing realizado rows for UNIT_TESTE
      const del = await deleteDreLinhasRealizado(UNIT_TESTE)
      if (!del.ok) {
        setErrorMsg(del.error ?? "Erro ao limpar registros existentes.")
        setStatus("error")
        return
      }

      // Insert in batches of 500
      const BATCH = 500
      let imported = 0
      for (let i = 0; i < allRows.length; i += BATCH) {
        const batch = allRows.slice(i, i + BATCH)
        const result = await insertDreLinhas(batch)
        if (!result.ok) {
          setErrorMsg(result.error ?? "Erro ao inserir lote.")
          setStatus("error")
          return
        }
        imported += batch.length
        setImportedRows(imported)
        setProgress(Math.round((imported / allRows.length) * 100))
      }

      setStatus("done")
      setTimeout(() => { onSuccess(); onClose() }, 1500)
    } catch (e) {
      setErrorMsg(String(e))
      setStatus("error")
    }
  }

  const busy = status === "parsing" || status === "uploading"

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
        width: 500,
        maxWidth: "90vw",
      }}>
        {/* Title row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
            Importar DRE Realizado (.xlsx)
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
        <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 20 }}>
          unit_id: <code style={{ fontSize: 10 }}>{UNIT_TESTE}</code>
        </p>

        {(status === "idle" || status === "error") && (
          <>
            <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16, lineHeight: 1.5 }}>
              Selecione o arquivo Excel da DRE. A aba <strong>"Base Realizado"</strong> será lida
              e todos os meses com dados serão importados.
            </p>

            <label style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              border: "2px dashed var(--border)", borderRadius: 8, padding: "24px 16px",
              cursor: "pointer", gap: 8, marginBottom: 16,
              background: fileName ? "var(--surface-2)" : "transparent",
            }}>
              <span style={{ fontSize: 28 }}>📂</span>
              <span style={{ fontSize: 13, color: "var(--text-3)" }}>
                {fileName ?? "Clique ou arraste o arquivo .xlsx"}
              </span>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={handleFileChange}
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
                style={{
                  padding: "8px 18px", borderRadius: 6, border: "1px solid var(--border)",
                  background: "transparent", color: "var(--text-3)", cursor: "pointer", fontSize: 13,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={!fileName}
                style={{
                  padding: "8px 20px", borderRadius: 6, border: "none",
                  background: fileName ? "var(--brand)" : "var(--surface-2)",
                  color: fileName ? "#fff" : "var(--text-3)",
                  cursor: fileName ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600,
                }}
              >
                Importar
              </button>
            </div>
          </>
        )}

        {status === "parsing" && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-3)", fontSize: 14 }}>
            Lendo aba "Base Realizado"…
          </div>
        )}

        {status === "uploading" && (
          <div style={{ padding: "8px 0" }}>
            {monthsFound.length > 0 && (
              <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>
                Meses detectados: {monthsFound.join(", ")}
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, color: "var(--text-3)" }}>
              <span>Importando linhas…</span>
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
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
              {importedRows} linhas importadas
            </p>
            <p style={{ fontSize: 13, color: "var(--text-3)" }}>
              Meses: {monthsFound.join(", ")}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
