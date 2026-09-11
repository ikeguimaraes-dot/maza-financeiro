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

export type ContaBancaria = { id: string; banco: string; apelido: string | null }

export async function getContasBancarias(unitId: string): Promise<ContaBancaria[]> {
  await requireUser()
  const db = createServiceClient()
  if (!db) return []
  const { data } = await db
    .from("contas_bancarias")
    .select("id,banco,apelido")
    .eq("unit_id", unitId)
    .eq("ativo", true)
    .order("banco")
  return data ?? []
}
