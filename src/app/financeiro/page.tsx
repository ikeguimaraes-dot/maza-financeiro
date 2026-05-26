import Link from "next/link";

import { requireUser } from "@kph/auth/server";
import { createSupabaseServerClient } from "@kph/db/supabase/server";
import {
  getAprovacoesPendentes,
  getBrandsOperacionais,
  getFinanceiroResumoGrupo,
} from "./actions";
import { KpiCard } from "@kph/ui/kpi-card";
import { ProgressBar } from "@kph/ui/progress-bar";
import { SeverityBadge } from "@/components/financeiro/SeverityBadge";
import { AprovacaoActions } from "@/components/financeiro/AprovacaoActions";
import { CATEGORIA_DESPESA_LABELS } from "@/lib/financeiro/labels";
import {
  competenciaLabel,
  formatBRL,
  formatBRLCompact,
  formatPct,
  getCmvSeverity,
  getCompetenciaAtual,
  getEbitdaSeverity,
  getGapSeverity,
} from "@/lib/financeiro/utils";
import type {
  CategoriaDespesa,
  DreConsolidadoRow,
} from "@kph/db/types/database";

export const dynamic = "force-dynamic";

export default async function FinanceiroHubPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const comp = getCompetenciaAtual();

  const [resumo, brands, aprovacoes, dresPorMarca] = await Promise.all([
    getFinanceiroResumoGrupo(),
    getBrandsOperacionais(),
    getAprovacoesPendentes(null),
    supabase
      ? supabase
          .from("v_dre_consolidado")
          .select("*")
          .eq("competencia", comp)
      : Promise.resolve({ data: [] as DreConsolidadoRow[] }),
  ]);

  const dreByBrand = new Map<string, DreConsolidadoRow>();
  const dreRows = ((dresPorMarca as { data?: DreConsolidadoRow[] }).data ??
    []) as DreConsolidadoRow[];
  for (const r of dreRows) dreByBrand.set(r.brand_id, r);

  const isAprovador = user.roles.some(
    (r) => r.role === "founder" || r.role === "cfo",
  );
  const operacionais = brands.filter((b) => b.has_period);
  const semOperacao = brands.filter((b) => !b.has_period);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          Fase E4 · Hub financeiro
        </div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "var(--text)",
            letterSpacing: -0.5,
            margin: "8px 0 4px",
          }}
        >
          Financeiro · {competenciaLabel(comp)}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", maxWidth: 620 }}>
          Receita, despesa e EBITDA do grupo. Aprovações pendentes acima do
          limite por marca.
        </p>
      </header>

      {/* KPIs do grupo */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        <KpiCard
          label="Receita do grupo"
          value={formatBRLCompact(resumo.receita_mes_atual)}
          sub={competenciaLabel(comp)}
        />
        <KpiCard
          label="Despesa do grupo"
          value={formatBRLCompact(resumo.despesa_mes_atual)}
          sub={
            resumo.cmv_pct_medio !== null
              ? `CMV médio ${formatPct(resumo.cmv_pct_medio)}`
              : "Sem dados de CMV"
          }
        />
        <KpiCard
          label="EBITDA"
          value={formatBRLCompact(resumo.ebitda_mes_atual)}
          sub={
            resumo.ebitda_pct_medio !== null
              ? `${formatPct(resumo.ebitda_pct_medio)} sobre receita`
              : "Sem receita registrada"
          }
        >
          {resumo.ebitda_pct_medio !== null && (
            <ProgressBar
              value={Math.max(0, resumo.ebitda_pct_medio)}
              max={20}
              color="var(--brand)"
            />
          )}
        </KpiCard>
        <KpiCard
          label="Aprovações pendentes"
          value={resumo.aprovacoes_pendentes}
          sub={
            resumo.itens_cmv_criticos > 0
              ? `${resumo.itens_cmv_criticos} itens CMV > 40%`
              : "CMV sob controle"
          }
        />
      </section>

      {/* Aprovações pendentes inline */}
      {aprovacoes.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "var(--text-3)",
              margin: "0 0 10px",
            }}
          >
            Aprovações pendentes
          </h2>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {aprovacoes.map((a, i) => (
              <div
                key={a.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 16,
                  padding: "14px 18px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text)",
                      marginBottom: 2,
                    }}
                  >
                    {a.descricao}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-3)",
                      letterSpacing: 0.3,
                    }}
                  >
                    {a.brand_name}
                    {a.categoria_despesa
                      ? ` · ${CATEGORIA_DESPESA_LABELS[a.categoria_despesa as CategoriaDespesa]}`
                      : ""}
                    {a.fornecedor ? ` · ${a.fornecedor}` : ""}
                    {a.solicitante_email ? ` · ${a.solicitante_email}` : ""}
                  </div>
                  {a.justificativa && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-2)",
                        marginTop: 4,
                        fontStyle: "italic",
                      }}
                    >
                      “{a.justificativa}”
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--text)",
                    textAlign: "right",
                  }}
                >
                  {formatBRL(a.valor)}
                </div>
                <AprovacaoActions
                  approvalId={a.id}
                  canRespond={isAprovador}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cards por marca operacional */}
      <h2
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "var(--text-3)",
          margin: "0 0 10px",
        }}
      >
        Marcas operacionais
      </h2>
      {operacionais.length === 0 ? (
        <div
          style={{
            padding: 28,
            textAlign: "center",
            background: "var(--surface)",
            border: "1px dashed var(--border)",
            borderRadius: 14,
            fontSize: 13,
            color: "var(--text-3)",
          }}
        >
          Nenhuma marca tem período financeiro aberto. Crie um período pra
          começar a registrar lançamentos.
        </div>
      ) : (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
            marginBottom: 28,
          }}
        >
          {operacionais.map((b) => {
            const dre = dreByBrand.get(b.id);
            return (
              <Link
                key={b.id}
                href={`/financeiro/${b.slug}`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "16px 18px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  position: "relative",
                  overflow: "hidden",
                  transition: "border-color var(--t)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    background: b.color || "var(--brand)",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 99,
                      background: b.color || "var(--brand)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text)",
                      letterSpacing: -0.2,
                    }}
                  >
                    {b.name}
                  </span>
                </div>

                {dre ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <Row
                      label="Receita bruta"
                      value={formatBRLCompact(dre.receita_bruta)}
                    />
                    <Row
                      label="CMV"
                      value={
                        <SeverityBadge severity={getCmvSeverity(dre.cmv_pct)}>
                          {formatPct(dre.cmv_pct)}
                        </SeverityBadge>
                      }
                    />
                    <Row
                      label="EBITDA"
                      value={
                        <SeverityBadge severity={getEbitdaSeverity(dre.ebitda_pct)}>
                          {formatPct(dre.ebitda_pct)}
                        </SeverityBadge>
                      }
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-3)",
                      fontStyle: "italic",
                    }}
                  >
                    Sem lançamentos no mês ainda.
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "auto",
                    paddingTop: 8,
                    borderTop: "1px solid var(--border)",
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: "var(--text-3)" }}>
                    {/* Indicador de gap (placeholder até gap aggregado) */}
                    {dre?.cmv_pct !== undefined && dre?.cmv_pct !== null
                      ? `Gap CMV: ${getGapSeverity(dre.cmv_pct - 28)}`
                      : "—"}
                  </span>
                  <span
                    style={{
                      color: "var(--brand)",
                      fontWeight: 700,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                    }}
                  >
                    Ver DRE →
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
      )}

      {semOperacao.length > 0 && (
        <details>
          <summary
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              cursor: "pointer",
              fontWeight: 600,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            {semOperacao.length} marcas sem período financeiro
          </summary>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              marginTop: 8,
              lineHeight: 1.6,
            }}
          >
            {semOperacao.map((b) => b.name).join(" · ")}. Crie o período pela
            página da marca pra começar a registrar lançamentos.
          </p>
        </details>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--text-3)" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "var(--text)" }}>{value}</span>
    </div>
  );
}
