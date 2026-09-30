import { classificarLiquidacao } from "../fluxo/liquidacao";
export type Pagamento = { id: string; titulo_id: string; data: string; valor: number; comprovante: string; estornado_em: string | null };
export function saldoTitulo(valor: number, liquidacao: string | null, pagamentos: Pagamento[]) {
  const total = Math.abs(Number(valor));
  const registrado = pagamentos.filter(p => !p.estornado_em).reduce((s, p) => s + Number(p.valor), 0);
  const pago = pagamentos.length ? registrado : classificarLiquidacao(liquidacao) === "pago" ? total : 0;
  return { pago: Math.round(pago * 100) / 100, saldo: Math.round(Math.max(0, total - pago) * 100) / 100 };
}
