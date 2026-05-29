"use client"

import { useRef, useState } from "react"
import * as XLSX from "xlsx"
import { deleteProdutosMes, insertProdutos } from "@/app/financeiro/produtos/actions"
import type { ProdutoInsert } from "@/app/financeiro/produtos/actions"

interface ImportModalProps {
  unitId: string | null
  onClose: () => void
  onSuccess: () => void
}

const COL_MAP: Record<string, keyof ProdutoInsert> = {
  "Fantasia Fornecedor": "fornecedor_nome",
  "Nr. DANFE":           "nr_danfe",
  "V. Total DANFE":      "v_total_danfe",
  "D. Emissão":          "dt_emissao",
  "Item":                "item_codigo",
  "Descrição do Item":   "item_descricao",
  "Unidade Medida":      "unidade_medida",
  "Tipo Item":           "tipo_item",
  "Q. Embalagem":        "q_embalagem",
  "Q. Estoque":          "q_estoque",
  "V. Embalagem":        "v_embalagem",
  "V. Total Embalagem":  "v_total_embalagem",
  "V. Custo Médio":      "v_custo_medio",
  "V. Custo Compra":     "v_custo_compra",
  "V. Custo Total":      "v_custo_total",
  "% Variação":          "perc_variacao",
  "Calcula CMV":         "calcula_cmv",
  "Fornecedor":          "fornecedor_codigo",
  "C. Gerencial":        "codigo_gerencial",
  "Descrição C. Gerencial": "desc_gerencial",
  "Mês Lançamento":      "mes_lancamento",
  "Ano Lançamento":      "ano_lancamento",
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null
  return String(v).trim()
}

function parseBool(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null
  const s = String(v).trim().toLowerCase()
  if (s === "sim" || s === "s" || s === "true" || s === "1") return true
  if (s === "não" || s === "nao" || s === "n" || s === "false" || s === "0") return false
  return null
}

function parseSheet(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  })
  return raw
}

function mapRow(raw: Record<string, unknown>, unitId: string): ProdutoInsert | null {
  const mes = toNum(raw["Mês Lançamento"])
  const ano = toNum(raw["Ano Lançamento"])
  if (!mes || !ano) return null

  return {
    unit_id:            unitId,
    fornecedor_nome:    toStr(raw["Fantasia Fornecedor"]),
    nr_danfe:           toStr(raw["Nr. DANFE"]),
    v_total_danfe:      toNum(raw["V. Total DANFE"]),
    dt_emissao:         toStr(raw["D. Emissão"]),
    item_codigo:        toStr(raw["Item"]),
    item_descricao:     toStr(raw["Descrição do Item"]),
    unidade_medida:     toStr(raw["Unidade Medida"]),
    tipo_item:          toStr(raw["Tipo Item"]),
    q_embalagem:        toNum(raw["Q. Embalagem"]),
    q_estoque:          toNum(raw["Q. Estoque"]),
    v_embalagem:        toNum(raw["V. Embalagem"]),
    v_total_embalagem:  toNum(raw["V. Total Embalagem"]),
    v_custo_medio:      toNum(raw["V. Custo Médio"]),
    v_custo_compra:     toNum(raw["V. Custo Compra"]),
    v_custo_total:      toNum(raw["V. Custo Total"]),
    perc_variacao:      toNum(raw["% Variação"]),
    calcula_cmv:        parseBool(raw["Calcula CMV"]),
    fornecedor_codigo:  toStr(raw["Fornecedor"]),
    codigo_gerencial:   toStr(raw["C. Gerencial"]),
    desc_gerencial:     toStr(raw["Descrição C. Gerencial"]),
    mes_lancamento:     mes,
    ano_lancamento:     ano,
  }
}

export function ImportModal({ unitId, onClose, onSuccess }: ImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "parsing" | "uploading" | "done" | "error">("idle")
  const [progress, setProgress] = useState(0)
  const [totalRows, setTotalRows] = useState(0)
  const [importedRows, setImportedRows] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      setFileName(f.name)
      setErrorMsg(null)
    }
  }

  async function handleImport() {
    const f = inputRef.current?.files?.[0]
    if (!f) return

    setErrorMsg(null)

    if (!unitId) {
      setErrorMsg("Unidade não identificada. Faça login novamente.")
      setStatus("error")
      return
    }

    setStatus("parsing")

    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })

      const allRows: ProdutoInsert[] = []
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName]
        if (!sheet) continue
        const rawRows = parseSheet(sheet)
        for (const raw of rawRows) {
          const mapped = mapRow(raw, unitId)
          if (mapped) allRows.push(mapped)
        }
      }

      if (allRows.length === 0) {
        setErrorMsg("Nenhuma linha válida encontrada no arquivo.")
        setStatus("error")
        return
      }

      // Group by month so we can delete-then-insert per month (avoids ON CONFLICT duplicates)
      const byMonth = new Map<string, ProdutoInsert[]>()
      for (const row of allRows) {
        const key = `${row.ano_lancamento}-${row.mes_lancamento}`
        const bucket = byMonth.get(key) ?? []
        bucket.push(row)
        byMonth.set(key, bucket)
      }

      setTotalRows(allRows.length)
      setStatus("uploading")

      const BATCH = 500
      let imported = 0
      for (const rows of byMonth.values()) {
        const { mes_lancamento: mes, ano_lancamento: ano } = rows[0]!

        const del = await deleteProdutosMes(unitId, mes, ano)
        if (!del.ok) {
          setErrorMsg(del.error ?? "Erro ao limpar mês existente.")
          setStatus("error")
          return
        }
        console.log('[import] delete ok, inserindo', rows.length, 'linhas')

        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH)
          const result = await insertProdutos(batch)
          if (!result.ok) {
            setErrorMsg(result.error ?? "Erro ao importar lote.")
            setStatus("error")
            return
          }
          imported += batch.length
          setImportedRows(imported)
          setProgress(Math.round((imported / allRows.length) * 100))
        }
      }

      setStatus("done")
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1500)
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
        width: 480,
        maxWidth: "90vw",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
            Importar Produtos (.xlsx)
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

        {status === "idle" || status === "error" ? (
          <>
            <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16, lineHeight: 1.5 }}>
              Selecione o arquivo de Relatório de Produtos. Todas as abas (Janeiro, Fevereiro…) serão lidas automaticamente.
            </p>

            <label
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                border: "2px dashed var(--border)", borderRadius: 8, padding: "24px 16px",
                cursor: "pointer", gap: 8, marginBottom: 16,
                background: fileName ? "var(--surface-2)" : "transparent",
              }}
            >
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
        ) : status === "parsing" ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-3)", fontSize: 14 }}>
            Lendo arquivo…
          </div>
        ) : status === "uploading" ? (
          <div style={{ padding: "8px 0" }}>
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
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
              {importedRows} linhas importadas
            </p>
            <p style={{ fontSize: 13, color: "var(--text-3)" }}>
              Página será atualizada automaticamente.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
