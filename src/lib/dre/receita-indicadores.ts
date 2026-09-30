export type DiaIndicador = { id: string; data: string; desconto: number | null }
export type PagamentoIndicador = { workday_id_fk: string; valor_recebido: number | null }
/** Recebe apenas dias da unidade e ano selecionados. Pagamentos são vinculados
 * ao dia original, nunca às linhas de turnos duplicadas da apresentação. */
export function indicadoresReceita(dias: DiaIndicador[], pagamentos: PagamentoIndicador[]) {
  const mesPorId = new Map(dias.map(d => [d.id, `${d.data.slice(0,7)}-01`]))
  const descontos: Record<string, number> = {}, recebido: Record<string, number> = {}
  for (const d of dias) {
    const mes = mesPorId.get(d.id)!
    descontos[mes] = (descontos[mes] ?? 0) + Math.round(Number(d.desconto ?? 0) * 100)
  }
  for (const p of pagamentos) {
    const mes = mesPorId.get(p.workday_id_fk)
    if (mes) recebido[mes] = (recebido[mes] ?? 0) + Math.round(Number(p.valor_recebido ?? 0) * 100)
  }
  const taxas: Record<string, number> = {}
  for (const mes of Object.keys(recebido)) {
    taxas[mes] = Math.round(recebido[mes]! * 0.03) / 100
    recebido[mes] = recebido[mes]! / 100
  }
  for (const mes of Object.keys(descontos)) descontos[mes] = descontos[mes]! / 100
  return { descontos, recebido, taxas }
}
