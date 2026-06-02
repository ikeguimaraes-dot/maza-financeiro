"use client"

import React, { useState } from "react"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import type { LinhaDetalhadaRow } from "./DreDrillTable"
import { formatBRLCompact } from "@/lib/financeiro/utils"

export type DespesaAgg = {
  mes_ano: string
  tipo_despesa: string
  classificacao_dre: string
  total: number
}

export type PessoalDetalheRow = {
  mes_ano: string
  categoria: string
  valor: number | null
}

export type ManutencaoDetalheRow = {
  mes_ano: string
  fornecedor: string
  categoria: string
  valor: number
}

export type PrestadorRow = {
  mes_ano: string
  nome: string
  grupo: string
  valor: number
}

export type ContratoFixoRow = {
  id?: number
  razao_social: string
  descricao: string | null
  valor_mensal: number
  codigo_contabil: string | null
  tipo: string | null
}

const GRUPO_CORES: Record<string, string> = {
  "CUSTOS DOS PRODUTOS VENDIDOS": "#EF4444",
  "PESSOAL":                      "#8B5CF6",
  "OCUPAÇÃO":                     "#F59E0B",
  "OPERAÇÃO":                     "#3B82F6",
  "ADMINISTRATIVA":               "#22C55E",
  "MARKETING":                    "#D4A574",
  "TAXAS CARTÃO DE CRÉDITO":      "#64748B",
  "DESPESAS FINANCEIRAS":         "#94A3B8",
}
const COR_DEFAULT = "#374151"

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL",
    notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(v))

const fmtFull = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(v))

const fmtFullSigned = (v: number | null) => {
  if (v === null) return "—"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)
}

const MESES_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
const mesLabel = (m: string) => {
  const num = parseInt(m.split("-")[1] ?? "1", 10)
  return MESES_SHORT[(num - 1) % 12] ?? m
}

const normalizeMes = (m: string) => {
  const [ano, mes] = m.split("-")
  return `${ano}-${parseInt(mes ?? "0")}`
}

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <p style={{
    fontSize: 10, fontWeight: 700, letterSpacing: 1,
    textTransform: "uppercase", color: "var(--text-3)", margin: "0 0 10px",
  }}>
    {children}
  </p>
)

// Grupos in DRE order for linhas-based view
const DRE_GRUPOS = ["CMV","PESSOAL","OCUPAÇÃO","UTILIDADES","OPERAÇÃO","MANUTENÇÃO","ADMINISTRATIVA","MARKETING","TAXAS CARTÃO","DESP. FINANCEIRAS"]

type Props = {
  data: DespesaAgg[]
  linhas?: LinhaDetalhadaRow[]
  pessoal?: PessoalDetalheRow[]
  manutencao?: ManutencaoDetalheRow[]
  prestadores?: PrestadorRow[]
  contratos?: ContratoFixoRow[]
}

