import { bufferImportFile } from "../core/files"
import { ImportError } from "../core/errors"
import type { BufferedImportFile, ImportWarning } from "../core/types"
import { parseFolhaPdf } from "./pdf-parser"
import { parseFolhaSpreadsheet } from "./spreadsheet-parser"
import type {
  FolhaExtractedRow,
  FolhaImportDocument,
  FolhaImportResult,
  FolhaNormalizedRow,
} from "./types"
import type { FolhaImportRepository } from "./repository"
import { validateCompetence, validateFolhaFiles } from "./validation"

export type ImportFolhaInput = {
  files: File[]
  unitId: string
  month: number
  year: number
}

export class ImportFolhaService {
  constructor(private readonly repository: FolhaImportRepository) {}

  async execute(input: ImportFolhaInput): Promise<FolhaImportResult> {
    if (!input.unitId) {
      throw new ImportError("Unidade e competencia sao obrigatorias.", 400, "UNIT_REQUIRED")
    }

    const mode = validateFolhaFiles(input.files)
    const competence = validateCompetence(input.month, input.year)
    const bufferedFiles = await Promise.all(input.files.map(bufferImportFile))
    const warnings: ImportWarning[] = []
    const extracted = mode === "pdf-batch"
      ? await this.parsePdfBatch(bufferedFiles, warnings)
      : parseFolhaSpreadsheet(bufferedFiles[0]!)

    if (extracted.length === 0) {
      throw new ImportError(
        "Nenhum recibo de pagamento foi reconhecido nos arquivos.",
        422,
        "NO_PAYROLL_ROWS",
      )
    }

    const rows = extracted.map((row) => normalizeFolhaRow(row, input.unitId, competence))
    const document: FolhaImportDocument = {
      schemaVersion: 1,
      documentType: "payroll",
      sourceFormat: bufferedFiles[0]!.format,
      unitId: input.unitId,
      competence,
      sourceFiles: bufferedFiles.map(({ bytes: _bytes, format: _format, ...file }) => file),
      payload: { rows },
      warnings,
    }

    const imported = await this.repository.replace(document, bufferedFiles)
    return {
      ok: true,
      arquivos: input.files.length,
      importados: imported,
      colaboradores: rows.filter((row) => !row.is_vaga).length,
      competencia: competence,
    }
  }

  private async parsePdfBatch(
    files: BufferedImportFile[],
    warnings: ImportWarning[],
  ): Promise<FolhaExtractedRow[]> {
    const results = await Promise.all(files.map(async (file) => ({
      file,
      rows: await parseFolhaPdf(file),
    })))

    for (const result of results) {
      if (result.rows.length === 0) {
        warnings.push({
          code: "PDF_WITHOUT_PAYROLL_ROWS",
          message: "Nenhum recibo reconhecido neste PDF.",
          fileName: result.file.name,
        })
      }
    }
    return results.flatMap((result) => result.rows)
  }
}

export function normalizeFolhaRow(
  item: FolhaExtractedRow,
  unitId: string,
  competence: string,
): FolhaNormalizedRow {
  const salary = Number(item.salarioBase) || 0
  return {
    unit_id: unitId,
    competencia: competence,
    tipo: item.tipo || "CLT",
    nome: item.nome?.trim() || "NAO INFORMADO",
    funcao: item.funcao?.trim() || "NAO INFORMADO",
    divisao: item.divisao?.trim().toUpperCase() || "NAO INFORMADO",
    admissao: item.admissao || null,
    salario: salary,
    custo_total: Number(item.totalProventos) || salary,
    total_proventos: Number(item.totalProventos) || salary,
    total_descontos: Number(item.totalDescontos) || 0,
    valor_liquido: Number(item.valorLiquido) || Math.max(0, (Number(item.totalProventos) || salary) - (Number(item.totalDescontos) || 0)),
    base_inss: Number(item.baseInss) || 0,
    base_fgts: Number(item.baseFgts) || 0,
    fgts_mes: Number(item.fgtsMes) || 0,
    base_irrf: Number(item.baseIrrf) || 0,
    gorjeta: Number(item.gorjeta) || 0,
    verbas: item.verbas ?? [],
    documento_nome: item.sourceFileName ?? null,
    documento_pagina: item.sourcePage ?? null,
    texto_origem: item.sourceText ?? null,
    is_vaga: item.isVaga ?? false,
  }
}
