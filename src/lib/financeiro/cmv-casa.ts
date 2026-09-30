/** Premissa gerencial: as compras da base selecionada são consumidas no mês.
 * Não recebe folha nem utiliza a quantidade importada como saldo de estoque.
 */
export function calcularCmvCasa(
  compras: ReadonlyArray<{ v_custo_total: number | null }>,
  recebido: number | null,
) {
  const centavos = compras.reduce((total, item) =>
    total + Math.round(Math.abs(Number(item.v_custo_total ?? 0)) * 100), 0)
  const total = centavos / 100
  // Percentuais gerenciais definidos pelo usuário, ambos sobre o recebido.
  const recebidoCentavos = recebido == null ? null : Math.round(recebido * 100)
  const impostoCentavos = recebidoCentavos == null ? null : Math.round(recebidoCentavos * 0.10)
  const gorjetaCentavos = recebidoCentavos == null ? null : Math.round(recebidoCentavos * 0.07)
  const baseReceita = recebidoCentavos == null ? null
    : (recebidoCentavos - impostoCentavos! - gorjetaCentavos!) / 100
  return {
    total,
    imposto: impostoCentavos == null ? null : impostoCentavos / 100,
    gorjeta: gorjetaCentavos == null ? null : gorjetaCentavos / 100,
    baseReceita,
    percentual: baseReceita != null && baseReceita > 0
      ? total / baseReceita * 100 : null,
  }
}
