import { formatBRL } from "@/lib/financeiro/utils"
import type { ResultadoFluxo } from "@/lib/financeiro/fluxo/calcularFluxo"

function pctFmt(v: number | null): string {
  if (v === null) return "—"
  return `${(v * 100).toFixed(0)}%`
}

export function ConfiancaIndex({ confianca }: { confianca: ResultadoFluxo["confianca"] }) {
  const semExtrato = confianca.pctDiasComExtrato === 0

  return (
    <div style={{ marginBottom: 8 }}>
      <h2 style={sectionTitle}>Índice de confiança</h2>

      {semExtrato && (
        <div
          style={{
            padding: "10px 14px",
            marginBottom: 12,
            borderRadius: 10,
            border: "1px solid #F59E0B",
            background: "rgba(245,158,11,0.08)",
            color: "#F59E0B",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Saldo não confirmado — importe o extrato bancário.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <Item label="Títulos com vencimento preenchido" value={pctFmt(confianca.pctTitulosComVencimento)} />
        <Item label="Dias do período com extrato importado" value={pctFmt(confianca.pctDiasComExtrato)} />
        <Item label="Último extrato importado" value={confianca.dataUltimoExtrato ? formatData(confianca.dataUltimoExtrato) : "Nenhum"} />
        <Item
          label="Dias de venda sem detalhe de forma"
          value={`${confianca.diasSemDetalheForma} dia${confianca.diasSemDetalheForma === 1 ? "" : "s"} · ${formatBRL(confianca.valorSemDetalheForma)}`}
        />
        <Item
          label="Títulos sem confirmação de pagamento (indefinido)"
          value={`${formatBRL(confianca.valorIndefinido)} (${pctFmt(confianca.pctValorIndefinido)})`}
        />
        <Item
          label="Linhas de resumo ignoradas na importação de receita"
          value={`${confianca.diasSemDetalheForma} dia${confianca.diasSemDetalheForma === 1 ? "" : "s"} · ${formatBRL(confianca.valorSemDetalheForma)}`}
        />
      </div>
    </div>
  )
}

function formatData(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-3)", margin: "0 0 4px" }}>
        {label}
      </p>
      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", margin: 0 }}>{value}</p>
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
