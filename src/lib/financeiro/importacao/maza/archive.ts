import JSZip from "jszip"
import { workbook } from "./normalizers"
import { parseContasPagar, parseNfEntrada, parseReceita } from "./parsers"
import type { ImportWarning, MazaBatchPreview } from "./types"

export async function previewMazaArchive(name: string, bytes: Buffer): Promise<MazaBatchPreview> {
  const zip = await JSZip.loadAsync(bytes)
  const excelEntries = Object.values(zip.files).filter((entry) => !entry.dir && /\.xlsx?$/i.test(entry.name))
  const files = excelEntries.map((entry) => entry.name)
  const warnings: ImportWarning[] = []
  const key = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
  const kind = key.includes("NF ENTRADA") ? "nf_entrada" : key.includes("CONTAS A PAGAR") ? "contas_pagar"
    : key.includes("RECEITA") ? "receita" : key.includes("FOLHA") ? "folha" : "unknown"

  if (!excelEntries.length) {
    warnings.push({ code: "EMPTY_ARCHIVE", message: "O ZIP não contém arquivos Excel para leitura." })
    return { kind, files, records: [], warnings, totals: {} }
  }

  const records = [] as Array<any>
  for (const entry of excelEntries) {
    const wb = workbook(await entry.async("nodebuffer"))
    if (kind === "nf_entrada") records.push(...parseNfEntrada(wb, entry.name, warnings))
    else if (kind === "contas_pagar") records.push(...parseContasPagar(wb, entry.name, warnings))
    else if (kind === "receita") records.push(...parseReceita(wb, entry.name, warnings))
    else warnings.push({ code: "UNSUPPORTED_ARCHIVE", message: "Layout do pacote não reconhecido.", file: entry.name })
  }

  const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
  const totals: Record<string, number> = { registros: records.length }
  if (kind === "nf_entrada") totals.valor = cents(records.reduce((sum, row) => sum + row.valorTotal, 0))
  if (kind === "contas_pagar") totals.valor = cents(records.reduce((sum, row) => sum + row.valorParcela, 0))
  if (kind === "receita") {
    totals.receitaBruta = cents(records.reduce((sum, row) => sum + row.receitaBruta, 0))
    totals.receitaLiquida = cents(records.reduce((sum, row) => sum + row.receitaLiquida, 0))
    totals.taxaServico = cents(records.reduce((sum, row) => sum + row.taxaServico, 0))
  }
  return { kind, files, records, warnings, totals }
}
