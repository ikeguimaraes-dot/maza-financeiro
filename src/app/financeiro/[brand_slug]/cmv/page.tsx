import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@kph/auth/server";
import {
  getBrandBySlug,
  getCmvDashboard,
  getMenuItems,
} from "../../actions";
import { KpiCard } from "@kph/ui/kpi-card";
import { SeverityBadge } from "@/components/financeiro/SeverityBadge";
import { CmvCreateForm } from "@/components/financeiro/CmvCreateForm";
import { CMV_CATEGORIA_OPTIONS } from "@/lib/financeiro/labels";
import {
  formatBRL,
  formatPct,
  getCmvSeverity,
} from "@/lib/financeiro/utils";

export const dynamic = "force-dynamic";

type Params = Promise<{ brand_slug: string }>;
type SearchParams = Promise<{
  categoria?: string;
  criticos?: string;
  sem_ficha?: string;
}>;

export default async function CmvPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await requireUser();
  const { brand_slug } = await params;
  const sp = await searchParams;

  const brand = await getBrandBySlug(brand_slug);
  if (!brand) notFound();

  const filters = {
    categoria: sp.categoria || null,
    criticos: sp.criticos === "1",
    semFicha: sp.sem_ficha === "1",
  };

  const [dash, items] = await Promise.all([
    getCmvDashboard(brand.id),
    getMenuItems(brand.id, filters),
  ]);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto" }}>
      <Link
        href={`/financeiro/${brand_slug}`}
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          textDecoration: "none",
          fontWeight: 600,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        ← {brand.name}
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
              fontSize: 24,
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: -0.5,
              margin: 0,
            }}
          >
            CMV · {brand.name}
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 6 }}>
            Fichas técnicas e custo de mercadoria por item.
          </p>
        </div>
        <CmvCreateForm brandId={brand.id} />
      </header>

      {/* KPIs */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 22,
        }}
      >
        <KpiCard
          label="Total de itens"
          value={dash?.total_itens ?? 0}
          sub="Cadastrados ativos"
        />
        <KpiCard
          label="Sem ficha técnica"
          value={dash?.sem_ficha_tecnica ?? 0}
          sub="A revisar"
        />
        <KpiCard
          label="CMV > 40%"
          value={dash?.itens_criticos_acima_40 ?? 0}
          sub="Itens críticos"
        />
        <KpiCard
          label="CMV médio"
          value={
            <SeverityBadge severity={getCmvSeverity(dash?.cmv_medio_pct ?? null)}>
              {formatPct(dash?.cmv_medio_pct ?? null)}
            </SeverityBadge>
          }
          sub="Sobre o cardápio ativo"
        />
      </section>

      {/* Filtros */}
      <form
        method="GET"
        style={{
          display: "flex",
          gap: 12,
          alignItems: "end",
          padding: "12px 14px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={labelStyle} htmlFor="filt-cat">Categoria</label>
          <select
            id="filt-cat"
            name="categoria"
            defaultValue={filters.categoria ?? ""}
            style={inputStyle}
          >
            <option value="">Todas</option>
            {CMV_CATEGORIA_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <CheckOpt
          name="criticos"
          label="Apenas críticos (CMV > 40%)"
          defaultChecked={filters.criticos}
        />
        <CheckOpt
          name="sem_ficha"
          label="Apenas sem ficha técnica"
          defaultChecked={filters.semFicha}
        />
        <button
          type="submit"
          style={{
            ...inputStyle,
            padding: "8px 14px",
            background: "var(--brand)",
            color: "#fff",
            border: "1px solid var(--brand)",
            fontWeight: 600,
            cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          Filtrar
        </button>
      </form>

      {/* Tabela */}
      {items.length === 0 ? (
        <div
          style={{
            padding: "28px 22px",
            textAlign: "center",
            background: "var(--surface)",
            border: "1px dashed var(--border)",
            borderRadius: 14,
            fontSize: 13,
            color: "var(--text-3)",
          }}
        >
          Nenhum item encontrado com esses filtros.
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
                <Th>Nome</Th>
                <Th>Categoria</Th>
                <Th align="right">Preço Venda</Th>
                <Th align="right">Custo</Th>
                <Th align="right">CMV%</Th>
                <Th align="center">Ficha técnica</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const sev = getCmvSeverity(it.cmv_pct);
                const isCritical = sev === "critico";
                const isSemFicha = !it.tem_ficha_tecnica;
                return (
                  <tr
                    key={it.id}
                    style={{
                      background: isCritical
                        ? "rgba(239,68,68,0.06)"
                        : isSemFicha
                          ? "rgba(148,163,184,0.05)"
                          : undefined,
                    }}
                  >
                    <Td>{it.nome}</Td>
                    <Td>{it.categoria.replace(/_/g, " ")}</Td>
                    <Td align="right">{formatBRL(it.preco_venda)}</Td>
                    <Td align="right">{formatBRL(it.custo_total)}</Td>
                    <Td align="right">
                      {it.cmv_pct !== null ? (
                        <SeverityBadge severity={sev}>
                          {formatPct(it.cmv_pct)}
                        </SeverityBadge>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </Td>
                    <Td align="center">
                      {it.tem_ficha_tecnica ? (
                        <span style={{ color: "#22C55E", fontWeight: 700 }}>✓</span>
                      ) : (
                        <span style={{ color: "var(--text-3)", fontWeight: 700 }}>✗</span>
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

const inputStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "var(--text)",
  fontSize: 12,
  fontWeight: 500,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  color: "var(--text-3)",
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: "uppercase",
};

function CheckOpt({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--text-2)",
        cursor: "pointer",
      }}
    >
      <input type="checkbox" name={name} value="1" defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
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
  align?: "left" | "right" | "center";
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
