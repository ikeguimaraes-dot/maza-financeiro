"use server"

import { requireUser } from "@maza/auth/server"
import { createServiceClient } from "@maza/db/supabase/server"
import { calcularPagar, type OrigemTitulo, type PagarResultado } from "@/lib/financeiro/pagar/calcularPagar"

// Só leitura — requireUser() + createServiceClient() por cima da lógica
// pura em src/lib/financeiro/pagar/calcularPagar.ts, mesmo padrão de
// src/app/financeiro/razao/actions.ts. createServiceClient() (não
// createSupabaseServerClient(), usado pela implementação antiga desta
// tela) — mesmo padrão de Cockpit/Divergências/Conferência, pra não
// depender de RLS bater com a role da sessão.
export async function getPagar(
  unitId: string,
  competencia: string,
  origem: OrigemTitulo
): Promise<PagarResultado | null> {
  await requireUser()
  const db = createServiceClient()
  if (!db) return null
  return calcularPagar(db, unitId, competencia, origem)
}
