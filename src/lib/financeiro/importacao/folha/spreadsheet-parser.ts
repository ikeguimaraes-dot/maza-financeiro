import * as XLSX from "xlsx"
import type { BufferedImportFile } from "../core/types"
import type { FolhaExtractedRow } from "./types"
import { dateValue, numberValue, textValue } from "./normalizers"

export function folhaSpreadsheetCompetences(file: BufferedImportFile): string[] {
  const workbook = XLSX.read(file.bytes, { type: "array", cellDates: false })
  if (workbook.Sheets["Base Folha"]) return []
  const competences = new Set<string>()
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const title = textValue(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true })[0]?.[1]) ?? ""
    const match = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().match(/(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\/(20\d{2})/)
    if (!match) continue
    const month = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"].indexOf(match[1]!) + 1
    if (month > 0) competences.add(`${match[2]}-${String(month).padStart(2, "0")}`)
  }
  return [...competences].sort()
}

export function parseFolhaSpreadsheet(file: BufferedImportFile, competence: string): FolhaExtractedRow[] {
  const workbook = XLSX.read(file.bytes, { type: "array", cellDates: false })
  const officialSheet = workbook.Sheets["Base Folha"]
  if (!officialSheet) return parsePaymentControl(workbook, file.name, competence)
  const sheet = officialSheet
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

function parsePaymentControl(workbook: XLSX.WorkBook, fileName: string, competence: string): FolhaExtractedRow[] {
  const monthNames = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"]
  const month = Number(competence.slice(5, 7))
  const monthName = monthNames[month - 1]
  if (!monthName) return []
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase()
  const selectedSheets = workbook.SheetNames.filter((name) => normalize(name).includes(monthName))
  const employees = new Map<string, FolhaExtractedRow>()

  for (const sheetName of selectedSheets) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true })
    const paymentType = normalize(sheetName).includes("VALE") ? "VALE" : "PAGAMENTO"
    for (const row of rows.slice(2)) {
      const nome = textValue(row[1])
      if (typeof row[0] !== "number" || !nome) continue
      const key = normalize(nome)
      const current = employees.get(key) ?? {
        nome, tipo: "INTERNO", salarioBase: 0, totalProventos: 0,
        totalDescontos: 0, valorLiquido: 0, verbas: [], sourceFileName: fileName,
      }
      const valorLiquido = numberValue(row[2]), presente = numberValue(row[3])
      const valeTransporte = numberValue(row[4]), desconto = numberValue(row[5])
      const totalGeral = numberValue(row[7])
      current.salarioBase = (current.salarioBase ?? 0) + valorLiquido
      current.totalProventos = (current.totalProventos ?? 0) + totalGeral
      current.totalDescontos = (current.totalDescontos ?? 0) + desconto
      current.valorLiquido = (current.valorLiquido ?? 0) + totalGeral
      if (valorLiquido) current.verbas!.push({ descricao: `${paymentType} - VALOR LÍQUIDO`, provento: valorLiquido })
      if (presente) current.verbas!.push({ descricao: `${paymentType} - PRESENTE`, provento: presente })
      if (valeTransporte) current.verbas!.push({ descricao: `${paymentType} - VT`, provento: valeTransporte })
      if (desconto) current.verbas!.push({ descricao: `${paymentType} - DESCONTO`, desconto })
      employees.set(key, current)
    }
  }
  return [...employees.values()]
}
