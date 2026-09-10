import Link from "next/link";
import { formatBRL, formatPct } from "@/lib/financeiro/utils";
import type { KpiSnapshotRow, FonteSaudeRow } from "./types";

type Props = {
  unidade: string;
  atual: KpiSnapshotRow;
  fontes: FonteSaudeRow[];
  competencia: string;
};

const STATUS_COR: Record<string, string> = {
  viva: "#22C55E",
  atrasada: "#F59E0B",
  morta: "#EF4444",
};

export function ConfiancaEClassificar({ atual, fontes }: Props) {
  const confianca = atual.confianca_pct;
  const classificado = atual.pct_classificado;
  const abaixoDoLimite = confianca != null && confianca < 0.7;
  const valorNaoClassificado = atual.despesas_operacionais != null && classificado != null
    ? atual.despesas_operacionais * (1 - classificado)
    : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
      {/* ── Linha 2: índice de confiança ── */}
      <div style={{
        background: abaixoDoLimite ? "rgba(245,158,11,0.08)" : "var(--surface)",
        border: `1px solid ${abaixoDoLimite ? "#F59E0B" : "var(--border)"}`,
        borderRadius: 12, padding: "14px 16px", display: "grid", gap: 10,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-3)" }}>
            Índice de confiança
          </span>
          <span style={{ fontSize: 20, fontWeight: 800, color: abaixoDoLimite ? "#F59E0B" : "var(--text)" }}>
            {confianca != null ? formatPct(confianca * 100, 0) : "—"}
          </span>
        </div>

        <div style={{ height: 6, borderRadius: 99, background: "var(--surface-2)", overflow: "hidden" }}>
          <div style={{
            width: `${Math.max(0, Math.min(100, (confianca ?? 0) * 100))}%`, height: "100%",
            background: abaixoDoLimite ? "#F59E0B" : "#22C55E",
          }} />
        </div>

        {abaixoDoLimite && (
          <p style={{ fontSize: 12, color: "#F59E0B", margin: 0, fontWeight: 600 }}>
            Números parciais — {formatPct((1 - (classificado ?? 0)) * 100, 0)} dos lançamentos sem classificação.
          </p>
        )}

        <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>
          {formatPct((classificado ?? 0) * 100, 0)} classificado · {atual.fontes_ok ?? "—"}/{atual.fontes_total ?? "—"} fontes vivas
        </p>

        <div style={{ display: "grid", gap: 4, maxHeight: 140, overflowY: "auto" }}>
          {fontes.map((f) => (
            <div key={f.fonte} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "var(--text-2)" }}>{f.fonte}</span>
              <span style={{ color: STATUS_COR[f.status_fonte] ?? "var(--text-3)", fontWeight: 600 }}>
                {f.status_fonte}{f.dias_sem_atualizacao != null ? ` · ${f.dias_sem_atualizacao}d` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Linha 3: a classificar + possível dupla contagem ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
        padding: "14px 16px", display: "grid", gap: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-3)" }}>
          Pendências do razão
        </span>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 12, color: "var(--text-2)", margin: "0 0 2px" }}>A classificar (conta 9.99)</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: 0 }}>
              {valorNaoClassificado != null ? formatBRL(valorNaoClassificado) : "—"}
            </p>
          </div>
          <Link href="/financeiro/dre/classificacao" style={{
            fontSize: 11, fontWeight: 700, color: "var(--brand, #C4622D)", textDecoration: "none",
            whiteSpace: "nowrap",
          }}>
            Classificar →
          </Link>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <p style={{ fontSize: 12, color: "var(--text-2)", margin: "0 0 2px" }}>Possível dupla contagem</p>
          <p style={{ fontSize: 18, fontWeight: 700,
            color: (atual.possivel_dupla_contagem ?? 0) > 0 ? "#F59E0B" : "var(--text)", margin: 0 }}>
            {formatBRL(atual.possivel_dupla_contagem ?? 0)}
          </p>
          {(atual.possivel_dupla_contagem ?? 0) > 0 && (
            <p style={{ fontSize: 11, color: "var(--text-3)", margin: "2px 0 0" }}>
              Título com NF-e candidata ainda não confirmada — EBITDA pode estar subestimado nesse valor.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
