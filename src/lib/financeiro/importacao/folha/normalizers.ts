import * as XLSX from "xlsx"

export function textValue(value: unknown): string | undefined {
  const result = String(value ?? "").trim()
  return result || undefined
}

export function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const raw = String(value ?? "").trim()
  if (!raw) return 0
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw
  const result = Number(normalized)
  return Number.isFinite(result) ? result : 0
}

export function dateValue(value: unknown): string | null {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`
  }
  const raw = textValue(value)
  if (!raw) return null
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

export function divisionFromRole(role: string): string {
  const value = role.toUpperCase()
  if (/COZIN|SUSHI|CONFEIT|PARRIL|PADEIR|AUXILIAR DE COZINHA/.test(value)) return "COZINHA"
  if (/GAR[CÇ]OM|CUMIN|MAITRE|CHEFE DE FILA/.test(value)) return "SALAO"
  if (/BARMAN|BARTENDER|BARBACK|BAR /.test(value)) return "BAR"
  if (/FAXIN|LIMPEZA|SERVI[CÇ]OS GERAIS/.test(value)) return "LIMPEZA"
  if (/ADMIN|ESTOQUI|COMPR|FINANCEIR|CAIXA/.test(value)) return "ADM"
  return "NAO INFORMADO"
}
