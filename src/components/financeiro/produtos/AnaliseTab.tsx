"use client"

import { useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts"
import { getAnaliseProdutos } from "@/app/financeiro/dre/cmv/actions"
import type { AnaliseProduto, AnaliseMesPonto } from "@/app/financeiro/dre/cmv/actions"

// ── Formatters ──────────────────────────────────────────────────────────────
const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—"
  : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`

const fmtQty = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(v)

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
const mesLabel = (m: number, a: number) => `${MESES[(m - 1) % 12]} ${a}`
const mesShort  = (m: number, a: number) => `${MESES[(m - 1) % 12]}/${String(a).slice(2)}`

// ── Cor da variação: >5% sobe (vermelho), <0 cai (verde), senão estável (cinza) ──
const varColor = (v: number | null): string =>
  v == null ? "var(--text-3)" : v > 5 ? "#EF4444" : v < 0 ? "#22C55E" : "var(--text-3)"

const unidSuffix = (u: string | null) => (u ? `/${u.toLowerCase()}` : "")

// ── Types ────────────────────────────────────────────────────────────────────
type Ponto = AnaliseMesPonto & { varPct: number | null }

type Enriched = AnaliseProduto & {
  pontos: Ponto[]
  precoInicial: number | null
  precoFinal: number | null
  varTotal: number | null // primeiro → último mês com preço válido
}

type SortMode = "variacao" | "alfabetica" | "gasto"

type Props = { unitId: string | null }

// ── Enriquecimento client-side (variação % consecutiva + total) ───────────────
function enrich(p: AnaliseProduto): Enriched {
  let prevPreco: number | null = null
  const pontos: Ponto[] = p.meses.map(m => {
    let varPct: number | null = null
    if (m.preco_unit != null && prevPreco != null && prevPreco > 0)
      varPct = ((m.preco_unit - prevPreco) / prevPreco) * 100
    if (m.preco_unit != null) prevPreco = m.preco_unit
    return { ...m, varPct }
  })
  const validos = p.meses.filter(m => m.preco_unit != null)
  const precoInicial = validos.length ? validos[0]!.preco_unit! : null
  const precoFinal   = validos.length ? validos[validos.length - 1]!.preco_unit! : null
  const varTotal =
    precoInicial != null && precoFinal != null && precoInicial > 0
      ? ((precoFinal - precoInicial) / precoInicial) * 100
      : null
  return { ...p, pontos, precoInicial, precoFinal, varTotal }
}

// ── Component ────────────────────────────────────────────────────────────────
export function AnaliseTab({ unitId }: Props) {
  const [raw, setRaw]         = useState<AnaliseProduto[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [busca, setBusca]     = useState("")
  const [sortMode, setSort]   = useState<SortMode>("variacao")
  const [selCod, setSelCod]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setRaw(null)
    setSelCod(null)
    getAnaliseProdutos(unitId).then(r => {
      setRaw(r)
      setLoading(false)
    })
  }, [unitId])

  // Enriquece uma vez (não refetch) — variação calculada client-side.
  const produtos = useMemo(() => (raw ?? []).map(enrich), [raw])

  // Cards de alerta (independem de busca/ordenação).
  const topAlta = useMemo(() =>
    produtos.filter(p => p.varTotal != null && p.varTotal > 0)
      .sort((a, b) => (b.varTotal ?? 0) - (a.varTotal ?? 0)).slice(0, 5)
  , [produtos])

  const topBaixa = useMemo(() =>
    produtos.filter(p => p.varTotal != null && p.varTotal < 0)
      .sort((a, b) => (a.varTotal ?? 0) - (b.varTotal ?? 0)).slice(0, 5)
  , [produtos])

  // Lista filtrada + ordenada.
  const lista = useMemo(() => {
    let r = produtos
    const b = busca.trim().toLowerCase()
    if (b) r = r.filter(p => (p.item_descricao ?? "").toLowerCase().includes(b))
    const s = [...r]
    if (sortMode === "variacao")
      s.sort((a, b) => (b.varTotal ?? -Infinity) - (a.varTotal ?? -Infinity))
    else if (sortMode === "alfabetica")
      s.sort((a, b) => (a.item_descricao ?? "").localeCompare(b.item_descricao ?? ""))
    else
      s.sort((a, b) => b.gasto_total - a.gasto_total)
    return s
  }, [produtos, busca, sortMode])

  // Seleciona o primeiro item quando a lista muda e nada está selecionado.
  useEffect(() => {
    if (!selCod && lista.length > 0) setSelCod(lista[0]!.item_codigo)
  }, [lista, selCod])

  const selecionado = useMemo(
    () => produtos.find(p => p.item_codigo === selCod) ?? null,
    [produtos, selCod]
  )

  if (loading) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
        Calculando evolução de preços…
      </div>
    )
  }

  if (produtos.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center",
        background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 14 }}>
        <p style={{ fontSize: 14, color: "var(--text-3)", margin: 0 }}>
          Nenhum produto com dois ou mais meses para comparar.
        </p>
        <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>
          Importe pelo menos dois meses de Relatório de Produtos para ver a evolução de preços.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* ── Cards de alerta ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
        <AlertCard title="Top 5 que mais encareceram" icon="▲" cor="#EF4444"
          itens={topAlta} onSelect={setSelCod} vazio="Nenhum produto encareceu no período." />
        <AlertCard title="Top 5 que mais baratearam" icon="▼" cor="#22C55E"
          itens={topBaixa} onSelect={setSelCod} vazio="Nenhum produto baixou de preço no período." />
      </div>

      {/* ── Painéis: lista + detalhe ── */}
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, alignItems: "start" }}>
        {/* Lista */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: "1px solid var(--border)", display: "grid", gap: 8 }}>
            <input
              placeholder="Buscar produto…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                padding: "7px 12px", borderRadius: 8, fontSize: 12,
                background: "var(--surface-2)", color: "var(--text)",
                border: "1px solid var(--border)", width: "100%",
              }}
            />
            <div style={{ display: "flex", borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden" }}>
              {([["variacao", "Variação"], ["alfabetica", "A–Z"], ["gasto", "Gasto"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => setSort(v)} style={{
                  flex: 1, padding: "6px 4px", fontSize: 11, fontWeight: sortMode === v ? 700 : 500,
                  background: sortMode === v ? "var(--brand, #C4622D)" : "var(--surface)",
                  color: sortMode === v ? "var(--primary-foreground)" : "var(--text-3)",
                  border: "none", cursor: "pointer", whiteSpace: "nowrap",
                }}>{label}</button>
              ))}
            </div>
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>
              {lista.length.toLocaleString("pt-BR")} produto{lista.length !== 1 ? "s" : ""} · {produtos.length} no total
            </span>
          </div>

          <div style={{ maxHeight: 620, overflowY: "auto" }}>
            {lista.map(p => {
              const active = p.item_codigo === selCod
              return (
                <button key={p.item_codigo} onClick={() => setSelCod(p.item_codigo)} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  width: "100%", padding: "9px 12px", textAlign: "left",
                  background: active ? "var(--surface-2)" : "transparent",
                  borderBottom: "1px solid var(--border)",
                  borderLeft: `3px solid ${active ? "var(--brand, #C4622D)" : "transparent"}`,
                  cursor: "pointer",
                }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontSize: 12, fontWeight: active ? 700 : 500,
                      color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.item_descricao ?? p.item_codigo}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                      {fmtBRL(p.precoFinal)}{unidSuffix(p.unidade_medida)} · {fmtBRL(p.gasto_total)}
                    </span>
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                    padding: "2px 7px", borderRadius: 99,
                    color: varColor(p.varTotal),
                    background: p.varTotal == null ? "transparent"
                      : p.varTotal > 5 ? "rgba(239,68,68,0.12)"
                      : p.varTotal < 0 ? "rgba(34,197,94,0.12)"
                      : "var(--surface-2)",
                  }}>
                    {fmtPct(p.varTotal)}
                  </span>
                </button>
              )
            })}
            {lista.length === 0 && (
              <p style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>
                Nenhum produto encontrado.
              </p>
            )}
          </div>
        </div>

        {/* Detalhe */}
        <div style={{ minWidth: 0 }}>
          {selecionado ? <Detalhe p={enrich(selecionado)} /> : (
            <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 13,
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
              Selecione um produto na lista para ver a evolução.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Card de alerta ────────────────────────────────────────────────────────────
function AlertCard({ title, icon, cor, itens, onSelect, vazio }: {
  title: string; icon: string; cor: string
  itens: Enriched[]; onSelect: (cod: string) => void; vazio: string
}) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
        color: "var(--text-3)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: cor }}>{icon}</span> {title}
      </p>
      {itens.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>{vazio}</p>
      ) : (
        <div style={{ display: "grid", gap: 2 }}>
          {itens.map((p, i) => (
            <button key={p.item_codigo} onClick={() => onSelect(p.item_codigo)} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              padding: "5px 6px", borderRadius: 6, background: "transparent", border: "none",
              cursor: "pointer", textAlign: "left",
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-3)", width: 14 }}>{i + 1}</span>
                <span style={{ fontSize: 12, color: "var(--text)", overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.item_descricao ?? p.item_codigo}
                </span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: cor, whiteSpace: "nowrap" }}>
                {fmtPct(p.varTotal)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Detalhe do produto ────────────────────────────────────────────────────────
function Detalhe({ p }: { p: Enriched }) {
  const chartData = p.pontos.map(pt => ({
    label: mesShort(pt.mes, pt.ano),
    preco: pt.preco_unit,
  }))
  const unid = p.unidade_medida ?? ""

  const thD = (align: "left" | "right" = "left"): CSSProperties => ({
    padding: "8px 12px", textAlign: align,
    fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
    textTransform: "uppercase", color: "var(--text-3)",
    borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
  })

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header do produto */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
        padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", lineHeight: 1.3 }}>
            {p.item_descricao ?? p.item_codigo}
          </h2>
          <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
            {[p.desc_gerencial, unid ? `Unidade: ${unid}` : null, `${p.meses.length} meses`]
              .filter(Boolean).join(" · ")}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
            color: "var(--text-3)", margin: "0 0 2px" }}>
            Variação total
          </p>
          <p style={{ fontSize: 30, fontWeight: 800, color: varColor(p.varTotal), margin: 0, lineHeight: 1 }}>
            {fmtPct(p.varTotal)}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-3)", margin: "4px 0 0" }}>
            {fmtBRL(p.precoInicial)} → {fmtBRL(p.precoFinal)}{unidSuffix(unid)}
          </p>
        </div>
      </div>

      {/* Gráfico de linha do preço unitário */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px" }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
          color: "var(--text-3)", margin: "0 0 16px" }}>
          Preço unitário ({unid ? `R$${unidSuffix(unid)}` : "R$"}) por mês
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-3)" }} />
            <YAxis tickFormatter={v => fmtBRL(Number(v))} tick={{ fontSize: 10, fill: "var(--text-3)" }} width={78} />
            <Tooltip
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              formatter={(v) => [`${fmtBRL(Number(v))}${unidSuffix(unid)}`, "Preço unitário"]}
            />
            <Line type="monotone" dataKey="preco" stroke="#D4A574" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela mês a mês */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <th style={thD()}>Mês</th>
              <th style={thD("right")}>Qtd comprada</th>
              <th style={thD("right")}>Valor total</th>
              <th style={thD("right")}>Preço unitário</th>
              <th style={thD("right")}>Var.%</th>
            </tr>
          </thead>
          <tbody>
            {p.pontos.map((pt, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>
                  {mesLabel(pt.mes, pt.ano)}
                </td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text)" }}>
                  {fmtQty(pt.qtd)}{unid ? ` ${unid.toLowerCase()}` : ""}
                </td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text)" }}>
                  {fmtBRL(pt.valor)}
                </td>
                <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "var(--text)" }}>
                  {pt.preco_unit == null ? "—" : `${fmtBRL(pt.preco_unit)}${unidSuffix(unid)}`}
                </td>
                <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: varColor(pt.varPct) }}>
                  {i === 0 ? "—" : fmtPct(pt.varPct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
