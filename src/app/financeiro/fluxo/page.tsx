import Link from "next/link";
import { requireUser } from "@kph/auth/server";
import { getFluxoCaixaMes } from "../actions-operations";
import {
  competenciaLabel,
  competenciaShift,
  formatBRL,
  formatBRLCompact,
  formatPct,
  getCmvSeverity,
  getCompetenciaAtual,
} from "@/lib/financeiro/utils";
import { SeverityBadge } from "@/components/financeiro/SeverityBadge";
import { KpiCard } from "@kph/ui/kpi-card";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ competencia?: string }>;

const compRegex = /^\d{4}-\d{2}-\d{2}$/;

export default async function FluxoCaixaPage({
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

  const { dias, totais } = await getFluxoCaixaMes(comp);

  // Acumulado para linha de progresso
  let acumBruto = 0;
  let acumMeta = 0;

  // Agrega pagamentos de todos os dias
  const pagMap = new Map<string, { fechado: number; recebido: number }>();
  for (const d of dias) {
    if (!d.pagamentos) continue;
    for (const p of d.pagamentos) {
      const existing = pagMap.get(p.tipo) ?? { fechado: 0, recebido: 0 };
      pagMap.set(p.tipo, {
        fechado: existing.fechado + (p.fechado ?? 0),
        recebido: existing.recebido + (p.recebido ?? 0),
      });
    }
  }
  const pagamentos = Array.from(pagMap.entries())
    .map(([tipo, v]) => ({ tipo, ...v }))
    .sort((a, b) => b.recebido - a.recebido);

  const semDados = dias.length === 0;

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
            Fluxo de Caixa
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>
            PDV Workday · {competenciaLabel(comp)}
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
          Nenhum dado do PDV para {competenciaLabel(comp)}.
        </div>
      ) : (
        <>
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
              label="Realizado"
              value={formatBRLCompact(totais.bruto)}
              sub={competenciaLabel(comp)}
            />
            <KpiCard
              label="Meta do mês"
              value={formatBRLCompact(totais.meta_total)}
              sub="Metas projeções"
            />
            <KpiCard
              label="Atingimento"
              value={
                totais.atingimento_pct !== null
                  ? `${totais.atingimento_pct.toFixed(1).replace(".", ",")}%`
                  : "—"
              }
              sub={totais.meta_total > 0 ? "vs meta mensal" : "Sem meta cadastrada"}
            />
            <KpiCard
              label="Lucro bruto"
              value={formatBRLCompact(totais.lucro)}
              sub={
                totais.bruto > 0
                  ? `${((totais.lucro / totais.bruto) * 100).toFixed(1).replace(".", ",")}% da receita`
                  : "—"
              }
            />
            <KpiCard
              label="CMV médio"
              value={
                <SeverityBadge severity={getCmvSeverity(totais.cmv_pct_medio)}>
                  {formatPct(totais.cmv_pct_medio)}
                </SeverityBadge>
              }
              sub="Média do mês"
            />
            <KpiCard
              label="Ticket médio"
              value={formatBRL(totais.ticket_medio)}
              sub={`${totais.acessos.toLocaleString("pt-BR")} acessos`}
            />
          </section>

          {/* Tabela diária */}
          <h2 style={sectionTitle}>Realizado por dia</h2>
          <div
            style={{
              overflowX: "auto",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              marginBottom: 28,
            }}
          >
            <table
              style={{
                width: "100%",
                fontSize: 12,
                borderCollapse: "collapse",
                minWidth: 900,
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
                  <Th>Data</Th>
                  <Th>Dia</Th>
                  <Th align="right">Meta</Th>
                  <Th align="right">Bruto</Th>
                  <Th align="right">Atingim.</Th>
                  <Th align="right">Desconto</Th>
                  <Th align="right">Gorjeta</Th>
                  <Th align="right">Custo</Th>
                  <Th align="right">CMV%</Th>
                  <Th align="right">Lucro</Th>
                  <Th align="right">Acessos</Th>
                  <Th align="right">Ticket</Th>
                </tr>
              </thead>
              <tbody>
                {dias.map((d) => {
                  acumBruto += d.bruto ?? 0;
                  acumMeta += d.meta_dia ?? 0;
                  const abaixoMeta =
                    d.meta_dia !== null &&
                    d.atingimento_pct !== null &&
                    d.atingimento_pct < 85;
                  const cmvAlto = (d.cmv_pct ?? 0) > 35;
                  return (
                    <tr
                      key={d.workday_id}
                      style={{
                        background: abaixoMeta
                          ? "rgba(239,68,68,0.04)"
                          : "transparent",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <Td>
                        {new Date(`${d.data}T12:00:00`).toLocaleDateString(
                          "pt-BR",
                          { day: "2-digit", month: "2-digit" },
                        )}
                      </Td>
                      <Td>
                        <span style={{ color: "var(--text-3)" }}>
                          {d.dia_semana}
                        </span>
                      </Td>
                      <Td align="right">
                        {d.meta_dia ? formatBRLCompact(d.meta_dia) : "—"}
                      </Td>
                      <Td align="right">
                        <strong>{formatBRLCompact(d.bruto)}</strong>
                      </Td>
                      <Td align="right">
                        {d.atingimento_pct !== null ? (
                          <span
                            style={{
                              color:
                                d.atingimento_pct >= 100
                                  ? "#22C55E"
                                  : d.atingimento_pct >= 85
                                    ? "var(--text)"
                                    : "#EF4444",
                              fontWeight: 600,
                            }}
                          >
                            {d.atingimento_pct}%
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-3)" }}>—</span>
                        )}
                      </Td>
                      <Td align="right" muted>
                        {formatBRLCompact(d.desconto)}
                      </Td>
                      <Td align="right" muted>
                        {formatBRLCompact(d.gorjeta)}
                      </Td>
                      <Td align="right" muted>
                        {formatBRLCompact(d.custo)}
                      </Td>
                      <Td align="right">
                        <span
                          style={{
                            color: cmvAlto ? "#EF4444" : "var(--text)",
                            fontWeight: cmvAlto ? 700 : 400,
                          }}
                        >
                          {d.cmv_pct !== null ? `${d.cmv_pct}%` : "—"}
                        </span>
                      </Td>
                      <Td align="right">
                        <span
                          style={{
                            color: (d.lucro ?? 0) >= 0 ? "#22C55E" : "#EF4444",
                            fontWeight: 600,
                          }}
                        >
                          {formatBRLCompact(d.lucro)}
                        </span>
                      </Td>
                      <Td align="right" muted>
                        {(d.acessos ?? 0).toLocaleString("pt-BR")}
                      </Td>
                      <Td align="right" muted>
                        {formatBRL(d.ticket_medio)}
                      </Td>
                    </tr>
                  );
                })}

                {/* linha de totais */}
                <tr
                  style={{
                    background: "var(--surface-2)",
                    fontWeight: 700,
                    borderTop: "2px solid var(--border)",
                  }}
                >
                  <Td>
                    <strong>Total</strong>
                  </Td>
                  <Td>{dias.length}d</Td>
                  <Td align="right">
                    {formatBRLCompact(totais.meta_total || acumMeta)}
                  </Td>
                  <Td align="right">
                    <strong>{formatBRLCompact(totais.bruto)}</strong>
                  </Td>
                  <Td align="right">
                    {totais.atingimento_pct !== null ? (
                      <span
                        style={{
                          color:
                            totais.atingimento_pct >= 100
                              ? "#22C55E"
                              : "#EF4444",
                          fontWeight: 700,
                        }}
                      >
                        {totais.atingimento_pct.toFixed(1).replace(".", ",")}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td align="right">{formatBRLCompact(totais.desconto)}</Td>
                  <Td align="right">{formatBRLCompact(totais.gorjeta)}</Td>
                  <Td align="right">{formatBRLCompact(totais.custo)}</Td>
                  <Td align="right">
                    {totais.cmv_pct_medio !== null
                      ? `${totais.cmv_pct_medio}%`
                      : "—"}
                  </Td>
                  <Td align="right">
                    <strong
                      style={{
                        color: totais.lucro >= 0 ? "#22C55E" : "#EF4444",
                      }}
                    >
                      {formatBRLCompact(totais.lucro)}
                    </strong>
                  </Td>
                  <Td align="right">
                    {totais.acessos.toLocaleString("pt-BR")}
                  </Td>
                  <Td align="right">{formatBRL(totais.ticket_medio)}</Td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mix de pagamentos */}
          {pagamentos.length > 0 && (
            <>
              <h2 style={sectionTitle}>Mix de pagamentos</h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 10,
                  marginBottom: 28,
                }}
              >
                {pagamentos.map((p) => {
                  const pct =
                    totais.bruto > 0
                      ? ((p.recebido / totais.bruto) * 100).toFixed(1)
                      : "0";
                  return (
                    <div
                      key={p.tipo}
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        padding: "12px 14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                          color: "var(--text-3)",
                        }}
                      >
                        {p.tipo}
                      </span>
                      <span
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: "var(--text)",
                        }}
                      >
                        {formatBRLCompact(p.recebido)}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                        {pct.replace(".", ",")}% do bruto
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
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