export function DespesasTab({ data, linhas = [], pessoal = [], manutencao = [], prestadores = [], contratos = [] }: Props) {
  // Months from linhas (preferred) or from data
  const linhasMeses = [...new Set(linhas.map((l) => l.mes_ano))].sort((a, b) => {
    const toN = (s: string) => { const [y,m] = s.split("-").map(Number); return (y??0)*12+(m??0) }
    return toN(a) - toN(b)
  })
  const dataMeses = [...new Set(data.map((d) => d.mes_ano))].sort((a, b) => {
    const toN = (s: string) => { const [y,m] = s.split("-").map(Number); return (y??0)*12+(m??0) }
    return toN(a) - toN(b)
  })
  const meses = linhasMeses.length > 0 ? linhasMeses : dataMeses
  // Realizado months only (linhas)
  const realMeses = [...new Set(linhas.filter(l => l.tipo === "realizado").map(l => l.mes_ano))].sort((a, b) => {
    const toN = (s: string) => { const [y,m] = s.split("-").map(Number); return (y??0)*12+(m??0) }
    return toN(a) - toN(b)
  })

  const [mesSel, setMesSel] = useState(() => normalizeMes(realMeses.at(-1) ?? meses.at(-1) ?? ""))
  const [grupoSel, setGrupoSel] = useState<string | null>(null)
  const [fvFilter, setFvFilter] = useState<"all" | "F" | "V">("all")

  const grupos = [...new Set(data.map((d) => d.tipo_despesa))].filter(Boolean)

  const byGrupo = grupos.map((g) => ({
    g,
    total: data.filter((d) => d.mes_ano === mesSel && d.tipo_despesa === g)
              .reduce((s, r) => s + Math.abs(r.total), 0),
  })).filter((x) => x.total > 0).sort((a, b) => b.total - a.total)

  const pieData = byGrupo.map(({ g, total }) => ({ name: g, value: total }))

  const detalhes = data
    .filter((d) => d.mes_ano === mesSel && (!grupoSel || d.tipo_despesa === grupoSel))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

  const totalMes = byGrupo.reduce((s, x) => s + x.total, 0)

  // Pessoal drill-down: pivot by categoria × mes
  const pessoalMeses = [...new Set(pessoal.map((r) => r.mes_ano))].sort((a, b) => {
    const toN = (s: string) => { const [y,m] = s.split("-").map(Number); return (y??0)*12+(m??0) }
    return toN(a) - toN(b)
  })
  const pessoalCats = [...new Set(pessoal.map((r) => r.categoria))]
  const getPessoal = (cat: string, mes: string) =>
    pessoal.find((r) => r.categoria === cat && r.mes_ano === mes)?.valor ?? null

  // Manutencao drill-down for selected month
  const manutMes = manutencao.filter((r) => r.mes_ano === mesSel)
    .sort((a, b) => a.valor - b.valor)

  // Prestadores pivot
  const prestMeses = [...new Set(prestadores.map((r) => r.mes_ano))].sort((a, b) => {
    const toN = (s: string) => { const [y,m] = s.split("-").map(Number); return (y??0)*12+(m??0) }
    return toN(a) - toN(b)
  })
  const prestOP = [...new Set(prestadores.filter((r) => r.grupo === "PJ OP").map((r) => r.nome))].sort()
  const prestADM = [...new Set(prestadores.filter((r) => r.grupo === "PJ ADM").map((r) => r.nome))].sort()
  const getPrest = (nome: string, mes: string) =>
    prestadores.find((r) => r.nome === nome && r.mes_ano === mes)?.valor ?? null

  // Contratos por tipo
  const contratoTipos = [...new Set(contratos.map((c) => c.tipo ?? "OUTROS"))].sort()
  const totalContratos = contratos.reduce((s, c) => s + c.valor_mensal, 0)

  // ── Linhas-based helpers ────────────────────────────────────────────────────

  const orcForMes = (grupo: string, descricao?: string) =>
    linhas.find(
      (l) => l.mes_ano === mesSel && l.tipo === "orcado" &&
        l.grupo === grupo && (descricao ? l.descricao === descricao : l.descricao.endsWith("Total"))
    )?.valor ?? null

  const reForMes = (grupo: string, descricao?: string) =>
    linhas.find(
      (l) => l.mes_ano === mesSel && l.tipo === "realizado" &&
        l.grupo === grupo && (descricao ? l.descricao === descricao : l.descricao.endsWith("Total"))
    )?.valor ?? null

  // Receita líquida for % calc
  const rlOrc = linhas.find(l => l.mes_ano === mesSel && l.tipo === "orcado" && l.descricao === "Receita Líquida")?.valor ?? null
  const rlRe  = linhas.find(l => l.mes_ano === mesSel && l.tipo === "realizado" && l.descricao === "Receita Líquida")?.valor ?? null

  function pctOf(v: number | null, base: number | null) {
    if (v === null || base === null || base === 0) return null
    return (v / base) * 100
  }

  function varR(a: number | null, b: number | null) {
    if (a === null || b === null) return null
    return a - b
  }

  function varPct(a: number | null, b: number | null) {
    if (a === null || b === null || b === 0) return null
    return ((a - b) / Math.abs(b)) * 100
  }

  function fmtPct(v: number | null) {
    if (v === null) return "—"
    return `${v.toFixed(1).replace(".", ",")}%`
  }

  function fmtVarR(v: number | null) {
    if (v === null) return "—"
    return `${v >= 0 ? "+" : "-"}${formatBRLCompact(Math.abs(v))}`
  }

  function fmtVarPct(v: number | null) {
    if (v === null) return "—"
    return `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`
  }

  function varColor(v: number | null) {
    if (v === null || Math.abs(v) < 0.5) return "var(--text-3)"
    return v > 0 ? "#22C55E" : "#EF4444"
  }

  // Subcategories for expanded grupo
  function getSubcats(grupo: string) {
    const bdMap = new Map<string, LinhaDetalhadaRow>()
    const reMap = new Map<string, LinhaDetalhadaRow>()
    for (const l of linhas) {
      if (l.mes_ano !== mesSel) continue
      if (l.grupo !== grupo) continue
      if (l.descricao.endsWith("Total") || l.descricao.endsWith(" %") || l.descricao === "Pessoal Operacional") continue
      if (fvFilter !== "all" && l.tipo === "orcado" && l.custo_tipo !== fvFilter) continue
      if (l.tipo === "orcado") bdMap.set(l.descricao, l)
      if (l.tipo === "realizado") reMap.set(l.descricao, l)
    }
    const allDescs = [...new Set([...bdMap.keys(), ...reMap.keys()])]
    return allDescs
      .map((d) => ({
        descricao: d,
        custo_tipo: bdMap.get(d)?.custo_tipo ?? null,
        bd: bdMap.get(d)?.valor ?? null,
        re: reMap.get(d)?.valor ?? null,
      }))
      .filter((sc) => fvFilter === "all" || sc.custo_tipo === fvFilter || sc.custo_tipo === null)
      .sort((a, b) => Math.abs(b.bd ?? b.re ?? 0) - Math.abs(a.bd ?? a.re ?? 0))
  }

  const hasLinhas = linhas.length > 0
  const hasRealMes = realMeses.includes(mesSel)

  return (
    <div style={{ display: "grid", gap: 32 }}>

      {/* ── Section 0: BD vs RE Comparison (from dre_linhas_detalhadas) ── */}
      {hasLinhas && (
        <div style={{ display: "grid", gap: 14 }}>
          <SectionHeader>Orçado vs Realizado por Grupo</SectionHeader>

          {/* Controls */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {realMeses.map((m) => (
              <button
                key={m}
                onClick={() => { setMesSel(normalizeMes(m)); setGrupoSel(null) }}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 12,
                  fontWeight: mesSel === m ? 700 : 500,
                  background: mesSel === m ? "var(--brand, #D4A574)" : "var(--surface)",
                  color: mesSel === m ? "#1A1208" : "var(--text-3)",
                  border: `1px solid ${mesSel === m ? "transparent" : "var(--border)"}`,
                  cursor: "pointer",
                }}
              >
                {mesLabel(m)}
              </button>
            ))}
            <div style={{ marginLeft: 8, display: "flex", gap: 4 }}>
              {(["all", "F", "V"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFvFilter(f)}
                  style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 11,
                    fontWeight: fvFilter === f ? 700 : 500,
                    background: fvFilter === f
                      ? f === "F" ? "rgba(96,165,250,0.2)" : f === "V" ? "rgba(245,158,11,0.2)" : "var(--surface-2)"
                      : "transparent",
                    color: f === "F" ? "#60A5FA" : f === "V" ? "#F59E0B" : "var(--text-3)",
                    border: `1px solid ${fvFilter === f ? "currentColor" : "var(--border)"}`,
                    cursor: "pointer",
                  }}
                >
                  {f === "all" ? "Todos" : f === "F" ? "Fixos" : "Variáveis"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, minWidth: 680 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)" }}>
                  <th style={{ padding: "8px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>Grupo</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>% RL (BD)</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>Orçado</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: hasRealMes ? "var(--text-3)" : "#F59E0B", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>% RL (RE)</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: hasRealMes ? "var(--text-3)" : "#F59E0B", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>Realizado</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>Var R$</th>
                  <th style={{ padding: "8px 14px 8px 8px", textAlign: "right", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>Var %</th>
                </tr>
              </thead>
              <tbody>
                {DRE_GRUPOS.map((grupo) => {
                  const bdVal = orcForMes(grupo)
                  const reVal = reForMes(grupo)
                  if (bdVal === null && reVal === null) return null
                  const vR = varR(reVal, bdVal)
                  const vP = varPct(reVal, bdVal)
                  const bdPct = pctOf(bdVal, rlOrc)
                  const rePct = pctOf(reVal, rlRe)
                  const isOpen = grupoSel === grupo
                  const subcats = isOpen ? getSubcats(grupo) : []

                  return (
                    <React.Fragment key={grupo}>
                      <tr
                        style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}
                        onClick={() => setGrupoSel(isOpen ? null : grupo)}
                      >
                        <td style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: 9, marginRight: 6, color: "var(--text-3)" }}>{isOpen ? "▾" : "▸"}</span>
                          {grupo}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, color: "var(--text-3)" }}>{fmtPct(bdPct)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, color: "var(--text)", fontWeight: 600 }}>
                          {bdVal != null ? formatBRLCompact(Math.abs(bdVal)) : "—"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, color: "var(--text-3)" }}>{fmtPct(rePct)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, color: hasRealMes ? "var(--text)" : "var(--text-3)", fontWeight: 600 }}>
                          {reVal != null ? formatBRLCompact(Math.abs(reVal)) : "—"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, color: varColor(vR), whiteSpace: "nowrap" }}>{fmtVarR(vR)}</td>
                        <td style={{ padding: "8px 14px 8px 8px", textAlign: "right", fontSize: 12, color: varColor(vP), whiteSpace: "nowrap" }}>{fmtVarPct(vP)}</td>
                      </tr>

                      {subcats.map((sc, i) => (
                        <tr key={`${grupo}-${i}`} style={{ borderTop: "1px solid var(--border)", background: "rgba(255,255,255,0.015)" }}>
                          <td style={{ padding: "5px 14px 5px 28px", fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                            {sc.custo_tipo && (
                              <span style={{
                                fontSize: 9, fontWeight: 700, marginRight: 5,
                                color: sc.custo_tipo === "F" ? "#60A5FA" : "#F59E0B",
                                background: sc.custo_tipo === "F" ? "rgba(96,165,250,0.15)" : "rgba(245,158,11,0.15)",
                                padding: "1px 5px", borderRadius: 4,
                              }}>
                                {sc.custo_tipo}
                              </span>
                            )}
                            {sc.descricao}
                          </td>
                          <td style={{ padding: "5px 12px", textAlign: "right", fontSize: 11, color: "var(--text-3)" }}>—</td>
                          <td style={{ padding: "5px 12px", textAlign: "right", fontSize: 11, color: "var(--text-3)" }}>
                            {sc.bd != null ? formatBRLCompact(Math.abs(sc.bd)) : "—"}
                          </td>
                          <td style={{ padding: "5px 12px", textAlign: "right", fontSize: 11, color: "var(--text-3)" }}>—</td>
                          <td style={{ padding: "5px 12px", textAlign: "right", fontSize: 11, color: sc.re != null ? "var(--text)" : "var(--text-3)" }}>
                            {sc.re != null ? formatBRLCompact(Math.abs(sc.re)) : "—"}
                          </td>
                          <td style={{ padding: "5px 12px", textAlign: "right", fontSize: 11, color: varColor(varR(sc.re, sc.bd)) }}>
                            {fmtVarR(varR(sc.re, sc.bd))}
                          </td>
                          <td style={{ padding: "5px 14px 5px 8px", textAlign: "right", fontSize: 11, color: varColor(varPct(sc.re, sc.bd)) }}>
                            {fmtVarPct(varPct(sc.re, sc.bd))}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Section 1: Main expenses by group (legacy dre_despesa_detalhada) ── */}
      {data.length > 0 && (
      <div style={{ display: "grid", gap: 16 }}>
        <SectionHeader>Despesas por Grupo</SectionHeader>

        {/* Month controls */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {meses.map((m) => (
            <button
              key={m}
              onClick={() => { setMesSel(m); setGrupoSel(null) }}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12,
                fontWeight: mesSel === m ? 700 : 500,
                background: mesSel === m ? "var(--brand, #D4A574)" : "var(--surface)",
                color: mesSel === m ? "#1A1208" : "var(--text-3)",
                border: `1px solid ${mesSel === m ? "transparent" : "var(--border)"}`,
                cursor: "pointer",
              }}
            >
              {mesLabel(m)}
            </button>
          ))}
          <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 8 }}>
            Total: <strong style={{ color: "var(--text)" }}>{fmtFull(totalMes)}</strong>
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>
          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <div style={{ marginBottom: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                onClick={() => setGrupoSel(null)}
                style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 11,
                  background: grupoSel === null ? "var(--surface-2)" : "transparent",
                  color: grupoSel === null ? "var(--text)" : "var(--text-3)",
                  border: `1px solid ${grupoSel === null ? "var(--brand, #D4A574)" : "var(--border)"}`,
                  cursor: "pointer",
                }}
              >
                Todos
              </button>
              {grupos.map((g) => (
                <button
                  key={g}
                  onClick={() => setGrupoSel(grupoSel === g ? null : g)}
                  style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 11,
                    background: grupoSel === g ? "var(--surface-2)" : "transparent",
                    color: grupoSel === g ? "var(--text)" : "var(--text-3)",
                    border: `1px solid ${grupoSel === g ? "var(--brand, #D4A574)" : "var(--border)"}`,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: GRUPO_CORES[g] ?? COR_DEFAULT, display: "inline-block" }} />
                  {g}
                </button>
              ))}
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)" }}>
                  {["Classificação", "Grupo", "Total"].map((h, i) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: i < 2 ? "left" : "right", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detalhes.map((d, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 12px", color: "var(--text)" }}>{d.classificacao_dre}</td>
                    <td style={{ padding: "7px 12px" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: (GRUPO_CORES[d.tipo_despesa] ?? COR_DEFAULT) + "22", color: GRUPO_CORES[d.tipo_despesa] ?? COR_DEFAULT, whiteSpace: "nowrap" }}>
                        {d.tipo_despesa}
                      </span>
                    </td>
                    <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 600, color: "#EF4444" }}>
                      {fmtBRL(d.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pie */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 12px" }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-3)", margin: "0 0 8px" }}>
              Por Grupo — {mesLabel(mesSel)}
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={GRUPO_CORES[entry.name] ?? COR_DEFAULT}
                      opacity={grupoSel === null || grupoSel === entry.name ? 1 : 0.3}
                      style={{ cursor: "pointer" }}
                      onClick={() => setGrupoSel(grupoSel === entry.name ? null : entry.name)}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#1A1A1E", border: "1px solid #27272A", borderRadius: 8, fontSize: 11, color: "#E5E5E7" }}
                  formatter={(v: unknown) => [fmtBRL(typeof v === "number" ? v : 0), ""]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
              {byGrupo.slice(0, 7).map(({ g, total }) => (
                <div key={g} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: GRUPO_CORES[g] ?? COR_DEFAULT, flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontSize: 10, color: "var(--text-3)", lineHeight: 1.2 }}>{g}</span>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>
                    {((total / totalMes) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Drill-down: PESSOAL */}
        {grupoSel === "PESSOAL" && pessoal.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid #8B5CF622", borderRadius: 12, padding: 16 }}>
            <SectionHeader>Breakdown Pessoal — Jan–Abr 2026</SectionHeader>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 500 }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>Categoria</th>
                    {pessoalMeses.map((m) => (
                      <th key={m} style={{ padding: "8px 12px", textAlign: "right", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{mesLabel(m)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pessoalCats.map((cat) => {
                    const isPositive = pessoalMeses.some((m) => (getPessoal(cat, m) ?? 0) > 0)
                    return (
                      <tr key={cat} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 12px", color: "var(--text)", fontWeight: 500 }}>{cat}</td>
                        {pessoalMeses.map((m) => {
                          const v = getPessoal(cat, m)
                          return (
                            <td key={m} style={{ padding: "7px 12px", textAlign: "right", color: v === null ? "var(--text-3)" : v > 0 ? "#22C55E" : "#EF4444", fontWeight: v === null ? 400 : 600 }}>
                              {fmtFullSigned(v)}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface-2)" }}>
                    <td style={{ padding: "7px 12px", fontWeight: 700, color: "var(--text)" }}>Total</td>
                    {pessoalMeses.map((m) => {
                      const total = pessoal.filter((r) => r.mes_ano === m).reduce((s, r) => s + (r.valor ?? 0), 0)
                      return (
                        <td key={m} style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: total < 0 ? "#EF4444" : "#22C55E" }}>
                          {fmtFullSigned(total)}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Drill-down: MANUTENÇÃO */}
        {grupoSel === "MANUTENÇÃO" && manutMes.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid #3B82F622", borderRadius: 12, padding: 16 }}>
            <SectionHeader>Manutenção por Fornecedor — {mesLabel(mesSel)}</SectionHeader>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)" }}>
                    {["Fornecedor", "Categoria", "Valor"].map((h, i) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: i < 2 ? "left" : "right", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {manutMes.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 12px", color: "var(--text)", fontSize: 11 }}>{r.fornecedor}</td>
                      <td style={{ padding: "7px 12px", color: "var(--text-3)", fontSize: 11 }}>{r.categoria}</td>
                      <td style={{ padding: "7px 12px", textAlign: "right", color: "#EF4444", fontWeight: 600 }}>
                        {fmtFull(Math.abs(r.valor))}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface-2)" }}>
                    <td colSpan={2} style={{ padding: "7px 12px", fontWeight: 700, color: "var(--text)" }}>Total</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: "#EF4444" }}>
                      {fmtFull(manutMes.reduce((s, r) => s + Math.abs(r.valor), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── Section 2: Prestadores PJ ── */}
      {prestadores.length > 0 && (
        <div style={{ display: "grid", gap: 16 }}>
          <SectionHeader>Prestadores PJ — Jan–Abr 2026</SectionHeader>

          {(["PJ OP", "PJ ADM"] as const).map((grupo) => {
            const nomes = grupo === "PJ OP" ? prestOP : prestADM
            if (nomes.length === 0) return null
            const totalGeral = prestadores.filter((r) => r.grupo === grupo).reduce((s, r) => s + Math.abs(r.valor), 0)
            return (
              <div key={grupo} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: grupo === "PJ OP" ? "#3B82F6" : "#22C55E", margin: "0 0 12px", letterSpacing: 0.5, textTransform: "uppercase" }}>
                  {grupo}
                  <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text-3)", marginLeft: 8 }}>
                    Total acum.: {fmtFull(totalGeral)}
                  </span>
                </p>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "var(--surface-2)" }}>
                        <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>Prestador</th>
                        {prestMeses.map((m) => (
                          <th key={m} style={{ padding: "8px 12px", textAlign: "right", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{mesLabel(m)}</th>
                        ))}
                        <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--brand, #D4A574)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nomes.map((nome) => {
                        const rowTotal = prestadores.filter((r) => r.nome === nome && r.grupo === grupo).reduce((s, r) => s + Math.abs(r.valor), 0)
                        return (
                          <tr key={nome} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "7px 12px", color: "var(--text)", fontSize: 11, whiteSpace: "nowrap" }}>{nome}</td>
                            {prestMeses.map((m) => {
                              const v = getPrest(nome, m)
                              return (
                                <td key={m} style={{ padding: "7px 12px", textAlign: "right", color: v !== null ? "#EF4444" : "var(--text-3)", fontWeight: v !== null ? 600 : 400 }}>
                                  {v !== null ? fmtFull(Math.abs(v)) : "—"}
                                </td>
                              )
                            })}
                            <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: "var(--text)" }}>
                              {fmtFull(rowTotal)}
                            </td>
                          </tr>
                        )
                      })}
                      <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface-2)" }}>
                        <td style={{ padding: "7px 12px", fontWeight: 700, color: "var(--text)" }}>Total</td>
                        {prestMeses.map((m) => {
                          const t = prestadores.filter((r) => r.grupo === grupo && r.mes_ano === m).reduce((s, r) => s + Math.abs(r.valor), 0)
                          return (
                            <td key={m} style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: "#EF4444" }}>
                              {t > 0 ? fmtFull(t) : "—"}
                            </td>
                          )
                        })}
                        <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: "var(--brand, #D4A574)" }}>
                          {fmtFull(totalGeral)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Section 3: Contratos Fixos ── */}
      {contratos.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          <SectionHeader>
            Contratos Fixos Mensais — {contratos.length} ativos ·{" "}
            Total: {fmtFull(totalContratos)}/mês
          </SectionHeader>

          {contratoTipos.map((tipo) => {
            const rows = contratos.filter((c) => (c.tipo ?? "OUTROS") === tipo).sort((a, b) => b.valor_mensal - a.valor_mensal)
            const subtotal = rows.reduce((s, c) => s + c.valor_mensal, 0)
            return (
              <div key={tipo} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", margin: "0 0 10px", letterSpacing: 0.5, textTransform: "uppercase" }}>
                  {tipo}
                  <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 8 }}>
                    {rows.length} contratos · {fmtFull(subtotal)}/mês
                  </span>
                </p>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "var(--surface-2)" }}>
                        {["Razão Social", "Descrição", "Valor/Mês"].map((h, i) => (
                          <th key={h} style={{ padding: "7px 10px", textAlign: i < 2 ? "left" : "right", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c, i) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "6px 10px", color: "var(--text)", fontSize: 11, whiteSpace: "nowrap" }}>{c.razao_social}</td>
                          <td style={{ padding: "6px 10px", color: "var(--text-3)", fontSize: 11 }}>{c.descricao ?? "—"}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, color: "var(--text)" }}>
                            {fmtFull(c.valor_mensal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
