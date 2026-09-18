import { applyBatch, replacement } from "@/lib/financeiro/db/atomic"
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
    if (!linhas.length) throw new Error("Arquivo sem linhas válidas; nenhum dado foi substituído.")
    for (const l of linhas) {
      if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(l.dCompetencia) || !Number.isFinite(l.vTitulo) || l.vTitulo < 0) throw new Error("Competência ou valor de compra inválido.")
    }
    let roteadosParaIky = 0
    let valorRoteadoParaIky = 0
    const rows = linhas.map((l) => {
      const unitId = l.ehIkyDelivery ? IKY_UNIT_ID : unitIdBase
      if (l.ehIkyDelivery && unitIdBase !== IKY_UNIT_ID) {
        roteadosParaIky += 1
        valorRoteadoParaIky += l.vTitulo
      }
      const id = crypto.randomUUID()
      return {
        id,
        // uq_titulos_chave é um índice legado (n_titulo, parcela,
        // fantasia_empresa, ref_mes) NULLS NOT DISTINCT, pensado pro
        // formato antigo de ERP — sem popular esses 4 campos, todas as
        // linhas novas colidiriam entre si (Postgres trata NULL=NULL
        // aqui). n_titulo = id da própria linha resolve trivialmente,
        // sem precisar migrar ou derrubar o índice.
        n_titulo: id,
        tipo,
        origem,
        unit_id: unitId,
        import_unit_id: unitIdBase,
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

    const months = [...new Set(rows.map(r => r.d_competencia))]
    await applyBatch(db, months.flatMap(month => replacement("titulos_a_pagar",
      { import_unit_id: unitIdBase, d_competencia: month, origem },
      rows.filter(r => r.d_competencia === month)
    ).map(operation => ({ ...operation, affectedUnits: [unitIdBase, IKY_UNIT_ID] }))))

    return {
      ok: true, inseridos: rows.length, roteadosParaIky,
      valorRoteadoParaIky: Math.round(valorRoteadoParaIky * 100) / 100,
    }
  } catch (e) {
    return { ok: false, inseridos: 0, roteadosParaIky: 0, valorRoteadoParaIky: 0, error: e instanceof Error ? e.message : String(e) }
  }
}
