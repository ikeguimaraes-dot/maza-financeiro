import { formatBRL } from "@/lib/financeiro/utils"
import type { RecebivelPorForma } from "@/lib/financeiro/fluxo/calcularFluxo"

type Props = {
  aReceberPorForma: RecebivelPorForma[]
  antecipacaoRegistrada: boolean
}

export function AReceberPorForma({ aReceberPorForma, antecipacaoRegistrada }: Props) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={sectionTitle}>A receber por forma de pagamento</h2>
      {!antecipacaoRegistrada && (
        <p style={{ fontSize: 12, color: "var(--text-3)", margin: "0 0 10px" }}>
          Prazo contratual — antecipação não registrada.
        </p>
      )}
      <div style={{ overflowX: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr style={{ background: "var(--surface-2)", color: "var(--text-3)", textAlign: "left" }}>
              <th style={th}>Forma</th>
              <th style={th}>Prazo</th>
              <th style={{ ...th, textAlign: "right" }}>Bruto</th>
              <th style={{ ...th, textAlign: "right" }}>Líquido</th>
              <th style={{ ...th, textAlign: "right" }}>Custo antecipação</th>
            </tr>
          </thead>
          <tbody>
            {aReceberPorForma.map((r) => (
              <tr key={r.forma} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={td}>{r.forma}</td>
                <td style={{ ...td, color: r.formaConhecida ? "var(--text)" : "#F59E0B" }}>
                  {r.formaConhecida ? `D+${r.prazoDias}` : "Forma desconhecida (D+0 conservador)"}
                </td>
                <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{formatBRL(r.valorBruto)}</td>
                <td style={{ ...td, textAlign: "right" }}>{formatBRL(r.valorLiquido)}</td>
                <td style={{ ...td, textAlign: "right", color: "var(--text-3)" }}>{formatBRL(r.custoAntecipacao)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "var(--text-3)",
  margin: "0 0 10px",
}

const th: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
}

const td: React.CSSProperties = {
  padding: "7px 12px",
  color: "var(--text)",
  whiteSpace: "nowrap",
}
