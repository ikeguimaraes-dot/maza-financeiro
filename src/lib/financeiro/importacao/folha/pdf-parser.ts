import type { BufferedImportFile } from "../core/types"
import type { FolhaExtractedRow } from "./types"
import { divisionFromRole, numberValue } from "./normalizers"

type PositionedText = { text: string; x: number; y: number }

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
const isMoney = (value: string) => /^-?[\d.]+,\d{2}$/.test(value.trim())

function nearestMoney(items: PositionedText[], label: RegExp): number {
  const target = items.find((item) => label.test(normalize(item.text)))
  if (!target) return 0

  const candidate = items
    .filter((item) => isMoney(item.text) && item.y < target.y && target.y - item.y <= 18 && Math.abs(item.x - target.x) <= 130)
    .sort((a, b) => (target.y - a.y) - (target.y - b.y) || Math.abs(a.x - target.x) - Math.abs(b.x - target.x))[0]
  return candidate ? numberValue(candidate.text) : 0
}

function extractVerbas(items: PositionedText[]) {
  const header = items.find((item) => normalize(item.text) === "CODIGO" && item.x < 55)
  if (!header) return []

  const totalLabel = items.find((item) => /TOTAL DE (?:VENCIMENTOS|PROVENTOS)/.test(normalize(item.text)))
  const lowerY = totalLabel?.y ?? header.y - 200
  const codes = items.filter((item) => (
    item.x < 55 && /^\d{1,5}$/.test(item.text.trim()) && item.y < header.y - 2 && item.y > lowerY + 20
  ))

  return codes.map((code) => {
    const sameLine = items.filter((item) => Math.abs(item.y - code.y) <= 1.8)
    const description = sameLine.filter((item) => item.x >= 55 && item.x < 300).sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").trim()
    const reference = sameLine.filter((item) => item.x >= 300 && item.x < 380).sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").trim()
    const proventoText = sameLine.find((item) => item.x >= 380 && item.x < 465 && isMoney(item.text))?.text
    const descontoText = sameLine.find((item) => item.x >= 465 && isMoney(item.text))?.text
    return {
      codigo: code.text.trim(),
      descricao: description || `Rubrica ${code.text.trim()}`,
      referencia: reference || undefined,
      provento: proventoText ? numberValue(proventoText) : undefined,
      desconto: descontoText ? numberValue(descontoText) : undefined,
    }
  }).filter((item) => item.descricao && (item.provento !== undefined || item.desconto !== undefined))
}

function employeeHeader(items: PositionedText[]) {
  const nameLabel = items.find((item) => /^Nome do Funcion.rio$/i.test(item.text))
  const admissionLabel = items.find((item) => /^Admiss.o:$/i.test(item.text))
  if (!nameLabel) return null

  const name = items.filter((item) => Math.abs(item.y - (nameLabel.y - 10)) <= 2 && item.x >= 55 && item.x < 370)
    .sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").trim()
  const admission = admissionLabel
    ? items.find((item) => Math.abs(item.y - admissionLabel.y) <= 2 && item.x > admissionLabel.x && /^\d{2}\/\d{2}\/\d{4}$/.test(item.text))?.text
    : undefined
  const role = admissionLabel
    ? items.filter((item) => Math.abs(item.y - admissionLabel.y) <= 2 && item.x >= 55 && item.x < admissionLabel.x - 15)
      .sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").trim()
    : ""
  return name ? { name, admission, role: role || "NAO INFORMADO" } : null
}

export async function parseFolhaPdf(file: BufferedImportFile): Promise<FolhaExtractedRow[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(file.bytes) })
  const document = await loadingTask.promise
  const rows: FolhaExtractedRow[] = []

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = content.items.map((raw) => ("str" in raw ? raw.str : "")).filter(Boolean).join("\n")
      const height = page.getViewport({ scale: 1 }).height
      const items: PositionedText[] = content.items.flatMap((raw) => {
        if (!("str" in raw) || !raw.str.trim() || !("transform" in raw)) return []
        return [{ text: raw.str.trim(), x: raw.transform[4], y: raw.transform[5] }]
      })
      // O recibo aparece duas vezes na mesma página. Lemos somente a via superior.
      const upperItems = items.filter((item) => item.y >= height / 2)
      const header = employeeHeader(upperItems)
      if (!header) continue
      const [day, month, year] = (header.admission ?? "").split("/")
      const verbas = extractVerbas(upperItems)
      const gorjeta = verbas.filter((item) => /GORJETA|TAXA\s+(?:DE\s+)?SERVICO/.test(normalize(item.descricao))).reduce((sum, item) => sum + (item.provento ?? 0), 0)

      rows.push({
        nome: header.name,
        funcao: header.role,
        divisao: divisionFromRole(header.role),
        admissao: day && month && year ? `${year}-${month}-${day}` : null,
        salarioBase: nearestMoney(upperItems, /^SALARIO BASE$/),
        totalProventos: nearestMoney(upperItems, /^TOTAL DE (?:VENCIMENTOS|PROVENTOS)$/),
        totalDescontos: nearestMoney(upperItems, /^TOTAL DE DESCONTOS$/),
        valorLiquido: nearestMoney(upperItems, /^VALOR LIQUIDO$/),
        baseInss: nearestMoney(upperItems, /^SAL\. CONTR\. INSS$/),
        baseFgts: nearestMoney(upperItems, /^BASE CALC\. FGTS$/),
        fgtsMes: nearestMoney(upperItems, /^F\.G\.T\.S DO MES$/),
        baseIrrf: nearestMoney(upperItems, /^BASE CALC\. IRRF$/),
        gorjeta,
        verbas,
        sourceFileName: file.name,
        sourcePage: pageNumber,
        sourceText: pageText,
      })
    }
    return rows
  } finally {
    await loadingTask.destroy()
  }
}
