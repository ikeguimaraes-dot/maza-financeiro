"use client"

import React, { useEffect, useMemo, useState } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts"
import { useRouter } from "next/navigation"
import type { ProdutoRow } from "@/app/financeiro/dre/cmv/page"
import { ImportModal } from "./ImportModal"
import { RankingTab } from "./RankingTab"
import { AnaliseTab } from "./AnaliseTab"

// ── Formatters ─────────────────────────────────────────────────────────────────
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

// ── Types ──────────────────────────────────────────────────────────────────────
type SortDir = "asc" | "desc"
type SortCol = keyof ProdutoRow | null

type PrevRow = Pick<ProdutoRow, "id" | "v_custo_total" | "calcula_cmv" | "desc_gerencial">

type Props = {
  rows: ProdutoRow[]
  prevRows: PrevRow[]
  mes: number
  ano: number
  meses: { mes: number; ano: number }[]
  unitId: string | null
  q?: string
}

const PAGE_SIZE = 50

// ── Main component ─────────────────────────────────────────────────────────────
export function ProdutosClient({ rows, prevRows, mes, ano, meses, unitId, q = "" }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<"tabela" | "ranking" | "cmv" | "analise">("analise")
  const [showImport, setShowImport] = useState(false)

  // ── Tabela filters ──────────────────────────────────────────────────────────
  const [localQ, setLocalQ] = useState(q)


  const [filterCat, setFilterCat] = useState("")
  const [filterCmv, setFilterCmv] = useState<"all" | "cmv" | "no_cmv">("all")
  const [page, setPage] = useState(0)
  const [sortCol, setSortCol] = useState<SortCol>("fornecedor_nome")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const categorias = useMemo(() =>
    [...new Set(rows.map(r => r.desc_gerencial).filter(Boolean))].sort() as string[]
  , [rows])

  const filtered = useMemo(() => {
    let r = rows
    if (localQ.trim())
      r = r.filter(x =>
        (x.fornecedor_nome ?? "").toLowerCase().includes(localQ.toLowerCase()) ||
        (x.item_descricao ?? "").toLowerCase().includes(localQ.toLowerCase())
      )
    if (filterCat) r = r.filter(x => x.desc_gerencial === filterCat)
    if (filterCmv === "cmv")    r = r.filter(x => x.calcula_cmv === true)
    if (filterCmv === "no_cmv") r = r.filter(x => x.calcula_cmv !== true)
    if (sortCol) {
      r = [...r].sort((a, b) => {
        const av = a[sortCol] ?? ""
        const bv = b[sortCol] ?? ""
        if (av < bv) return sortDir === "asc" ? -1 : 1
        if (av > bv) return sortDir === "asc" ? 1 : -1
        return 0
      })
    }
    return r
  }, [rows, localQ, filterCat, filterCmv, sortCol, sortDir])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageRows   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortCol(col); setSortDir("asc") }
    setPage(0)
  }

  function handleFilterChange() { setPage(0) }

  // ── CMV data ────────────────────────────────────────────────────────────────
  const cmvRows      = rows.filter(r => r.calcula_cmv === true)
  const totalCmv     = cmvRows.reduce((s, r) => s + Math.abs(r.v_custo_total ?? 0), 0)
  const prevCmvRows  = prevRows.filter(r => r.calcula_cmv === true)
  const prevTotalCmv = prevCmvRows.reduce((s, r) => s + Math.abs(r.v_custo_total ?? 0), 0)
  const cmvVarPct    = prevTotalCmv > 0 ? (totalCmv - prevTotalCmv) / prevTotalCmv * 100 : null

  const cmvByCat = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of cmvRows) {
      const cat = r.desc_gerencial ?? "Sem categoria"
      map.set(cat, (map.get(cat) ?? 0) + Math.abs(r.v_custo_total ?? 0))
    }
    return [...map.entries()]
      .map(([cat, total]) => ({ cat, total }))
      .sort((a, b) => b.total - a.total)
  }, [cmvRows])

  const top10Chart = cmvByCat.slice(0, 10).map(d => ({
    name: d.cat.length > 22 ? d.cat.slice(0, 20) + "…" : d.cat,
    fullName: d.cat,
    total: d.total,
  }))

  const prevCmvByCat = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of prevCmvRows) {
      const cat = r.desc_gerencial ?? "Sem categoria"
      map.set(cat, (map.get(cat) ?? 0) + Math.abs(r.v_custo_total ?? 0))
    }
    return map
  }, [prevCmvRows])

  const hasData       = rows.length > 0
  const totalComprado = rows.reduce((s, r) => s + Math.abs(r.v_total_embalagem ?? 0), 0)
  const fornUnicos    = new Set(rows.map(r => r.fornecedor_nome).filter(Boolean)).size

  return (
    <>
      {/* ── Header ── */}
      <header style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between",
        gap:16, margin:"10px 0 20px", flexWrap:"wrap" }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:700, color:"var(--text)",
            letterSpacing:-0.5, margin:"0 0 4px" }}>
            Relatório de Produtos
          </h1>
          <p style={{ fontSize:13, color:"var(--text-3)", margin:0 }}>
            CMV detalhado por item · {mesLabel(mes, ano)}
            {rows.length > 0 && ` · ${rows.length.toLocaleString("pt-BR")} itens`}
          </p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {/* Month selector */}
          {meses.length > 0 && (
            <select
              value={`${ano}-${mes}`}
              onChange={e => {
                const [a, m] = e.target.value.split("-")
                const params = new URLSearchParams()
                if (localQ) params.set("q", localQ)
                params.set("mes", m!)
                params.set("ano", a!)
                router.push(`/financeiro/dre/cmv?${params.toString()}`)
              }}
              style={{
                padding:"7px 12px", borderRadius:8, fontSize:12, fontWeight:500,
                background:"var(--surface)", color:"var(--text)",
                border:"1px solid var(--border)", cursor:"pointer",
              }}
            >
              {meses.map(({ mes: m, ano: a }) => (
                <option key={`${a}-${m}`} value={`${a}-${m}`}>{mesLabel(m, a)}</option>
              ))}
            </select>
          )}
          {/* Import button */}
          <button
            onClick={() => setShowImport(true)}
            style={{
              padding:"7px 16px", borderRadius:8, fontSize:12, fontWeight:700,
              background:"var(--brand, #C4622D)", color:"var(--primary-foreground)",
              border:"none", cursor:"pointer",
            }}
          >
            ↑ Importar Excel
          </button>
        </div>
      </header>

      {/* ── Summary KPIs ── */}
      {hasData && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12, marginBottom:20 }}>
          {([
            { label:"Total Comprado",  value: fmtBRL(totalComprado),                        sub: mesLabel(mes, ano) },
            { label:"Itens CMV",       value: cmvRows.length.toLocaleString("pt-BR"),        sub: `de ${rows.length.toLocaleString("pt-BR")} itens` },
            { label:"Fornecedores",    value: fornUnicos.toLocaleString("pt-BR"),            sub: "únicos no mês" },
          ]).map(({ label, value, sub }) => (
            <div key={label} style={{
              background:"var(--surface)", border:"1px solid var(--border)",
              borderRadius:10, padding:"14px 16px",
            }}>
              <p style={{ fontSize:10, fontWeight:700, letterSpacing:0.8, textTransform:"uppercase",
                color:"var(--text-3)", margin:0 }}>{label}</p>
              <p style={{ fontSize:20, fontWeight:700, color:"var(--text)", margin:"4px 0 0" }}>{value}</p>
              <p style={{ fontSize:11, color:"var(--text-3)", margin:0 }}>{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab nav ── */}
      <nav style={{ display:"flex", gap:2, borderBottom:"1px solid var(--border)", marginBottom:24 }}>
        {(["analise", "cmv", "ranking", "tabela"] as const).map(t => {
          const labels = { tabela: "Tabela", ranking: "Ranking", cmv: "CMV", analise: "Análise" }
          const active = tab === t
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              padding:"8px 18px", fontSize:13, fontWeight:active?700:500,
              color:active?"var(--text)":"var(--text-3)",
              borderBottom:active?"2px solid var(--brand, #C4622D)":"2px solid transparent",
              background:"transparent", border:"none", cursor:"pointer",
              whiteSpace:"nowrap", marginBottom:-1,
            }}>
              {labels[t]}
            </button>
          )
        })}
      </nav>

      {/* ── Empty state ── */}
      {!hasData && (
        <div style={{ padding:"48px 24px", textAlign:"center",
          background:"var(--surface)", border:"1px dashed var(--border)", borderRadius:14 }}>
          <p style={{ fontSize:14, color:"var(--text-3)", marginBottom:8 }}>
            Nenhum dado para {mesLabel(mes, ano)}.
          </p>
          <p style={{ fontSize:12, color:"var(--text-3)" }}>
            Importe o Excel de Relatório de Produtos para este mês.
          </p>
          <button onClick={() => setShowImport(true)} style={{
            marginTop:16, padding:"9px 20px", borderRadius:8, fontSize:13,
            fontWeight:700, background:"var(--brand, #C4622D)", color:"var(--primary-foreground)",
            border:"none", cursor:"pointer",
          }}>
            ↑ Importar Excel
          </button>
        </div>
      )}

      {/* ── Tabela tab ── */}
      {hasData && tab === "tabela" && (
        <div style={{ display:"grid", gap:16 }}>
          {/* Filters */}
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
            <input
              placeholder="Buscar fornecedor ou item…"
              value={localQ}
              onChange={e => { setLocalQ(e.target.value); setPage(0) }}
              style={{
                padding:"7px 12px", borderRadius:8, fontSize:12,
                background:"var(--surface)", color:"var(--text)",
                border:"1px solid var(--border)", minWidth:220, flex:1,
              }}
            />
            <select
              value={filterCat}
              onChange={e => { setFilterCat(e.target.value); handleFilterChange() }}
              style={{
                padding:"7px 12px", borderRadius:8, fontSize:12,
                background:"var(--surface)", color:"var(--text)",
                border:"1px solid var(--border)", minWidth:180,
              }}
            >
              <option value="">Todas as categorias</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ display:"flex", borderRadius:8, border:"1px solid var(--border)", overflow:"hidden" }}>
              {([["all","Todos"],["cmv","CMV"],["no_cmv","Sem CMV"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => { setFilterCmv(v); handleFilterChange() }} style={{
                  padding:"7px 14px", fontSize:12, fontWeight:filterCmv===v?700:500,
                  background:filterCmv===v?"var(--brand, #C4622D)":"var(--surface)",
                  color:filterCmv===v?"var(--primary-foreground)":"var(--text-3)",
                  border:"none", cursor:"pointer", whiteSpace:"nowrap",
                }}>{label}</button>
              ))}
            </div>
            <span style={{ fontSize:11, color:"var(--text-3)", marginLeft:"auto" }}>
              {filtered.length.toLocaleString("pt-BR")} item{filtered.length!==1?"s":""}
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12,
              background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10 }}>
              <thead>
                <tr style={{ background:"var(--surface-2)" }}>
                  {([
                    ["fornecedor_nome","Fornecedor","left"],
                    ["item_descricao","Item","left"],
                    ["desc_gerencial","Categoria","left"],
                    ["q_estoque","Qtd Estoque","right"],
                    ["unidade_medida","Unidade","right"],
                    ["v_total_embalagem","V. Total Emb.","right"],
                    ["v_custo_medio","Custo Médio","right"],
                    ["v_custo_compra","Custo Compra","right"],
                    ["v_custo_total","Custo Total","right"],
                    ["perc_variacao","% Variação","right"],
                    ["calcula_cmv","CMV","right"],
                  ] as [keyof ProdutoRow, string, string][]).map(([col, label, align]) => (
                    <th key={col} onClick={() => handleSort(col)} style={{
                      padding:"8px 12px", textAlign:align as "left"|"right",
                      fontSize:10, fontWeight:700, letterSpacing:0.4,
                      textTransform:"uppercase", color:"var(--text-3)",
                      borderBottom:"1px solid var(--border)", whiteSpace:"nowrap",
                      cursor:"pointer", userSelect:"none",
                    }}>
                      {label}{sortCol===col ? (sortDir==="asc"?" ↑":" ↓") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map(r => (
                  <tr key={r.id} style={{ borderTop:"1px solid var(--border)" }}>
                    <td style={{ padding:"7px 12px", color:"var(--text)", fontWeight:500, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {r.fornecedor_nome ?? "—"}
                    </td>
                    <td style={{ padding:"7px 12px", color:"var(--text)", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {r.item_descricao ?? "—"}
                    </td>
                    <td style={{ padding:"7px 12px", color:"var(--text-3)", whiteSpace:"nowrap" }}>
                      {r.desc_gerencial ?? "—"}
                    </td>
                    <td style={{ padding:"7px 12px", textAlign:"right", color:"var(--text)" }}>
                      {fmtQty(r.q_estoque)}
                    </td>
                    <td style={{ padding:"7px 12px", textAlign:"right", color:"var(--text-3)" }}>
                      {r.unidade_medida ?? "—"}
                    </td>
                    <td style={{ padding:"7px 12px", textAlign:"right", color:"var(--text)" }}>
                      {fmtBRL(r.v_total_embalagem)}
                    </td>
                    <td style={{ padding:"7px 12px", textAlign:"right", color:"var(--text)" }}>
                      {fmtBRL(r.v_custo_medio)}
                    </td>
                    <td style={{ padding:"7px 12px", textAlign:"right", color:"var(--text)" }}>
                      {fmtBRL(r.v_custo_compra)}
                    </td>
                    <td style={{ padding:"7px 12px", textAlign:"right", fontWeight:600, color:"var(--text)" }}>
                      {fmtBRL(r.v_custo_total)}
                    </td>
                    <td style={{ padding:"7px 12px", textAlign:"right",
                      color:r.perc_variacao==null?"var(--text-3)":r.perc_variacao>0?"#EF4444":"#22C55E" }}>
                      {fmtPct(r.perc_variacao)}
                    </td>
                    <td style={{ padding:"7px 12px", textAlign:"right" }}>
                      {r.calcula_cmv === true
                        ? <span style={{ fontSize:10,fontWeight:700,color:"#22C55E",background:"rgba(34,197,94,0.12)",padding:"2px 8px",borderRadius:99 }}>SIM</span>
                        : <span style={{ fontSize:10,color:"var(--text-3)" }}>NÃO</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop:"2px solid var(--border)", background:"var(--surface-2)" }}>
                  <td colSpan={5} style={{ padding:"8px 12px", fontWeight:700, color:"var(--text)", fontSize:12 }}>
                    {filterCat ? `Total ${filterCat}` : "Total geral"}
                  </td>
                  <td style={{ padding:"8px 12px", textAlign:"right", fontWeight:700, color:"var(--text)", fontSize:12, whiteSpace:"nowrap" }}>
                    {fmtBRL(filtered.reduce((s, r) => s + Math.abs(r.v_total_embalagem ?? 0), 0))}
                  </td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:12, color:"var(--text-3)" }}>
              <span>
                Página {page + 1} de {totalPages} · {filtered.length.toLocaleString("pt-BR")} itens
              </span>
              <div style={{ display:"flex", gap:4 }}>
                <button onClick={() => setPage(0)} disabled={page===0}
                  style={{ padding:"5px 10px",borderRadius:6,fontSize:11,border:"1px solid var(--border)",
                    background:"var(--surface)",color:page===0?"var(--text-3)":"var(--text)",cursor:page===0?"default":"pointer" }}>
                  «
                </button>
                <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page===0}
                  style={{ padding:"5px 10px",borderRadius:6,fontSize:11,border:"1px solid var(--border)",
                    background:"var(--surface)",color:page===0?"var(--text-3)":"var(--text)",cursor:page===0?"default":"pointer" }}>
                  ‹ Anterior
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page===totalPages-1}
                  style={{ padding:"5px 10px",borderRadius:6,fontSize:11,border:"1px solid var(--border)",
                    background:"var(--surface)",color:page===totalPages-1?"var(--text-3)":"var(--text)",cursor:page===totalPages-1?"default":"pointer" }}>
                  Próximo ›
                </button>
                <button onClick={() => setPage(totalPages-1)} disabled={page===totalPages-1}
                  style={{ padding:"5px 10px",borderRadius:6,fontSize:11,border:"1px solid var(--border)",
                    background:"var(--surface)",color:page===totalPages-1?"var(--text-3)":"var(--text)",cursor:page===totalPages-1?"default":"pointer" }}>
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Ranking tab ── */}
      {hasData && tab === "ranking" && (
        <RankingTab unitId={unitId} mes={mes} ano={ano} />
      )}

      {/* ── Análise tab (evolução de preço por produto, todos os meses) ── */}
      {hasData && tab === "analise" && (
        <AnaliseTab unitId={unitId} />
      )}

      {/* ── CMV tab ── */}
      {hasData && tab === "cmv" && (
        <div style={{ display:"grid", gap:24 }}>
          {/* KPIs */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12 }}>
            {[
              {
                label:"Total CMV do Mês",
                value: fmtBRLc(totalCmv),
                sub: mesLabel(mes, ano),
                color: undefined,
              },
              {
                label:"Itens com CMV",
                value: cmvRows.length.toLocaleString("pt-BR"),
                sub: `de ${rows.length.toLocaleString("pt-BR")} itens`,
                color: "#22C55E",
              },
              {
                label:"Variação vs mês anterior",
                value: cmvVarPct != null ? fmtPct(cmvVarPct) : "—",
                sub: prevTotalCmv > 0 ? `Anterior: ${fmtBRLc(prevTotalCmv)}` : "Sem dados anteriores",
                color: cmvVarPct == null ? undefined : cmvVarPct > 0 ? "#EF4444" : "#22C55E",
              },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={{
                background:"var(--surface)", border:"1px solid var(--border)",
                borderRadius:10, padding:"14px 16px",
              }}>
                <p style={{ fontSize:10,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",
                  color:"var(--text-3)",margin:0 }}>{label}</p>
                <p style={{ fontSize:22,fontWeight:700,color:color??"var(--text)",margin:"4px 0 0" }}>
                  {value}
                </p>
                <p style={{ fontSize:11, color:"var(--text-3)", margin:0 }}>{sub}</p>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          {top10Chart.length > 0 && (
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)",
              borderRadius:10, padding:"16px 20px" }}>
              <p style={{ fontSize:10,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",
                color:"var(--text-3)",margin:"0 0 16px" }}>
                CMV por Categoria — Top 10
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={top10Chart} margin={{ top:0, right:0, left:0, bottom:60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize:10, fill:"var(--text-3)" }}
                    angle={-40} textAnchor="end" interval={0} />
                  <YAxis tickFormatter={v => fmtBRLc(v)} tick={{ fontSize:10, fill:"var(--text-3)" }} width={80} />
                  <Tooltip
                    formatter={(v) => [fmtBRL(Number(v)), "CMV"]}
                    labelFormatter={(_,p) => p?.[0]?.payload?.fullName ?? ""}
                    contentStyle={{ background:"var(--surface)", border:"1px solid var(--border)",
                      borderRadius:8, fontSize:12 }}
                  />
                  <Bar dataKey="total" fill="#D4A574" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Summary table */}
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12,
              background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10 }}>
              <thead>
                <tr style={{ background:"var(--surface-2)" }}>
                  {["Categoria","Total CMV","% do Total","Variação MoM"].map((h,i) => (
                    <th key={h} style={{
                      padding:"8px 12px", textAlign:i===0?"left":"right",
                      fontSize:10,fontWeight:700,letterSpacing:0.4,
                      textTransform:"uppercase",color:"var(--text-3)",
                      borderBottom:"1px solid var(--border)",whiteSpace:"nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cmvByCat.map(({ cat, total }) => {
                  const pct  = totalCmv > 0 ? total / totalCmv * 100 : 0
                  const prev = prevCmvByCat.get(cat) ?? 0
                  const varP = prev > 0 ? (total - prev) / prev * 100 : null
                  return (
                    <tr key={cat} style={{ borderTop:"1px solid var(--border)" }}>
                      <td style={{ padding:"7px 12px", fontWeight:500, color:"var(--text)" }}>{cat}</td>
                      <td style={{ padding:"7px 12px", textAlign:"right", color:"var(--text)" }}>
                        {fmtBRL(total)}
                      </td>
                      <td style={{ padding:"7px 12px", textAlign:"right", color:"var(--text-3)" }}>
                        {pct.toFixed(1).replace(".",",")}%
                      </td>
                      <td style={{ padding:"7px 12px", textAlign:"right",
                        color:varP==null?"var(--text-3)":varP>0?"#EF4444":"#22C55E",
                        fontWeight:varP!=null?600:400 }}>
                        {varP != null ? fmtPct(varP) : "—"}
                      </td>
                    </tr>
                  )
                })}
                {/* Total row */}
                <tr style={{ borderTop:"2px solid var(--border)", background:"var(--surface-2)" }}>
                  <td style={{ padding:"7px 12px",fontWeight:700,color:"var(--text)" }}>Total</td>
                  <td style={{ padding:"7px 12px",textAlign:"right",fontWeight:700,color:"var(--text)" }}>
                    {fmtBRL(totalCmv)}
                  </td>
                  <td style={{ padding:"7px 12px",textAlign:"right",fontWeight:700,color:"var(--text)" }}>
                    100,0%
                  </td>
                  <td style={{ padding:"7px 12px",textAlign:"right",fontWeight:700,
                    color:cmvVarPct==null?"var(--text-3)":cmvVarPct>0?"#EF4444":"#22C55E" }}>
                    {cmvVarPct != null ? fmtPct(cmvVarPct) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Import modal ── */}
      {showImport && (
        <ImportModal
          unitId={unitId}
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
