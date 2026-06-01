import Link from "next/link";

import { requireUser } from "@kph/auth/server";
import { getDreGrupoRealizado, type DreAgregado } from "../actions-dre";
import { formatBRL, formatBRLCompact, formatPct } from "@/lib/financeiro/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ mes?: string }>;

// ─── Helpers ──────────────────────────────────────────────────────

const MONTH_SHORT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const MONTH_LONG = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function parseMesAno(mesAno: string): { year: number; month: number } {
  const parts = mesAno.split("-");
  return {
    year: parseInt(parts[0] ?? "0", 10),
    month: parseInt(parts[1] ?? "0", 10),
  };
}

function shiftMesAno(mesAno: string, delta: number): string {
  let { year, month } = parseMesAno(mesAno);
  month += delta;
  while (month <= 0) { month += 12; year--; }
  while (month > 12) { month -= 12; year++; }
  return `${year}-${month}`;
}

function mesAnoShort(mesAno: string): string {
  const { year, month } = parseMesAno(mesAno);
  return `${MONTH_SHORT[month - 1] ?? "?"} ${String(year).slice(2)}`;
}

function mesAnoFull(mesAno: string): string {
  const { year, month } = parseMesAno(mesAno);
  return `${MONTH_LONG[month - 1] ?? "?"} ${year}`;
}

// ─── DRE row definitions ──────────────────────────────────────────

type DreRowDef = {
  label: string;
  prefix?: string;
  key: keyof DreAgregado;
  pctKey?: "cmv_pct" | "pessoal_pct" | "prime_cost_pct" | "ebitda_pct";
  isCost?: boolean;
  isHighlight?: boolean;
  amberAbove?: number;
  indent?: boolean;
  separator?: boolean;
};

const DRE_ROWS: DreRowDef[] = [
  { label: "Receita Bruta",   key: "receita_bruta" },
  { label: "CMV",             key: "cmv",           prefix: "(−)", pctKey: "cmv_pct",     isCost: true, indent: true, amberAbove: 35 },
  { label: "Lucro Bruto",     key: "lucro_bruto",   prefix: "(=)", isHighlight: true, separator: true },
  { label: "Pessoal",         key: "pessoal",       prefix: "(−)", pctKey: "pessoal_pct", isCost: true, indent: true, amberAbove: 30 },
  { label: "Ocupação",        key: "ocupacao",      prefix: "(−)", isCost: true, indent: true },
  { label: "Utilidades",      key: "utilidades",    prefix: "(−)", isCost: true, indent: true },
  { label: "Operação",        key: "operacao",      prefix: "(−)", isCost: true, indent: true },
  { label: "Manutenção",      key: "manutencao",    prefix: "(−)", isCost: true, indent: true },
  { label: "Administrativa",  key: "administrativa",prefix: "(−)", isCost: true, indent: true },
  { label: "Marketing",       key: "marketing",     prefix: "(−)", isCost: true, indent: true },
  { label: "Taxa Cartão",     key: "taxa_cartao",   prefix: "(−)", isCost: true, indent: true },
  { label: "Impostos",        key: "impostos",      prefix: "(−)", isCost: true, indent: true },
  { label: "EBITDA",          key: "ebitda",        prefix: "(=)", pctKey: "ebitda_pct",  isHighlight: true, separator: true },
  { label: "Resultado Líquido",key: "resultado_liquido", prefix: "(=)", isHighlight: true },
];

// ─── Page ─────────────────────────────────────────────────────────

