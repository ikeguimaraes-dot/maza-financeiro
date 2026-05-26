import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@kph/auth/server";
import {
  getBrandBySlug,
  getBrandFinancialConfig,
  getCashFlowEntries,
  getCmvDashboard,
  getDreConsolidado,
  getGapProjecaoRealizado,
  getOrCreatePeriod,
} from "../actions";
import { DreCard } from "@/components/financeiro/DreCard";
import { GapTable } from "@/components/financeiro/GapTable";
import { SeverityBadge } from "@/components/financeiro/SeverityBadge";
import { KpiCard } from "@kph/ui/kpi-card";
import {
  CATEGORIA_DESPESA_LABELS,
  CATEGORIA_RECEITA_LABELS,
  LANCAMENTO_STATUS_LABELS,
  STATUS_COLORS,
} from "@/lib/financeiro/labels";
import {
  competenciaLabel,
  competenciaShift,
  formatBRL,
  formatPct,
  getCmvSeverity,
  getCompetenciaAtual,
  getEbitdaSeverity,
} from "@/lib/financeiro/utils";
import type {
  CategoriaDespesa,
  CategoriaReceita,
  CashFlowEntryRow,
} from "@kph/db/types/database";

export const dynamic = "force-dynamic";

type Params = Promise<{ brand_slug: string }>;
type SearchParams = Promise<{ competencia?: string }>;

const compRegex = /^\d{4}-\d{2}-\d{2}$/;

export default async function FinanceiroBrandPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await requireUser();
  const { brand_slug } = await params;
  const sp = await searchParams;
  const compRaw = sp.competencia ?? getCompetenciaAtual();
  const comp = compRegex.test(compRaw) ? compRaw : getCompetenciaAtual();

  const brand = await getBrandBySlug(brand_slug);
  if (!brand) notFound();

  // Garante o período + carrega tudo em paralelo.
  const periodResult = await getOrCreatePeriod(brand.id, comp);
  if (!periodResult.ok) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p style={{ color: "#EF4444", fontSize: 13 }}>
          Erro ao carregar período: {periodResult.error}
        </p>
      </div>
    );
  }
  const period = periodResult.data;

  const [dre, gap, entries, cmvDash, config] = await Promise.all([
    getDreConsolidado(brand.id, comp),
    getGapProjecaoRealizado(brand.id, comp),
    getCashFlowEntries(period.id),
    getCmvDashboard(brand.id),
    getBrandFinancialConfig(brand.id),
  ]);

  const eventoSuperestimado = gap.find(
    (g) => g.is_evento && g.gap_pct !== null && Math.abs(g.gap_pct) > 10,
  );

  const compPrev = competenciaShift(comp, -1);
  const compNext = competenciaShift(comp, 1);

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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 99,
                background: brand.color || "var(--brand)",
              }}
            />
            <h1
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "var(--text)",
                letterSpacing: -0.5,
                margin: 0,
              }}
            >
              {brand.name}
            </h1>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>
            DRE consolidado · {competenciaLabel(comp)}
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
          <Link
            href={`/financeiro/${brand_slug}/lancamento`}
            style={{
              marginLeft: 8,
              background: "var(--brand)",
              color: "#fff",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            + Novo lançamento
          </Link>
        </nav>
      </header>

      {/* Alert se evento superestimado */}
      {eventoSuperestimado && (
        <div
          role="alert"
          style={{
            padding: "14px 16px",
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.40)",
            color: "#EF4444",
            borderRadius: 12,
            fontSize: 13,
            lineHeight: 1.55,
            marginBottom: 22,
          }}
        >
          <strong>Atenção: receita de eventos superestimada.</strong> Gap de{" "}
          {formatPct(eventoSuperestimado.gap_pct)} em{" "}
          {eventoSuperestimado.categoria}. Revise o modelo de projeção — segundas
          e sextas tendem a ser superestimadas pela conflação com receita base.
        </div>
      )}

      {/* SEÇÃO 1 — DRE Resumida */}
      <h2 style={sectionTitle}>DRE resumida</h2>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 28,
        }}
      >
        {/* Receitas */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "18px 18px 14px",
          }}
        >
          <h3 style={subTitle}>Receitas</h3>
          <DreCard label="Vendas Salão" valor={dre?.vendas_salao} />
          <DreCard
            label="Eventos / Private Dining"
            valor={dre?.vendas_eventos}
            hint={
              dre && dre.receita_bruta > 0
                ? Number(dre.vendas_eventos) / Number(dre.receita_bruta) > 0.3
                  ? "⚠ Mais de 30% da receita — alerta de dependência"
                  : undefined
                : undefined
            }
          />
          <DreCard label="Bar" valor={dre?.vendas_bar} />
          <DreCard label="Delivery" valor={dre?.vendas_delivery} />
          <div style={{ marginTop: 8 }}>
            <DreCard
              label="Receita bruta"
              valor={dre?.receita_bruta}
              highlight
            />
          </div>
        </div>

        {/* Despesas */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "18px 18px 14px",
          }}
        >
          <h3 style={subTitle}>Despesas</h3>
          <DreCard
            label="CMV total"
            valor={dre?.cmv_total}
            pct={dre?.cmv_pct}
            meta={config?.meta_cmv_pct ?? 28}
            severity={getCmvSeverity(dre?.cmv_pct)}
          />
          <DreCard
            label="Folha total"
            valor={dre?.folha_total}
            pct={dre?.folha_pct}
          />
          <DreCard
            label="Prime cost"
            valor={dre?.prime_cost}
            pct={dre?.prime_cost_pct}
            meta={config?.meta_prime_cost_pct ?? 60}
            emphasized
          />
          <DreCard label="Ocupação" valor={dre?.ocupacao_total} />
          <DreCard label="Utilidades" valor={dre?.utilidades_total} />
          <DreCard label="Comercial" valor={dre?.comercial_total} />
          <DreCard label="Tributos" valor={dre?.tributos_total} />
          <div style={{ marginTop: 8 }}>
            <DreCard
              label="Despesa total"
              valor={dre?.despesa_total}
              highlight
            />
            <div style={{ marginTop: 8 }}>
              <DreCard
                label="EBITDA"
                valor={dre?.ebitda}
                pct={dre?.ebitda_pct}
                meta={config?.meta_ebitda_pct ?? 18}
                severity={getEbitdaSeverity(dre?.ebitda_pct)}
                highlight
              />
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO 2 — Gap projeção × realizado */}
      <h2 style={sectionTitle}>Gap projeção × realizado</h2>
      <div style={{ marginBottom: 28 }}>
        <GapTable rows={gap} />
      </div>

      {/* SEÇÃO 3 — Lançamentos do período */}
      <h2 style={sectionTitle}>Lançamentos do período</h2>
      <EntriesTable entries={entries} />
      <div style={{ height: 28 }} />

      {/* SEÇÃO 4 — CMV resumo */}
      <h2 style={sectionTitle}>CMV da marca</h2>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <KpiCard
          label="Total de itens"
          value={cmvDash?.total_itens ?? 0}
          sub="Cadastrados ativos"
        />
        <KpiCard
          label="Sem ficha técnica"
          value={cmvDash?.sem_ficha_tecnica ?? 0}
          sub="Itens incompletos"
        />
        <KpiCard
          label="CMV > 40%"
          value={cmvDash?.itens_criticos_acima_40 ?? 0}
          sub="Itens críticos"
        />
        <KpiCard
          label="CMV médio"
          value={
            <SeverityBadge severity={getCmvSeverity(cmvDash?.cmv_medio_pct ?? null)}>
              {formatPct(cmvDash?.cmv_medio_pct ?? null)}
            </SeverityBadge>
          }
          sub="Sobre o cardápio ativo"
        />
      </section>
      <Link
        href={`/financeiro/${brand_slug}/cmv`}
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: "var(--brand)",
          textDecoration: "none",
        }}
      >
        Ver CMV detalhado →
      </Link>
    </div>
  );
}

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

