import { competenciaTitulo } from "@/lib/financeiro/dates";

export type FolhaDespesa = { unit_id: string; competencia: string; etapa: "mensal" | "adiantamento"; pagamento: number | null; bonificacao: number | null };
export type TituloDespesa = { unit_id: string; origem: string; v_titulo: number | null; d_competencia: string | null; d_lancamento: string | null; d_vencimento: string | null };
export function calcularDespesa(unitIds: string[], competencia: string, folhas: FolhaDespesa[], titulos: TituloDespesa[]) {
  const mes = competencia.slice(0, 7);
  const folha = folhas.filter(r => unitIds.includes(r.unit_id) && r.competencia === mes && r.etapa === "mensal");
  const contas = titulos.filter(r => unitIds.includes(r.unit_id) && r.origem === "contas_pagar" && competenciaTitulo(r)?.slice(0, 7) === mes);
  const centavos = (v: number | null) => Math.round(Number(v ?? 0) * 100);
  // Total folha = pagamento + bonificação mensal; vale é apenas informativo.
  const totalFolha = folha.reduce((s, r) => s + (centavos(r.pagamento) + centavos(r.bonificacao)), 0);
  const totalContas = contas.reduce((s, r) => s + centavos(r.v_titulo), 0);
  const faltaFolha = unitIds.some(id => !folha.some(r => r.unit_id === id));
  const faltaContas = unitIds.some(id => !contas.some(r => r.unit_id === id));
  const faltas = [faltaFolha && "Folha Empresa", faltaContas && "Contas a Pagar"].filter(Boolean).join(" e ");
  return { folha: totalFolha / 100, contas: totalContas / 100, total: (totalFolha + totalContas) / 100,
    parcial: faltas ? `Faltam dados de ${faltas} para uma ou mais unidades selecionadas.` : null,
    temDados: folha.length + contas.length > 0 };
}
export type DespesaResumo = ReturnType<typeof calcularDespesa>;
