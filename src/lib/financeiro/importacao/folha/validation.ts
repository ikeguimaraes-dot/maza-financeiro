import type { ImportSourceFormat } from "../core/types"
import { detectSourceFormat } from "../core/files"
import { ImportError } from "../core/errors"

export const FOLHA_MAX_TOTAL_BYTES = 50 * 1024 * 1024

export type FolhaInputMode = "pdf-batch" | "spreadsheet"

export function validateFolhaFiles(files: File[]): FolhaInputMode {
  if (files.length === 0) {
    throw new ImportError("Selecione ao menos um arquivo.", 400, "FILES_REQUIRED")
  }

  const formats = files.map((file) => detectSourceFormat(file.name))
  const allPdfs = formats.every((format) => format === "pdf")
  const spreadsheetFormats: ImportSourceFormat[] = ["xlsx", "xls", "csv"]
  const singleSpreadsheet = files.length === 1 && spreadsheetFormats.includes(formats[0]!)

  if (!allPdfs && !singleSpreadsheet) {
    throw new ImportError(
      "Envie PDFs ou uma unica planilha XLSX, XLS ou CSV por vez.",
      400,
      "INVALID_FILE_COMBINATION",
    )
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  if (totalSize > FOLHA_MAX_TOTAL_BYTES) {
    throw new ImportError(
      "O total dos arquivos nao pode ultrapassar 50 MB.",
      413,
      "FILES_TOO_LARGE",
    )
  }

  return allPdfs ? "pdf-batch" : "spreadsheet"
}

export function validateCompetence(month: number, year: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    throw new ImportError("Unidade e competencia sao obrigatorias.", 400, "INVALID_COMPETENCE")
  }
  return `${year}-${String(month).padStart(2, "0")}`
}
