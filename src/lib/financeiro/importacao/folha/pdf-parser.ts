import { PDFParse } from "pdf-parse"
import type { BufferedImportFile } from "../core/types"
import type { FolhaExtractedRow } from "./types"
import { divisionFromRole, numberValue } from "./normalizers"

export async function parseFolhaPdf(file: BufferedImportFile): Promise<FolhaExtractedRow[]> {
  const parser = new PDFParse({ data: file.bytes })
  try {
    const result = await parser.getText()
    const pages = result.text.split(/\n-- \d+ of \d+ --\n/)
    const rows: FolhaExtractedRow[] = []

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex]!
      const name = page.match(/\n([A-ZÀ-Ü][A-ZÀ-Ü '.-]{3,})\nNome do Funcionário CBO/i)?.[1]?.trim()
      const admission = page.match(/Admissão:\s*(\d{2}\/\d{2}\/\d{4})[ \t]+([^\r\n]+)/i)
      const salary = page.match(/([\d.]+,\d{2})\s*\nSalário Base/i)?.[1]
      const earnings = page.match(/([\d.]+,\d{2})\s*\nSal\. Contr\. INSS/i)?.[1]
      if (!name || !salary || !earnings) continue

      const role = admission?.[2]?.trim() || "NAO INFORMADO"
      const [day, month, year] = (admission?.[1] ?? "").split("/")
      const moneyBefore = (labels: RegExp) => {
        const match = page.match(new RegExp(`([\\d.]+,\\d{2})\\s*\\n(?:${labels.source})`, "i"))
        return match?.[1] ? numberValue(match[1]) : 0
      }
      const moneyNear = (label: RegExp) => {
        const match = page.match(new RegExp(`${label.source}[^\\n]*(?:\\n[^\\n]*){0,3}?([\\d.]+,\\d{2})`, "i"))
        return match?.[1] ? numberValue(match[1]) : 0
      }
      const gorjeta = moneyNear(/gorjeta(?:s)?/i)
      rows.push({
        nome: name,
        funcao: role,
        divisao: divisionFromRole(role),
        admissao: day && month && year ? `${year}-${month}-${day}` : null,
        salarioBase: numberValue(salary),
        totalProventos: moneyBefore(/Total\s+(?:de\s+)?(?:Proventos|Vencimentos)/) || numberValue(earnings),
        totalDescontos: moneyBefore(/Total\s+(?:de\s+)?Descontos/),
        valorLiquido: moneyBefore(/(?:Valor\s+)?L[ií]quido/),
        baseInss: moneyBefore(/Base\s+(?:de\s+)?(?:C[aá]lc\.\s+)?INSS/),
        baseFgts: moneyBefore(/Base\s+(?:de\s+)?(?:C[aá]lc\.\s+)?FGTS/),
        fgtsMes: moneyBefore(/FGTS\s+(?:do\s+)?M[eê]s/),
        baseIrrf: moneyBefore(/Base\s+(?:de\s+)?(?:C[aá]lc\.\s+)?IRRF/),
        gorjeta,
        verbas: gorjeta > 0 ? [{ descricao: "Gorjeta", provento: gorjeta }] : [],
        sourceFileName: file.name,
        sourcePage: pageIndex + 1,
        sourceText: page,
      })
    }

    return rows
  } finally {
    await parser.destroy()
  }
}
