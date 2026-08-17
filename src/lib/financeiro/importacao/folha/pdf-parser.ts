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

    for (const page of pages) {
      const name = page.match(/\n([A-ZÀ-Ü][A-ZÀ-Ü '.-]{3,})\nNome do Funcionário CBO/i)?.[1]?.trim()
      const admission = page.match(/Admissão:\s*(\d{2}\/\d{2}\/\d{4})[ \t]+([^\r\n]+)/i)
      const salary = page.match(/([\d.]+,\d{2})\s*\nSalário Base/i)?.[1]
      const earnings = page.match(/([\d.]+,\d{2})\s*\nSal\. Contr\. INSS/i)?.[1]
      if (!name || !salary || !earnings) continue

      const role = admission?.[2]?.trim() || "NAO INFORMADO"
      const [day, month, year] = (admission?.[1] ?? "").split("/")
      rows.push({
        nome: name,
        funcao: role,
        divisao: divisionFromRole(role),
        admissao: day && month && year ? `${year}-${month}-${day}` : null,
        salarioBase: numberValue(salary),
        totalProventos: numberValue(earnings),
      })
    }

    return rows
  } finally {
    await parser.destroy()
  }
}
