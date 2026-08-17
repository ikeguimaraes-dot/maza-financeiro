import * as XLSX from "xlsx"
import type { BufferedImportFile } from "../core/types"
import type { FolhaExtractedRow } from "./types"
import { dateValue, numberValue, textValue } from "./normalizers"

export function parseFolhaSpreadsheet(file: BufferedImportFile): FolhaExtractedRow[] {
  const workbook = XLSX.read(file.bytes, { type: "array", cellDates: false })
  const sheet = workbook.Sheets["Base Folha"] ?? workbook.Sheets[workbook.SheetNames[0]!]
  if (!sheet) return []

  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true })
  const result: FolhaExtractedRow[] = []

  // Formato oficial: dados a partir da linha 5; tipo, nome, funcao, divisao,
  // admissao, salario na coluna 7 e custo total na coluna 26.
  for (let index = 4; index < raw.length; index++) {
    const row = raw[index] ?? []
    const nome = textValue(row[1])
    const salario = numberValue(row[6])
    if (!nome || salario <= 0) continue
    result.push({
      tipo: textValue(row[0]) || "CLT",
      nome,
      funcao: textValue(row[2]),
      divisao: textValue(row[3]),
      admissao: dateValue(row[4]),
      salarioBase: salario,
      totalProventos: numberValue(row[25]) || salario,
      isVaga: nome.toLowerCase().includes("vaga"),
    })
  }

  return result
}
