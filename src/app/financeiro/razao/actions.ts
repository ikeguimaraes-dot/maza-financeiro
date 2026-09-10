"use server"

import { requireUser } from "@maza/auth/server"
import { createServiceClient } from "@maza/db/supabase/server"
import * as Gerar from "@/lib/financeiro/razao/gerar"

export type {
  GerarLancamentosResultado,
  SnapshotResultado,
  GerarRazaoResultado,
} from "@/lib/financeiro/razao/gerar"

// Cada função aqui é só requireUser() + createServiceClient() por cima da
// lógica pura em src/lib/financeiro/razao/gerar.ts — a mesma lógica é usada
// por scripts/regerar-razao.ts (CLI, sem sessão de app), sem duplicação.

export async function gerarLancamentosNfeEntrada(
  unitId: string,
  competencia: string
): Promise<Gerar.GerarLancamentosResultado> {
  await requireUser()
  const db = createServiceClient()
  if (!db) return { ok: false, inseridos: 0, error: "Sem conexão com banco" }
  return Gerar.gerarLancamentosNfeEntrada(db, unitId, competencia)
}

export async function gerarLancamentosReceita(
  unitId: string,
  competencia: string
): Promise<Gerar.GerarLancamentosResultado> {
  await requireUser()
  const db = createServiceClient()
  if (!db) return { ok: false, inseridos: 0, error: "Sem conexão com banco" }
  return Gerar.gerarLancamentosReceita(db, unitId, competencia)
}

export async function gerarLancamentosTitulos(
  unitId: string,
  competencia: string
): Promise<Gerar.GerarLancamentosResultado> {
  await requireUser()
  const db = createServiceClient()
  if (!db) return { ok: false, inseridos: 0, error: "Sem conexão com banco" }
  return Gerar.gerarLancamentosTitulos(db, unitId, competencia)
}

export async function gerarLancamentosFolha(
  unitId: string,
  competencia: string
): Promise<Gerar.GerarLancamentosResultado> {
  await requireUser()
  const db = createServiceClient()
  if (!db) return { ok: false, inseridos: 0, error: "Sem conexão com banco" }
  return Gerar.gerarLancamentosFolha(db, unitId, competencia)
}

export async function recalcularSnapshot(
  unitId: string,
  competencia: string
): Promise<Gerar.SnapshotResultado> {
  await requireUser()
  const db = createServiceClient()
  if (!db) return { ok: false, error: "Sem conexão com banco" }
  return Gerar.recalcularSnapshot(db, unitId, competencia)
}

export async function gerarRazao(
  unitId: string,
  competencia: string
): Promise<Gerar.GerarRazaoResultado> {
  await requireUser()
  const db = createServiceClient()
  if (!db) {
    const semConexao = { ok: false, inseridos: 0, error: "Sem conexão com banco" } as const
    return {
      ok: false,
      nfeEntrada: semConexao,
      titulos: semConexao,
      folha: semConexao,
      receita: semConexao,
      snapshot: { ok: false, error: "Sem conexão com banco" },
    }
  }
  return Gerar.gerarRazao(db, unitId, competencia)
}
