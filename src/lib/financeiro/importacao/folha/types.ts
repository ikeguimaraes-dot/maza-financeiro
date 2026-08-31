import type { ImportDocument } from "../core/types"

export type FolhaExtractedRow = {
  nome?: string
  funcao?: string
  divisao?: string
  admissao?: string | null
  salarioBase?: number
  totalProventos?: number
  totalDescontos?: number
  valorLiquido?: number
  baseInss?: number
  baseFgts?: number
  fgtsMes?: number
  baseIrrf?: number
  gorjeta?: number
  verbas?: Array<{ codigo?: string; descricao: string; referencia?: string; provento?: number; desconto?: number }>
  sourceFileName?: string
  sourcePage?: number
  sourceText?: string
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
  total_proventos: number
  total_descontos: number
  valor_liquido: number
  base_inss: number
  base_fgts: number
  fgts_mes: number
  base_irrf: number
  gorjeta: number
  verbas: FolhaExtractedRow["verbas"]
  documento_nome: string | null
  documento_pagina: number | null
  texto_origem: string | null
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
