import { KpiCard } from "@maza/ui/kpi-card"
import { formatBRLCompact } from "@/lib/financeiro/utils"
import type { ResultadoFluxo } from "@/lib/financeiro/fluxo/calcularFluxo"

type Props = {
  resumo: ResultadoFluxo["resumo"]
  confianca: ResultadoFluxo["confianca"]
}

export function CardsResumo({ resumo, confianca }: Props) {
  const diaCruzaZeroFmt = resumo.diaCruzaZero
    ? new Date(`${resumo.diaCruzaZero}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : null

  const indefinidoAlto = (confianca.pctValorIndefinido ?? 0) > 0.2

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 12,
        marginBottom: 28,
      }}
    >
      <KpiCard label="Saldo hoje" value={formatBRLCompact(resumo.saldoHoje)} sub="Consolidado das contas" />
      <KpiCard
        label="A pagar vencido"
        value={formatBRLCompact(resumo.aPagarVencido)}
        sub="Não pago ou sem confirmação"
        accent={resumo.aPagarVencido > 0 ? "#EF4444" : undefined}
      />
      <KpiCard label="A pagar 7 dias" value={formatBRLCompact(resumo.aPagar7Dias)} sub="Vencimento até 7 dias" />
      <KpiCard label="A receber 7 dias" value={formatBRLCompact(resumo.aReceber7Dias)} sub="Previsto por prazo de forma" />
      <KpiCard
        label="Projeção 30 dias"
        value={
          <span style={{ color: resumo.cruzaZero ? "#EF4444" : "var(--text)" }}>
            {formatBRLCompact(resumo.projecao30Dias)}
          </span>
        }
        sub={
          resumo.cruzaZero
            ? `Falta caixa em ${diaCruzaZeroFmt}`
            : indefinidoAlto
              ? `${formatBRLCompact(confianca.valorIndefinido)} sem confirmação de pagamento — projeção pode estar superestimando saída.`
              : "Saldo projetado"
        }
        accent={resumo.cruzaZero || indefinidoAlto ? "#EF4444" : undefined}
      />
    </section>
  )
}
