import type { ReactNode } from "react"

export function ResumoFolha({ cards }: { cards: { label: string; value: ReactNode; sub: string; highlight?: boolean }[] }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
    {cards.map(card => <div key={card.label} className={`rounded-xl p-4 border ${card.highlight ? "bg-[var(--brand-soft)] border-[var(--border-active)]" : "bg-[var(--surface-2)] border-[var(--border)]"}`}>
      <p className="text-[10px] text-[var(--text-3)] uppercase tracking-wider mb-1.5">{card.label}</p>
      <p className={`text-xl font-medium ${card.highlight ? "text-[var(--brand)]" : "text-[var(--text)]"}`}>{card.value}</p>
      <p className="text-[10px] text-[var(--text-3)] mt-1">{card.sub}</p>
    </div>)}
  </div>
}
