import { mesAnterior, variacaoMensal } from "@/lib/folha/comparacao"
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const label = (mes: string) => `${mes.slice(5)}/${mes.slice(0, 4)}`
export function ComparacaoFolha({ titulo, competencia, atual, anterior, pendencia }: { titulo: string; competencia: string; atual: number | null; anterior: number | null; pendencia?: string }) {
  const variacao = variacaoMensal(atual, anterior)
  const max = Math.max(atual ?? 0, anterior ?? 0, 1)
  return <section className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-4 mb-6" aria-label={`${titulo} — comparação mensal`}>
    <div className="flex flex-wrap justify-between gap-2 mb-5">
      <h2 className="text-xs font-medium text-[var(--text-2)]">{titulo} — mês atual × mês anterior</h2>
      <p className="text-xs text-[var(--text-3)]">{variacao !== null ? `${variacao > 0 ? "+" : ""}${variacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% em relação ao mês anterior` : anterior === 0 && atual !== null ? "Mês anterior com valor zero; variação percentual não calculável" : "Comparação pendente de dados"}</p>
    </div>
    <div className="space-y-4">{[{mes: mesAnterior(competencia), valor: anterior, cor: "var(--brand-secondary)"}, {mes: competencia, valor: atual, cor: "var(--brand)"}].map(r => <div key={r.mes}>
      <div className="flex justify-between text-xs mb-2"><span>{label(r.mes)}</span><strong>{r.valor === null ? "Sem dados" : fmt(r.valor)}</strong></div>
      <div className="h-5 rounded bg-[var(--surface-3)] overflow-hidden" aria-hidden="true"><div className="h-full rounded" style={{width: `${Math.max(0, r.valor ?? 0) / max * 100}%`, background: r.cor}} /></div>
    </div>)}</div>
    {pendencia && <p role="status" className="text-xs text-[var(--text-3)] mt-3">{pendencia}</p>}
  </section>
}
