import Link from "next/link";
import { requireUser } from "@kph/auth/server";
import { getPagarKpisETitulos } from "../actions-operations";
import {
  competenciaLabel,
  competenciaShift,
  formatBRL,
  formatBRLCompact,
  getCompetenciaAtual,
} from "@/lib/financeiro/utils";
import { KpiCard } from "@kph/ui/kpi-card";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ competencia?: string }>;

const compRegex = /^\d{4}-\d{2}-\d{2}$/;

export default async function ContasAPagarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireUser();
  const sp = await searchParams;
  const compRaw = sp.competencia ?? getCompetenciaAtual();
  const comp = compRegex.test(compRaw) ? compRaw : getCompetenciaAtual();

  const compPrev = competenciaShift(comp, -1);
  const compNext = competenciaShift(comp, 1);

  const { titulos, kpis } = await getPagarKpisETitulos(comp);

  const semDados = titulos.length === 0;

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto" }}>
      <Link
        href="/financeiro"
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          textDecoration: "none",
          fontWeight: 600,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        ← Financeiro
      </Link>

      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          margin: "10px 0 22px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: -0.5,
              margin: "0 0 4px",
            }}
          >
            Contas a Pagar
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>
            TOTVS · {competenciaLabel(comp)}
          </p>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NavMonth href={`?competencia=${compPrev}`} label="←" title="Mês anterior" />
          <span
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: "var(--text)",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          >
            {competenciaLabel(comp)}
          </span>
          <NavMonth href={`?competencia=${compNext}`} label="→" title="Mês seguinte" />
        </nav>
      </header>

      {/* KPIs */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        <KpiCard
          label="Títulos"
          value={kpis.total_titulos}
          sub="Registros do mês"
        />
        <KpiCard
          label="Total lançado"
          value={formatBRLCompact(kpis.total_valor)}
          sub="Valor total dos títulos"
        />
        <KpiCard
          label="Saldo em aberto"
          value={formatBRLCompact(kpis.total_saldo)}
          sub="v_saldo_atual agregado"
        />
        <KpiCard
          label="Vencidos"
          value={
            <span style={{ color: kpis.vencidos_count > 0 ? "#EF4444" : "var(--text)" }}>
              {formatBRLCompact(kpis.vencidos_valor)}
            </span>
          }
          sub={`${kpis.vencidos_count} título${kpis.vencidos_count !== 1 ? "s" : ""} em atraso`}
        />
        <KpiCard
          label="A vencer (30d)"
          value={formatBRLCompact(kpis.a_vencer_30d_valor)}
          sub="Próximos 30 dias"
        />
        <KpiCard
          label="Fluxo de caixa"
          value={formatBRLCompact(kpis.fluxo_caixa_valor)}
          sub="Marcados no FC"
        />
      </section>

      {/* Tabela de títulos */}
      <h2 style={sectionTitle}>Títulos a pagar — {competenciaLabel(comp)}</h2>

      {semDados ? (
        <div
          style={{
            padding: "40px 24px",
            textAlign: "center",
            background: "var(--surface)",
            border: "1px dashed var(--border)",
            borderRadius: 14,
            color: "var(--text-3)",
            fontSize: 13,
          }}
        >
          Nenhum título encontrado para {competenciaLabel(comp)}.
        </div>
      ) : (
        <div
          style={{
            overflowX: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
        >
          <table
            style={{
              width: "100%",
              fontSize: 12,
              borderCollapse: "collapse",
              minWidth: 860,
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text-3)",
                  fontWeight: 600,
                  textAlign: "left",
                }}
              >
                <Th>Fornecedor</Th>
                <Th>Descrição</Th>
                <Th>Portador</Th>
                <Th>Título</Th>
                <Th align="right">Vencimento</Th>
                <Th align="right">Valor</Th>
                <Th align="right">Saldo</Th>
                <Th align="right">Atraso</Th>
                <Th>Situação</Th>
                <Th>FC</Th>
              </tr>
            </thead>
            <tbody>
              {titulos.map((t) => {
                const vencido =
                  t.d_vencimento &&
                  new Date(`${t.d_vencimento}T12:00:00`) <
                    new Date(new Date().toDateString());
                const atrasoColor =
                  (t.dias_atraso_atual ?? 0) > 0 ? "#EF4444" : "var(--text-3)";

                return (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background:
                        vencido && (t.v_saldo_atual ?? 0) > 0
                          ? "rgba(239,68,68,0.04)"
                          : "transparent",
                    }}
                  >
                    <Td>
                      <span style={{ fontWeight: 500 }}>
                        {t.fantasia_fornecedor ??
                          t.razao_fornecedor ??
                          "—"}
                      </span>
                    </Td>
                    <Td muted>
                      {t.descricao_c_gerencial ?? t.tipo ?? "—"}
                    </Td>
                    <Td muted>{t.portador ?? "—"}</Td>
                    <Td muted>
                      {t.n_titulo ?? "—"}
                      {t.parcela ? `/${t.parcela}` : ""}
                    </Td>
                    <Td align="right">
                      {t.d_vencimento ? (
                        <span
                          style={{
                            color: vencido ? "#EF4444" : "var(--text)",
                            fontWeight: vencido ? 600 : 400,
                          }}
                        >
                          {new Date(
                            `${t.d_vencimento}T12:00:00`,
                          ).toLocaleDateString("pt-BR")}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </Td>
                    <Td align="right">{formatBRL(t.v_titulo)}</Td>
                    <Td align="right">
                      <strong>{formatBRL(t.v_saldo_atual)}</strong>
                    </Td>
                    <Td align="right">
                      <span
                        style={{
                          color: atrasoColor,
                          fontWeight:
                            (t.dias_atraso_atual ?? 0) > 0 ? 600 : 400,
                        }}
                      >
                        {(t.dias_atraso_atual ?? 0) > 0
                          ? `${t.dias_atraso_atual}d`
                          : "—"}
                      </span>
                    </Td>
                    <Td>
                      <SituacaoBadge situacao={t.situacao_atual} />
                    </Td>
                    <Td>
                      {t.fluxo_de_caixa ? (
                        <span style={{ color: "#22C55E", fontWeight: 700 }}>
                          ✓
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function NavMonth({
  href,
  label,
  title,
}: {
  href: string;
  label: string;
  title: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-label={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: 8,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--text-2)",
        textDecoration: "none",
        fontSize: 14,
        fontWeight: 700,
      }}
    >
      {label}
    </Link>
  );
}

function SituacaoBadge({ situacao }: { situacao: string | null }) {
  if (!situacao)
    return <span style={{ color: "var(--text-3)", fontSize: 11 }}>—</span>;

  const lower = situacao.toLowerCase();
  const isOk =
    lower.includes("pago") ||
    lower.includes("liquidado") ||
    lower.includes("baixado");
  const isAlert =
    lower.includes("vencido") ||
    lower.includes("atraso") ||
    lower.includes("protest");

  const bg = isOk
    ? "rgba(34,197,94,0.10)"
    : isAlert
      ? "rgba(239,68,68,0.10)"
      : "var(--surface-2)";
  const border = isOk
    ? "rgba(34,197,94,0.30)"
    : isAlert
      ? "rgba(239,68,68,0.30)"
      : "var(--border)";
  const color = isOk ? "#22C55E" : isAlert ? "#EF4444" : "var(--text-2)";

  return (
    <span
      style={{
        display: "inline-flex",
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        background: bg,
        border: `1px solid ${border}`,
        color,
        borderRadius: 99,
        whiteSpace: "nowrap",
      }}
    >
      {situacao}
    </span>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "8px 12px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        borderBottom: "1px solid var(--border)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  muted = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  muted?: boolean;
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: "7px 12px",
        fontSize: 12,
        color: muted ? "var(--text-3)" : "var(--text)",
        whiteSpace: "nowrap",
        maxWidth: 200,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {children}
    </td>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "var(--text-3)",
  margin: "0 0 10px",
};
