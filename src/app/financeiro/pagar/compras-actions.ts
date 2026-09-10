"use server"

import { requireUser } from "@maza/auth/server"
import { createServiceClient } from "@maza/db/supabase/server"
import type { LinhaCompraParseada } from "@/lib/financeiro/importacao/compras/parseComprasXlsx"

const IKY_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909b"

export type ImportarComprasResultado = {
  ok: boolean
  inseridos: number
  roteadosParaIky: number
  valorRoteadoParaIky: number
  error?: string
}

async function importarLinhas(
  linhas: LinhaCompraParseada[],
  unitIdBase: string,
  tipo: "compra" | "despesa",
  origem: "nf_pedidos" | "contas_pagar"
): Promise<ImportarComprasResultado> {
  await requireUser()
  const db = createServiceClient()
  if (!db) return { ok: false, inseridos: 0, roteadosParaIky: 0, valorRoteadoParaIky: 0, error: "Sem conexão com banco" }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = db as any

  try {
    const competencias = [...new Set(linhas.map((l) => l.dCompetencia))]
    // Idempotência: apaga o escopo (origem, unit, competencia) pras DUAS
    // unidades possíveis (base + IKY Delivery) — a exceção de roteamento
    // pode mandar linhas pra IKY mesmo com a unidade base = Yoshimori.
    const unitIdsEnvolvidos = [...new Set([unitIdBase, IKY_UNIT_ID])]
    for (const competencia of competencias) {
      for (const uid of unitIdsEnvolvidos) {
        const { error } = await dbAny.from("titulos_a_pagar").delete()
          .eq("origem", origem).eq("unit_id", uid).eq("d_competencia", competencia)
        if (error) throw new Error(error.message)
      }
    }

    let roteadosParaIky = 0
    let valorRoteadoParaIky = 0
    const rows = linhas.map((l) => {
      const unitId = l.ehIkyDelivery ? IKY_UNIT_ID : unitIdBase
      if (l.ehIkyDelivery && unitIdBase !== IKY_UNIT_ID) {
        roteadosParaIky += 1
        valorRoteadoParaIky += l.vTitulo
      }
      return {
        id: crypto.randomUUID(),
        tipo,
        origem,
        unit_id: unitId,
        fantasia_fornecedor: l.fornecedorNome,
        d_lancamento: l.dLancamento,
        n_nota_fiscal: l.nNotaFiscal,
        descricao_c_gerencial: l.produtoOriginal,
        c_gerencial: l.categoriaNormalizada,
        valor_total_nf_origem: l.valorTotalNfOrigem,
        parcela: l.parcela,
        d_vencimento: l.dVencimento,
        v_titulo: l.vTitulo,
        liquidacao_origem: l.liquidacaoOrigem,
        d_competencia: l.dCompetencia,
      }
    })

    const CHUNK = 500
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await dbAny.from("titulos_a_pagar").insert(rows.slice(i, i + CHUNK))
      if (error) throw new Error(error.message)
    }

    return {
      ok: true, inseridos: rows.length, roteadosParaIky,
      valorRoteadoParaIky: Math.round(valorRoteadoParaIky * 100) / 100,
    }
  } catch (e) {
    return { ok: false, inseridos: 0, roteadosParaIky: 0, valorRoteadoParaIky: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function importarNfPedidos(
  linhas: LinhaCompraParseada[],
  unitIdBase: string
): Promise<ImportarComprasResultado> {
  return importarLinhas(linhas, unitIdBase, "compra", "nf_pedidos")
}

export async function importarContasPagar(
  linhas: LinhaCompraParseada[],
  unitIdBase: string
): Promise<ImportarComprasResultado> {
  return importarLinhas(linhas, unitIdBase, "despesa", "contas_pagar")
}

export type LimparHistoricoResultado = { ok: boolean; removidos: number; error?: string }

// GATE 2 (FASE 7): botão separado, fora do fluxo de importação — nunca
// chamado automaticamente. Apaga só as ~2.000 linhas de origem='PLANILHA
// MAZA' (export de ERP de origem desconhecida), autorizado pelo Ike pra
// dar lugar aos dados de NF_PEDIDOS/CONTAS_A_PAGAR.
export async function limparHistoricoTitulos(): Promise<LimparHistoricoResultado> {
  await requireUser()
  const db = createServiceClient()
  if (!db) return { ok: false, removidos: 0, error: "Sem conexão com banco" }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any).from("titulos_a_pagar")
      .delete()
      .eq("origem", "PLANILHA MAZA")
      .select("id")
    if (error) throw new Error(error.message)
    return { ok: true, removidos: data?.length ?? 0 }
  } catch (e) {
    return { ok: false, removidos: 0, error: e instanceof Error ? e.message : String(e) }
  }
}
