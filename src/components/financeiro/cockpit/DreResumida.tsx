"use client";

import { useState } from "react";
import { formatBRL, formatPct } from "@/lib/financeiro/utils";
import type { DreSnapshotRow, PlanoContaRow } from "./types";

type Props = {
  dreRows: DreSnapshotRow[];
  planoContas: PlanoContaRow[];
  receitaLiquida: number;
};

const GRUPO_LABEL: Record<string, string> = {
  receita: "Receita",
  deducao: "Deduções",
  cmv: "CMV",
  mao_de_obra: "Mão de obra",
  despesa_operacional: "Despesas operacionais",
  financeiro: "Financeiro",
  investimento: "Investimento",
};

const GRUPO_ORDEM = ["receita", "deducao", "cmv", "mao_de_obra", "despesa_operacional", "financeiro", "investimento"];

export function DreResumida({ dreRows, planoContas, receitaLiquida }: Props) {
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const contaPorCodigo = new Map(planoContas.map((p) => [p.codigo, p]));

  const totalPorConta = new Map<string, { valor: number; qtd: number }>();
  for (const r of dreRows) {
    const cur = totalPorConta.get(r.conta_codigo) ?? { valor: 0, qtd: 0 };
    cur.valor += Number(r.valor);
    cur.qtd += r.qtd_lancamentos;
    totalPorConta.set(r.conta_codigo, cur);
  }

  const porGrupo = new Map<string, Array<{ codigo: string; nome: string; valor: number; qtd: number }>>();
  for (const [codigo, v] of totalPorConta) {
    const conta = contaPorCodigo.get(codigo);
    const grupo = conta?.grupo ?? "despesa_operacional";
    const lista = porGrupo.get(grupo) ?? [];
    lista.push({ codigo, nome: conta?.nome ?? codigo, valor: v.valor, qtd: v.qtd });
    porGrupo.set(grupo, lista);
  }
  for (const lista of porGrupo.values()) {
    lista.sort((a, b) => contaPorCodigo.get(a.codigo)!.ordem - contaPorCodigo.get(b.codigo)!.ordem);
  }

  function toggle(grupo: string) {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(grupo)) next.delete(grupo);
      else next.add(grupo);
      return next;
    });
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-3)" }}>
          DRE resumida
        </span>
      </div>
      {GRUPO_ORDEM.filter((g) => porGrupo.has(g)).map((grupo) => {
        const contas = porGrupo.get(grupo)!;
        const totalGrupo = contas.reduce((s, c) => s + c.valor, 0);
        const pctReceita = receitaLiquida > 0 ? totalGrupo / receitaLiquida : null;
        const aberto = expandido.has(grupo);
        return (
          <div key={grupo} style={{ borderBottom: "1px solid var(--border)" }}>
            <button
              onClick={() => toggle(grupo)}
              style={{
                width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ transform: aberto ? "rotate(90deg)" : "none", transition: "transform var(--t, 0.15s)", fontSize: 10, color: "var(--text-3)" }}>▶</span>
                {GRUPO_LABEL[grupo] ?? grupo}
              </span>
              <span style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                  {pctReceita != null ? formatPct(pctReceita * 100) : "—"} da receita líq.
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{formatBRL(totalGrupo)}</span>
              </span>
            </button>
            {aberto && (
              <div style={{ padding: "0 16px 10px 34px", display: "grid", gap: 4 }}>
                {contas.map((c) => (
                  <div key={c.codigo} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--text-2)" }}>
                      {c.codigo} {c.nome}
                      {c.codigo === "9.99" && <span style={{ color: "#F59E0B", fontWeight: 700 }}> ⚠</span>}
                      <span style={{ color: "var(--text-3)" }}> · {c.qtd} lanç.</span>
                    </span>
                    <span style={{ color: "var(--text)" }}>{formatBRL(c.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {porGrupo.size === 0 && (
        <p style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>
          Nenhum lançamento nessa competência.
        </p>
      )}
    </div>
  );
}
