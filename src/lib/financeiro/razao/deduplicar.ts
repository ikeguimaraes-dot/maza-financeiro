type Compra = { origem: string; n_nota_fiscal: string | null; fantasia_fornecedor: string | null; razao_fornecedor: string | null; v_titulo: number | null; valor_total_nf_origem: number | null; d_lancamento?: string | null; d_competencia?: string | null };
/** A purchase source only covers an obligation when identity AND full value match. */
export function comprasSemDuplicidade<T extends Compra>(rows: T[], fornecedor: (nome: string) => string | undefined): T[] {
  const groups = new Map<string, { compras: T[]; contas: T[] }>();
  const keyOf = (r: T) => {
    const id = fornecedor((r.fantasia_fornecedor ?? r.razao_fornecedor ?? "").toUpperCase().trim());
    return id && r.n_nota_fiscal ? `${id}|${r.n_nota_fiscal}|${r.d_lancamento ?? r.d_competencia?.slice(0, 4) ?? ""}` : null;
  };
  for (const r of rows) {
    const key = keyOf(r); if (!key) continue;
    const g = groups.get(key) ?? { compras: [], contas: [] };
    (r.origem === "nf_pedidos" ? g.compras : g.contas).push(r); groups.set(key, g);
  }
  const covered = new Set<string>();
  for (const [key, g] of groups) {
    if (!g.compras.length || !g.contas.length) continue;
    const compra = g.compras.reduce((sum, r) => sum + Math.abs(Number(r.v_titulo ?? 0)), 0);
    const totaisDeclarados = [...new Set(g.contas.map(r => Number(r.valor_total_nf_origem)).filter(v => v > 0))];
    const conta = totaisDeclarados.length === 1 ? totaisDeclarados[0]! : g.contas.reduce((sum, r) => sum + Math.abs(Number(r.v_titulo ?? 0)), 0);
    // Full cents match; month/category presence and a percentage tolerance are insufficient.
    if (compra > 0 && Math.abs(compra - conta) < 0.01) covered.add(key);
  }
  return rows.filter(r => r.origem !== "contas_pagar" || !covered.has(keyOf(r) ?? ""));
}
