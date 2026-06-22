import Link from "next/link";
import { requireUser } from "@kph/auth/server";
import { getPagarKpisETitulos } from "../actions-operations";
import { ImportPagarButton } from "@/components/financeiro/ImportPagarButton";
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
            {competenciaLabel(comp)}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ImportPagarButton />
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
        </div>
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
          <table style={{ fontSize: 11, borderCollapse: "collapse", whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-3)", fontWeight: 700, textAlign: "left" }}>
                {COLS.map((c) => <Th key={c.h} align={c.align}>{c.h}</Th>)}
              </tr>
            </thead>
            <tbody>
              {titulos.map((t) => {
                const vencido = t.d_vencimento && new Date(`${t.d_vencimento}T12:00:00`) < new Date(new Date().toDateString());
                return (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: vencido && (t.v_saldo_atual ?? 0) > 0 ? "rgba(239,68,68,0.04)" : "transparent",
                    }}
                  >
                    {COLS.map((c) => (
                      <Td key={c.h} align={c.align}>
                        {c.render(t, { vencido: !!vencido, formatBRL, SituacaoBadge })}
                      </Td>
                    ))}
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

// ── Definição de colunas ─────────────────────────────────────────────────────

type ColCtx = { vencido: boolean; formatBRL: (n: number | null | undefined) => string; SituacaoBadge: React.FC<{ situacao: string | null }> };
type Col = { h: string; align?: "right"; render: (t: TituloAPagar, ctx: ColCtx) => React.ReactNode };

function fmtDate(d: string | null) {
  return d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—";
}
function fmtNum(n: number | null | undefined) {
  return n != null ? n.toLocaleString("pt-BR") : "—";
}

const COLS: Col[] = [
  { h: "Tipo",                render: (t) => t.tipo ?? "—" },
  { h: "Origem",              render: (t) => t.origem ?? "—" },
  { h: "N.Nota Fiscal",       render: (t) => t.n_nota_fiscal ?? "—" },
  { h: "Empresa",             render: (t) => t.empresa ?? "—" },
  { h: "Fantasia Empresa",    render: (t) => t.fantasia_empresa ?? "—" },
  { h: "Fornecedor",          render: (t) => t.fornecedor ?? "—" },
  { h: "Razão Fornecedor",    render: (t) => t.razao_fornecedor ?? "—" },
  { h: "Fantasia Fornecedor", render: (t) => t.fantasia_fornecedor ?? "—" },
  { h: "CNPJ/CPF",           render: (t) => t.cnpj_cpf_fornecedor ?? "—" },
  { h: "N. Conta",            render: (t) => t.n_conta ?? "—" },
  { h: "T. Fornecedor",       render: (t) => t.t_fornecedor ?? "—" },
  { h: "Grupo Econômico",     render: (t) => t.grupo_economico ?? "—" },
  { h: "CEP",                 render: (t) => t.cep ?? "—" },
  { h: "Bairro",              render: (t) => t.bairro ?? "—" },
  { h: "Cidade",              render: (t) => t.cidade ?? "—" },
  { h: "UF",                  render: (t) => t.uf ?? "—" },
  { h: "País",                render: (t) => t.pais ?? "—" },
  { h: "Cond. Compra",        render: (t) => t.condicao_compra ?? "—" },
  { h: "Prazo Médio",         align: "right", render: (t) => fmtNum(t.prazo_medio) },
  { h: "Série",               render: (t) => t.serie ?? "—" },
  { h: "N. Título",           render: (t) => t.n_titulo ?? "—" },
  { h: "Parcela",             render: (t) => t.parcela ?? "—" },
  { h: "Documento",           render: (t) => t.documento ?? "—" },
  { h: "Portador",            render: (t) => t.portador_num ?? "—" },
  { h: "Desc. Portador",      render: (t) => t.portador ?? "—" },
  { h: "C. Gerencial",        render: (t) => t.c_gerencial ?? "—" },
  { h: "Desc. C. Gerencial",  render: (t) => t.descricao_c_gerencial ?? "—" },
  { h: "D. Lançamento",       render: (t) => fmtDate(t.d_lancamento) },
  { h: "D. Competência",      render: (t) => fmtDate(t.d_competencia) },
  { h: "D. Autorização",      render: (t) => fmtDate(t.d_autorizacao_pgto) },
  { h: "D. Vencimento",       render: (t, { vencido }) => (
    <span style={{ color: vencido ? "#EF4444" : "var(--text)", fontWeight: vencido ? 600 : 400 }}>
      {fmtDate(t.d_vencimento)}
    </span>
  )},
  { h: "Dia Semana",          render: (t) => t.dia_semana ?? "—" },
  { h: "V. Desconto",         align: "right", render: (t, { formatBRL }) => formatBRL(t.v_desconto) },
  { h: "V. Multa Atraso",     align: "right", render: (t, { formatBRL }) => formatBRL(t.v_multa_atraso) },
  { h: "V. Juros Dia",        align: "right", render: (t, { formatBRL }) => formatBRL(t.v_juros_dia) },
  { h: "V. Título",           align: "right", render: (t, { formatBRL }) => formatBRL(t.v_titulo) },
  { h: "V. Original",         align: "right", render: (t, { formatBRL }) => formatBRL(t.v_original) },
  { h: "V. Saldo Anterior",   align: "right", render: (t, { formatBRL }) => formatBRL(t.v_saldo_anterior) },
  { h: "V. Créd. Período",    align: "right", render: (t, { formatBRL }) => formatBRL(t.v_credito_periodo) },
  { h: "V. Déb. Período",     align: "right", render: (t, { formatBRL }) => formatBRL(t.v_debito_periodo) },
  { h: "D. Liq. Período",     render: (t) => fmtDate(t.d_liquidacao_periodo) },
  { h: "Situação Período",    render: (t, { SituacaoBadge }) => <SituacaoBadge situacao={t.situacao_periodo} /> },
  { h: "V. Saldo Período",    align: "right", render: (t, { formatBRL }) => formatBRL(t.v_saldo_periodo) },
  { h: "Dias Atr. Período",   align: "right", render: (t) => fmtNum(t.dias_atraso_periodo) },
  { h: "V. Atraso Período",   align: "right", render: (t, { formatBRL }) => formatBRL(t.v_atraso_periodo) },
  { h: "V. Atual. Período",   align: "right", render: (t, { formatBRL }) => formatBRL(t.v_atualizado_periodo) },
  { h: "D. Liq. Atual",       render: (t) => fmtDate(t.d_liquidacao_atual) },
  { h: "Situação Atual",      render: (t, { SituacaoBadge }) => <SituacaoBadge situacao={t.situacao_atual} /> },
  { h: "V. Saldo Atual",      align: "right", render: (t, { formatBRL }) => <strong>{formatBRL(t.v_saldo_atual)}</strong> },
  { h: "Dias Atr. Atual",     align: "right", render: (t) => (
    <span style={{ color: (t.dias_atraso_atual ?? 0) > 0 ? "#EF4444" : "var(--text-3)", fontWeight: (t.dias_atraso_atual ?? 0) > 0 ? 600 : 400 }}>
      {(t.dias_atraso_atual ?? 0) > 0 ? `${t.dias_atraso_atual}d` : "—"}
    </span>
  )},
  { h: "V. Atraso Atual",     align: "right", render: (t, { formatBRL }) => formatBRL(t.v_atraso_atual) },
  { h: "V. Atual. Atual",     align: "right", render: (t, { formatBRL }) => formatBRL(t.v_atualizado_atual) },
  { h: "Ano",                 align: "right", render: (t) => fmtNum(t.ano) },
  { h: "Mês",                 render: (t) => t.mes ? fmtDate(t.mes) : "—" },
  { h: "Semana",              align: "right", render: (t) => fmtNum(t.semana) },
  { h: "Trimestre",           align: "right", render: (t) => fmtNum(t.trimestre) },
  { h: "Quadrimestre",        align: "right", render: (t) => fmtNum(t.quadrimestre) },
  { h: "FC",                  render: (t) => t.fluxo_de_caixa ? <span style={{ color: "#22C55E", fontWeight: 700 }}>✓</span> : <span style={{ color: "var(--text-3)" }}>—</span> },
  { h: "Tipo SEP",            render: (t) => t.tipo_sep ?? "—" },
];

import type { TituloAPagar } from "@kph/db/types/operations-database";

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