function EntriesTable({ entries }: { entries: CashFlowEntryRow[] }) {
  if (entries.length === 0) {
    return (
      <div
        style={{
          padding: "24px 22px",
          fontSize: 13,
          color: "var(--text-3)",
          background: "var(--surface)",
          border: "1px dashed var(--border)",
          borderRadius: 12,
        }}
      >
        Nenhum lançamento neste período.
      </div>
    );
  }
  return (
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
          minWidth: 720,
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
            <Th>Categoria</Th>
            <Th>Descrição</Th>
            <Th>Fornecedor</Th>
            <Th align="right">Valor</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const c = STATUS_COLORS[e.status];
            const cat =
              e.natureza === "receita"
                ? CATEGORIA_RECEITA_LABELS[e.categoria_receita as CategoriaReceita] ?? "—"
                : CATEGORIA_DESPESA_LABELS[e.categoria_despesa as CategoriaDespesa] ?? "—";
            return (
              <tr key={e.id}>
                <Td>{e.data_lancamento}</Td>
                <Td>{cat}</Td>
                <Td>{e.descricao}</Td>
                <Td>{e.fornecedor ?? "—"}</Td>
                <Td align="right">
                  <span
                    style={{
                      color: e.natureza === "receita" ? "#22C55E" : "var(--text)",
                      fontWeight: 600,
                    }}
                  >
                    {e.natureza === "despesa" ? "-" : "+"} {formatBRL(e.valor)}
                  </span>
                </Td>
                <Td>
                  <span
                    style={{
                      display: "inline-flex",
                      padding: "2px 8px",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      background: c.bg,
                      border: `1px solid ${c.border}`,
                      color: c.fg,
                      borderRadius: 99,
                    }}
                  >
                    {LANCAMENTO_STATUS_LABELS[e.status]}
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--text)",
        borderBottom: "1px solid var(--border)",
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

const subTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: "var(--text-3)",
  margin: "0 0 12px",
};

