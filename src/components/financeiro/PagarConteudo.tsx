"use client"

import { useState } from "react"
import type { PagarResultado } from "@/lib/financeiro/pagar/calcularPagar"
import { PagarPainel } from "./pagar/PagarPainel"
import { ConciliacaoTab } from "./ConciliacaoTab"
import { ProtestosTab } from "./ProtestosTab"

type Props = {
  dados: PagarResultado
  competenciaLabel: string
  unitId: string | null
  mes: number
  ano: number
}

// ── Component ────────────────────────────────────────────────────────────────
// Aba "Títulos" lê titulos_a_pagar direto (PagarPainel); Conciliação e
// Protestos são features irmãs, não tocadas por esta reescrita.
export function PagarConteudo({ dados, competenciaLabel, unitId, mes, ano }: Props) {
  const [tab, setTab] = useState<"titulos" | "conciliacao" | "protestos">("titulos")

  return (
    <>
      {dados.titulos.some(t => t.duplicidade) && <details style={{ padding: 16, marginBottom: 16, border: "1px solid var(--color-warning)", borderRadius: 8 }}>
        <summary>Conferência necessária: {dados.titulos.filter(t => t.duplicidade).length} linhas com possível duplicidade. Os totais ainda precisam ser validados.</summary>
        <p>Mesma nota, fornecedor, parcela e datas aparecem mais de uma vez. Nenhuma linha foi apagada ou considerada quitada automaticamente.</p>
        <ul>{dados.titulos.filter(t => t.duplicidade).map(t => <li key={t.id}>{t.fornecedor} · NF {t.nNota} · vencimento {t.vencimento ?? "não informado"} · {t.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · marcação {t.liquidacaoOrigem ?? "vazia"}</li>)}</ul>
      </details>}
      {/* Tab nav */}
      <nav style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", marginBottom: 24 }}>
        {(["titulos", "conciliacao", "protestos"] as const).map(t => {
          const labels = { titulos: "Títulos", conciliacao: "Conciliação", protestos: "Protestos" }
          const active = tab === t
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "8px 18px", fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? "var(--text)" : "var(--text-3)",
              borderBottom: active ? "2px solid var(--brand, #D4A574)" : "2px solid transparent",
              background: "transparent", border: "none", cursor: "pointer",
              whiteSpace: "nowrap", marginBottom: -1,
            }}>
              {labels[t]}
            </button>
          )
        })}
      </nav>

      {tab === "conciliacao" && (
        <ConciliacaoTab unitId={unitId} mes={mes} ano={ano} />
      )}

      {tab === "protestos" && (
        <ProtestosTab unitId={unitId} />
      )}

      {tab === "titulos" && (
        <PagarPainel dados={dados} competenciaLabel={competenciaLabel} />
      )}
    </>
  )
}
