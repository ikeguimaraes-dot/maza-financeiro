import type { ImportDocument } from "../core/types"

export type FolhaExtractedRow = {
  nome?: string
  funcao?: string
  divisao?: string
  admissao?: string | null
  salarioBase?: number
  totalProventos?: number
  tipo?: string
  isVaga?: boolean
}

export type FolhaNormalizedRow = {
  unit_id: string
  competencia: string
  tipo: string
  nome: string
  funcao: string
  divisao: string
  admissao: string | null
  salario: number
  custo_total: number
  is_vaga: boolean
}

export type FolhaPayload = {
  rows: FolhaNormalizedRow[]
}

export type FolhaImportDocument = ImportDocument<"payroll", FolhaPayload>

export type FolhaImportResult = {
  ok: true
  arquivos: number
  importados: number
  colaboradores: number
  competencia: string
}
