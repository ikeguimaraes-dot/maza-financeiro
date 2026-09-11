"use server"

import { requireUser } from "@maza/auth/server"
import { createServiceClient } from "@maza/db/supabase/server"
import { calcularFluxo, type ResultadoFluxo } from "@/lib/financeiro/fluxo/calcularFluxo"

export type { ResultadoFluxo } from "@/lib/financeiro/fluxo/calcularFluxo"

// Só leitura — requireUser() + createServiceClient() por cima da lógica pura
// em src/lib/financeiro/fluxo/calcularFluxo.ts, mesmo padrão de
// src/app/financeiro/dre/divergencias/actions.ts.
export async function getFluxoCaixa(
  unitId: string,
  contaId: string | null,
  dataInicio: string,
  dataFim: string
): Promise<ResultadoFluxo | null> {
  await requireUser()
  const db = createServiceClient()
  if (!db) return null
  return calcularFluxo(db, unitId, contaId, dataInicio, dataFim)
}
