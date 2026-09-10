// Lógica pura de gravação das linhas de compra — recebe o client Supabase
// por parâmetro, igual ao padrão de src/lib/financeiro/razao/gerar.ts,
// pra ser chamável tanto pela Server Action
// (src/app/financeiro/pagar/compras-actions.ts) quanto por scripts
// locais sem sessão de app.
import type { LinhaCompraParseada } from "./parseComprasXlsx"

const IKY_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909b"

export type ImportarComprasResultado = {
  ok: boolean
  inseridos: number
  roteadosParaIky: number
  valorRoteadoParaIky: number
  error?: string
}

export async function importarLinhasCompra(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  linhas: LinhaCompraParseada[],
  unitIdBase: string,
  tipo: "compra" | "despesa",
  origem: "nf_pedidos" | "contas_pagar"
): Promise<ImportarComprasResultado> {
  try {
    const competencias = [...new Set(linhas.map((l) => l.dCompetencia))]
    // Idempotência: apaga o escopo (origem, unit, competencia) pras DUAS
    // unidades possíveis (base + IKY Delivery) — a exceção de roteamento
    // pode mandar linhas pra IKY mesmo com a unidade base = Yoshimori.
    const unitIdsEnvolvidos = [...new Set([unitIdBase, IKY_UNIT_ID])]
    for (const competencia of competencias) {
      for (const uid of unitIdsEnvolvidos) {
        const { error } = await db.from("titulos_a_pagar").delete()
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
      const { error } = await db.from("titulos_a_pagar").insert(rows.slice(i, i + CHUNK))
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
