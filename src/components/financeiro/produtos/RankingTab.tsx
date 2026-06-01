"use client"

import { useMemo, useState } from "react"
import type { CSSProperties } from "react"
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts"
import { getHistoricoProduto } from "@/app/financeiro/produtos/actions"
import type { HistoricoRow } from "@/app/financeiro/produtos/actions"
import type { ProdutoRow } from "@/app/financeiro/produtos/page"

// ── Formatters ──────────────────────────────────────────────────────────────
const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—"
  : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

const fmtBRLc = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL",
    notation: "compact", maximumFractionDigits: 1 }).format(v)

const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`

const fmtQty = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(v)

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
const mesLabel = (m: number, a: number) => `${MESES[(m - 1) % 12]} ${a}`

// ── Rank colors ──────────────────────────────────────────────────────────────
const rankColor = (i: number) => {
  if (i === 0) return "#FFD700"
  if (i === 1) return "#C0C0C0"
  if (i === 2) return "#CD7F32"
  return "var(--text-3)"
}

// ── Style helpers ────────────────────────────────────────────────────────────
const thS = (align: "left" | "right" = "left"): CSSProperties => ({
  padding: "8px 12px", textAlign: align,
  fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
  textTransform: "uppercase", color: "var(--text-3)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
})

const tdS = (align: "left" | "right" = "left"): CSSProperties => ({
  padding: "8px 12px", textAlign: align, color: "var(--text)",
})

const tableStyle: CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: 12,
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
}

// ── Types ────────────────────────────────────────────────────────────────────
type SubTab = "valor" | "quantidade" | "variacao"

type Props = {
  rows: ProdutoRow[]
  unitId: string | null
}

// ── Component ────────────────────────────────────────────────────────────────
export function RankingTab({ rows, unitId }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("valor")
  const [drawerRow, setDrawerRow] = useState<ProdutoRow | null>(null)
  const [historico, setHistorico] = useState<HistoricoRow[]>([])
  const [loadingHist, setLoadingHist] = useState(false)

  // ── Rankings ───────────────────────────────────────────────────────────────
  const rankingValor = useMemo(() =>
    [...rows]
      .filter(r => r.v_custo_total != null)
      .sort((a, b) => Math.abs(b.v_custo_total!) - Math.abs(a.v_custo_total!))
      .slice(0, 20)
  , [rows])

  const rankingQtd = useMemo(() =>
    [...rows]
      .filter(r => r.q_estoque != null)
      .sort((a, b) => (b.q_estoque ?? 0) - (a.q_estoque ?? 0))
      .slice(0, 20)
  , [rows])

  const rankingVar = useMemo(() =>
    [...rows]
      .filter(r => r.perc_variacao != null && r.perc_variacao > 0)
      .sort((a, b) => (b.perc_variacao ?? 0) - (a.perc_variacao ?? 0))
      .slice(0, 20)
  , [rows])

  const maxValor = rankingValor[0] ? Math.abs(rankingValor[0].v_custo_total ?? 0) : 1
  const totalValorAll = useMemo(
    () => rankingValor.reduce((s, r) => s + Math.abs(r.v_custo_total ?? 0), 0),
    [rankingValor]
  )

  // ── Drawer ─────────────────────────────────────────────────────────────────
  async function openDrawer(row: ProdutoRow) {
    setDrawerRow(row)
    setHistorico([])
    if (!row.item_codigo) return
    setLoadingHist(true)
    try {
      const data = await getHistoricoProduto(unitId, row.item_codigo)
      setHistorico(data)
    } finally {
      setLoadingHist(false)
    }
  }

  function closeDrawer() {
    setDrawerRow(null)
    setHistorico([])
  }

  const rowProps = (row: ProdutoRow) => ({
    onClick: () => openDrawer(row),
    style: { borderTop: "1px solid var(--border)", cursor: "pointer" } as CSSProperties,
    onMouseEnter: (e: React.MouseEvent<HTMLTableRowElement>) =>
      (e.currentTarget.style.background = "var(--surface-2)"),
    onMouseLeave: (e: React.MouseEvent<HTMLTableRowElement>) =>
      (e.currentTarget.style.background = ""),
  })

  const SUB_TABS: { id: SubTab; label: string }[] = [
    { id: "valor",      label: "Por Valor" },
    { id: "quantidade", label: "Por Quantidade" },
    { id: "variacao",   label: "Por Variação" },
  ]

  return (
    <>
      {/* Sub-tab nav */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {SUB_TABS.map(({ id, label }) => {
          const active = subTab === id
          return (
            <button key={id} onClick={() => setSubTab(id)} style={{
              padding: "6px 16px", fontSize: 12, fontWeight: active ? 700 : 500,
              color: active ? "var(--text)" : "var(--text-3)",
              background: active ? "var(--surface-2)" : "transparent",
              border: "1px solid",
              borderColor: active ? "var(--border)" : "transparent",
              borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap",
            }}>
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Por Valor ── */}
      {subTab === "valor" && (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                <th style={{ ...thS(), width: 40, textAlign: "center" }}>#</th>
                <th style={thS()}>Produto</th>
                <th style={thS()}>Fornecedor</th>
                <th style={thS()}>Categoria</th>
                <th style={{ ...thS("right"), minWidth: 220 }}>Custo Total (R$)</th>
                <th style={thS("right")}>% do Total</th>
              </tr>
            </thead>
            <tbody>
              {rankingValor.map((r, i) => {
                const val = Math.abs(r.v_custo_total ?? 0)
                const pct = totalValorAll > 0 ? val / totalValorAll * 100 : 0
                const barW = maxValor > 0 ? val / maxValor * 100 : 0
                return (
                  <tr key={r.id} {...rowProps(r)}>
                    <td style={{ ...tdS(), textAlign: "center", fontWeight: 800, color: rankColor(i) }}>
                      {i + 1}
                    </td>
                    <td style={{ ...tdS(), maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                      {r.item_descricao ?? "—"}
                    </td>
                    <td style={{ ...tdS(), maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-3)" }}>
                      {r.fornecedor_nome ?? "—"}
                    </td>
                    <td style={{ ...tdS(), color: "var(--text-3)", whiteSpace: "nowrap" }}>
                      {r.desc_gerencial ?? "—"}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                        <div style={{ width: 80, height: 5, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
                          <div style={{ width: `${barW}%`, height: "100%", background: rankColor(i), borderRadius: 3 }} />
                        </div>
                        <span style={{ fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>
                          {fmtBRL(val)}
                        </span>
                      </div>
                    </td>
                    <td style={{ ...tdS("right"), color: "var(--text-3)" }}>
                      {pct.toFixed(1).replace(".", ",")}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Por Quantidade ── */}
      {subTab === "quantidade" && (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                <th style={{ ...thS(), width: 40, textAlign: "center" }}>#</th>
                <th style={thS()}>Produto</th>
                <th style={thS()}>Fornecedor</th>
                <th style={thS()}>Categoria</th>
                <th style={thS("right")}>Quantidade</th>
                <th style={thS("right")}>Unidade</th>
                <th style={thS("right")}>Custo Médio (R$)</th>
              </tr>
            </thead>
            <tbody>
              {rankingQtd.map((r, i) => (
                <tr key={r.id} {...rowProps(r)}>
                  <td style={{ ...tdS(), textAlign: "center", fontWeight: 800, color: rankColor(i) }}>{i + 1}</td>
                  <td style={{ ...tdS(), maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{r.item_descricao ?? "—"}</td>
                  <td style={{ ...tdS(), maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-3)" }}>{r.fornecedor_nome ?? "—"}</td>
                  <td style={{ ...tdS(), color: "var(--text-3)", whiteSpace: "nowrap" }}>{r.desc_gerencial ?? "—"}</td>
                  <td style={{ ...tdS("right"), fontWeight: 600 }}>{fmtQty(r.q_estoque)}</td>
                  <td style={{ ...tdS("right"), color: "var(--text-3)" }}>{r.unidade_medida ?? "—"}</td>
                  <td style={tdS("right")}>{fmtBRL(r.v_custo_medio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Por Variação ── */}
      {subTab === "variacao" && (
        <>
          {rankingVar.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--text-3)", fontSize: 13, padding: "32px 0" }}>
              Nenhum produto com variação positiva neste mês.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ background: "var(--surface-2)" }}>
                    <th style={{ ...thS(), width: 40, textAlign: "center" }}>#</th>
                    <th style={thS()}>Produto</th>
                    <th style={thS()}>Fornecedor</th>
                    <th style={thS()}>Categoria</th>
                    <th style={thS("right")}>Variação %</th>
                    <th style={thS("right")}>Custo Atual</th>
                    <th style={thS("right")}>Custo Médio</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingVar.map((r, i) => (
                    <tr key={r.id} {...rowProps(r)}>
                      <td style={{ ...tdS(), textAlign: "center", fontWeight: 800, color: rankColor(i) }}>{i + 1}</td>
                      <td style={{ ...tdS(), maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{r.item_descricao ?? "—"}</td>
                      <td style={{ ...tdS(), maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-3)" }}>{r.fornecedor_nome ?? "—"}</td>
                      <td style={{ ...tdS(), color: "var(--text-3)", whiteSpace: "nowrap" }}>{r.desc_gerencial ?? "—"}</td>
                      <td style={{ ...tdS("right"), fontWeight: 700, color: "#EF4444" }}>{fmtPct(r.perc_variacao)}</td>
                      <td style={tdS("right")}>{fmtBRL(r.v_custo_compra)}</td>
                      <td style={tdS("right")}>{fmtBRL(r.v_custo_medio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Histórico Drawer ── */}
      {drawerRow && (
        <HistoricoDrawer
          row={drawerRow}
          historico={historico}
          loading={loadingHist}
          onClose={closeDrawer}
        />
      )}
    </>
  )
}

// ── Histórico Drawer ──────────────────────────────────────────────────────────
type DrawerProps = {
  row: ProdutoRow
  historico: HistoricoRow[]
  loading: boolean
  onClose: () => void
}

function HistoricoDrawer({ row, historico, loading, onClose }: DrawerProps) {
  const chartData = historico.map(h => ({
    label: mesLabel(h.mes_lancamento, h.ano_lancamento),
    custoTotal: h.v_custo_total != null ? Math.abs(h.v_custo_total) : null,
    custoMedio: h.v_custo_medio,
    quantidade: h.q_estoque,
  }))

  const thD = (align: "left" | "right" = "left"): CSSProperties => ({
    padding: "7px 10px", textAlign: align,
    fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
    textTransform: "uppercase", color: "var(--text-3)",
    borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
  })

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, zIndex: 998,
        background: "rgba(0,0,0,0.45)",
      }} />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 520,
        zIndex: 999, background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        overflowY: "auto",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.3)",
      }}>
        {/* Sticky header */}
        <div style={{
          padding: "20px 24px 16px", borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
        }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--text-3)", margin: "0 0 4px" }}>
              Histórico do Produto
            </p>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.item_descricao ?? row.item_codigo ?? "—"}
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
              {[row.fornecedor_nome, row.desc_gerencial].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "var(--text-3)",
            cursor: "pointer", fontSize: 22, lineHeight: 1, flexShrink: 0,
          }}>×</button>
        </div>

        <div style={{ padding: "20px 24px", flex: 1 }}>
          {loading && (
            <p style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: "40px 0" }}>
              Carregando histórico…
            </p>
          )}

          {!loading && historico.length === 0 && (
            <p style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: "40px 0" }}>
              Nenhum histórico encontrado para este produto.
            </p>
          )}

          {!loading && historico.length > 0 && (
            <>
              {/* Chart */}
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--text-3)", margin: "0 0 12px" }}>
                Evolução — {historico.length} {historico.length === 1 ? "mês" : "meses"}
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 44, left: 0, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-3)" }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis yAxisId="brl" orientation="left" tickFormatter={v => fmtBRLc(Number(v))} tick={{ fontSize: 10, fill: "var(--text-3)" }} width={72} />
                  <YAxis yAxisId="qty" orientation="right" tick={{ fontSize: 10, fill: "var(--text-3)" }} width={44} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                    formatter={(v, name) => {
                      const n = Number(v)
                      if (name === "Quantidade") return [fmtQty(n), name]
                      return [fmtBRL(n), name as string]
                    }}
                  />
                  <Line yAxisId="brl" type="monotone" dataKey="custoTotal" stroke="#D4A574" strokeWidth={2} dot={{ r: 3 }} name="Custo Total" connectNulls />
                  <Line yAxisId="brl" type="monotone" dataKey="custoMedio" stroke="#60A5FA" strokeWidth={2} dot={{ r: 3 }} name="Custo Médio" connectNulls />
                  <Line yAxisId="qty"  type="monotone" dataKey="quantidade" stroke="#4ADE80" strokeWidth={2} dot={{ r: 3 }} name="Quantidade"  connectNulls />
                </ComposedChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div style={{ display: "flex", gap: 16, margin: "10px 0 24px", flexWrap: "wrap" }}>
                {([ ["#D4A574","Custo Total"], ["#60A5FA","Custo Médio"], ["#4ADE80","Quantidade"] ] as const).map(([color, label]) => (
                  <span key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-3)" }}>
                    <span style={{ width: 14, height: 3, background: color, borderRadius: 2, display: "inline-block" }} />
                    {label}
                  </span>
                ))}
              </div>

              {/* History table */}
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--text-3)", margin: "0 0 10px" }}>
                Registros por mês
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2)" }}>
                      <th style={thD()}>Mês</th>
                      <th style={thD()}>Fornecedor</th>
                      <th style={thD("right")}>Qtd</th>
                      <th style={thD("right")}>Custo Médio</th>
                      <th style={thD("right")}>Custo Total</th>
                      <th style={thD("right")}>Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((h, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "6px 10px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>
                          {mesLabel(h.mes_lancamento, h.ano_lancamento)}
                        </td>
                        <td style={{ padding: "6px 10px", color: "var(--text-3)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {h.fornecedor_nome ?? "—"}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--text)" }}>{fmtQty(h.q_estoque)}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--text)" }}>{fmtBRL(h.v_custo_medio)}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, color: "var(--text)" }}>
                          {fmtBRL(h.v_custo_total != null ? Math.abs(h.v_custo_total) : null)}
                        </td>
                        <td style={{
                          padding: "6px 10px", textAlign: "right",
                          color: h.perc_variacao == null ? "var(--text-3)" : h.perc_variacao > 0 ? "#EF4444" : "#22C55E",
                          fontWeight: h.perc_variacao != null ? 600 : 400,
                        }}>
                          {fmtPct(h.perc_variacao)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