export default async function DreConsolidadoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireUser();
  const sp = await searchParams;

  const allRealizado = await getDreGrupoRealizado();

  if (allRealizado.length === 0) {
    return <EmptyState />;
  }

  const mostRecent = allRealizado[allRealizado.length - 1]!.mes_ano;
  const anchor = sp.mes ?? mostRecent;

  // 4-month window ending at anchor
  const windowMeses = [-3, -2, -1, 0].map((d) => shiftMesAno(anchor, d));
  const dataByMes = new Map(allRealizado.map((r) => [r.mes_ano, r]));
  const cols = windowMeses.map((m) => dataByMes.get(m) ?? null);

  const prevAnchor = shiftMesAno(anchor, -1);
  const nextAnchor = shiftMesAno(anchor, 1);

  const maxMarcas = Math.max(...allRealizado.map((r) => r.num_marcas));
  const anchorHasData = dataByMes.has(anchor);
  const dreLabel = anchorHasData ? null : `dados de ${mesAnoShort(mostRecent)}`;

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
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: -0.5,
              margin: 0,
            }}
          >
            DRE Consolidado — Grupo KPH
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            Últimos 4 meses · realizado
            {dreLabel && (
              <span style={{ color: "#EAB308", marginLeft: 8 }}>({dreLabel})</span>
            )}
          </p>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NavBtn href={`?mes=${prevAnchor}`} label="←" title="Janela anterior" />
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
              whiteSpace: "nowrap",
            }}
          >
            {mesAnoFull(anchor)}
          </span>
          <NavBtn href={`?mes=${nextAnchor}`} label="→" title="Janela seguinte" />
        </nav>
      </header>

      {/* DRE Table */}
      <div
        style={{
          overflowX: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          marginBottom: 24,
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            minWidth: 600,
          }}
        >
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <th
                style={{
                  textAlign: "left",
                  padding: "10px 16px",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  width: 210,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                Linha DRE
              </th>
              {windowMeses.map((m) => (
                <th
                  key={m}
                  style={{
                    textAlign: "right",
                    padding: "10px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    color: dataByMes.has(m) ? "var(--text)" : "var(--text-3)",
                    borderBottom: "1px solid var(--border)",
                    borderLeft: "1px solid var(--border)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {mesAnoShort(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DRE_ROWS.map((row, idx) => (
              <DreTableRow
                key={String(row.key)}
                row={row}
                cols={cols}
                isFirst={idx === 0}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Quick KPI summary */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {cols.map((col, ci) =>
          col ? (
            <div
              key={ci}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "14px 16px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  marginBottom: 6,
                }}
              >
                {mesAnoShort(col.mes_ano)}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatBRLCompact(col.receita_bruta)}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 11 }}>
                <span
                  style={{
                    color:
                      col.cmv_pct !== null && col.cmv_pct > 35
                        ? "#A16207"
                        : "var(--text-3)",
                  }}
                >
                  CMV {formatPct(col.cmv_pct)}
                </span>
                <span
                  style={{
                    color:
                      col.ebitda_pct === null
                        ? "var(--text-3)"
                        : col.ebitda_pct > 15
                        ? "#15803D"
                        : col.ebitda_pct >= 8
                        ? "#A16207"
                        : "#B91C1C",
                    fontWeight: 600,
                  }}
                >
                  EBITDA {formatPct(col.ebitda_pct)}
                </span>
              </div>
            </div>
          ) : null,
        )}
      </section>

      <p
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          textAlign: "center",
          letterSpacing: 0.4,
        }}
      >
        Consolidado de {maxMarcas} marca{maxMarcas !== 1 ? "s" : ""} ativa
        {maxMarcas !== 1 ? "s" : ""} · apenas lançamentos realizados
      </p>
    </div>
  );
}

// ─── DreTableRow ──────────────────────────────────────────────────

function DreTableRow({
  row,
  cols,
  isFirst,
}: {
  row: DreRowDef;
  cols: Array<DreAgregado | null>;
  isFirst: boolean;
}) {
  return (
    <tr
      style={{
        background: row.isHighlight ? "var(--surface-2)" : undefined,
        borderTop: row.separator
          ? "2px solid var(--border)"
          : isFirst
          ? undefined
          : "1px solid var(--border)",
      }}
    >
      {/* Label cell */}
      <td
        style={{
          padding: row.indent ? "7px 16px 7px 28px" : "7px 16px",
          color: row.isHighlight ? "var(--text)" : "var(--text-2)",
          fontWeight: row.isHighlight ? 700 : 400,
          fontSize: 12,
          whiteSpace: "nowrap",
        }}
      >
        {row.prefix && (
          <span
            style={{
              fontSize: 10,
              color: "var(--text-3)",
              marginRight: 6,
              fontFamily: "monospace",
            }}
          >
            {row.prefix}
          </span>
        )}
        {row.label}
      </td>

      {/* Data cells */}
      {cols.map((col, ci) => {
        const rawValue = col ? (col[row.key] as number | null) : null;
        const displayValue =
          rawValue === null ? null : row.isCost ? Math.abs(rawValue) : rawValue;
        const pct =
          row.pctKey && col ? (col[row.pctKey] as number | null) : null;
        const isAmber =
          row.amberAbove !== undefined && pct !== null && pct > row.amberAbove;
        const valueColor =
          col === null || rawValue === null
            ? "var(--text-3)"
            : row.isHighlight
            ? rawValue >= 0
              ? "#15803D"
              : "#B91C1C"
            : isAmber
            ? "#A16207"
            : "var(--text)";

        return (
          <td
            key={ci}
            style={{
              textAlign: "right",
              padding: "7px 16px",
              borderLeft: "1px solid var(--border)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {displayValue === null ? (
              <span style={{ color: "var(--text-3)", fontSize: 11 }}>—</span>
            ) : (
              <>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: row.isHighlight ? 700 : 400,
                    color: valueColor,
                  }}
                >
                  {formatBRL(displayValue)}
                </div>
                {pct !== null && (
                  <div
                    style={{
                      fontSize: 10,
                      color: isAmber ? "#A16207" : "var(--text-3)",
                      marginTop: 1,
                    }}
                  >
                    {formatPct(pct)}
                  </div>
                )}
              </>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ─── Nav button ───────────────────────────────────────────────────

function NavBtn({
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

// ─── Empty state ──────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
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
      <div
        style={{
          marginTop: 40,
          padding: "60px 32px",
          textAlign: "center",
          background: "var(--surface)",
          border: "1px dashed var(--border)",
          borderRadius: 16,
        }}
      >
        <h2
          style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 8px" }}
        >
          DRE Consolidado
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>
          Nenhum dado realizado encontrado. Importe os DREs das marcas para
          visualizar aqui.
        </p>
      </div>
    </div>
  );
}
