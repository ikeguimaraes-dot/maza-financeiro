"use client"

import { Fragment, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import { formatBRL, formatBRLCompact } from "@/lib/financeiro/utils"
import { KpiCard } from "@kph/ui/kpi-card"
import type { TituloComUnidade } from "@/app/financeiro/actions-operations"
import { ConciliacaoTab } from "./ConciliacaoTab"
import { ProtestosTab } from "./ProtestosTab"

type Props = {
  titulos: TituloComUnidade[]
  competenciaLabel: string
  unitId: string | null
  mes: number
  ano: number
}

// ── Style helpers (mesmo padrão das abas do CMV) ──────────────────────────────
const thS = (align: "left" | "right" = "left"): CSSProperties => ({
  padding: "8px 12px", textAlign: align,
  fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
  textTransform: "uppercase", color: "var(--text-3)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
})

const tdS = (align: "left" | "right" = "left"): CSSProperties => ({
  padding: "7px 12px", textAlign: align, color: "var(--text)",
})

const tableStyle: CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: 12,
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
}

const chevronStyle = (expanded: boolean): CSSProperties => ({
  display: "inline-block", transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
  transition: "transform 0.15s ease", color: "var(--text-3)", fontSize: 12, width: 12,
})

function fmtDate(d: string | null) {
  return d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—"
}

// ── Component ────────────────────────────────────────────────────────────────
// Recebe titulos já filtrados por mês (seletor da página) + unidade (shell) +
// categoria (FiltroCategoria, server-side via router.push). O filtro de
// fornecedor é aplicado aqui em cima disso — client-side, sem router.push,
// mesmo padrão da aba Fornecedor do CMV (busca parcial em useMemo + dropdown
// coerente com o texto).
type StatusFiltro = "aberto" | "pago" | "todos"

const STATUS_LABELS: Record<StatusFiltro, string> = {
  aberto: "Em aberto",
  pago: "Pagos",
  todos: "Todos",
}

function situacao(t: TituloComUnidade): string {
  return (t.situacao_atual ?? "").trim().toUpperCase()
}
function posicao(t: TituloComUnidade): string {
  return (t.posicao ?? "").trim().toUpperCase()
}

export function PagarConteudo({ titulos, competenciaLabel, unitId, mes, ano }: Props) {
  const [tab, setTab] = useState<"titulos" | "conciliacao" | "protestos">("titulos")
  const [busca, setBusca] = useState("")
  const [expandedFornecedores, setExpandedFornecedores] = useState<Set<string>>(new Set())

  // Toggle de status de pagamento — situacao_atual (LIQUIDADO/ATIVO). Default
  // "Em aberto": o que o usuário precisa pagar é a visão mais útil ao abrir a página.
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("aberto")

  // Intervalo de dias dentro do mês já selecionado — opcional, não mexe no
  // seletor de mês (competencia). null = sem filtro (mês inteiro).
  const [diaInicial, setDiaInicial] = useState<number | null>(null)
  const [diaFinal, setDiaFinal] = useState<number | null>(null)
  const diasNoMes = useMemo(() => new Date(ano, mes, 0).getDate(), [ano, mes])
  const intervaloAtivo = diaInicial !== null || diaFinal !== null
  const diaMin = Math.min(diaInicial ?? 1, diaFinal ?? diasNoMes)
  const diaMax = Math.max(diaInicial ?? 1, diaFinal ?? diasNoMes)

  function limparIntervalo() {
    setDiaInicial(null)
    setDiaFinal(null)
  }

  const fornecedores = useMemo(() => {
    const set = new Set<string>()
    for (const t of titulos) {
      if (t.razao_fornecedor) set.add(t.razao_fornecedor)
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"))
  }, [titulos])

  const sugestoes = useMemo(() => {
    const b = busca.trim().toLowerCase()
    if (!b) return fornecedores
    return fornecedores.filter(f => f.toLowerCase().includes(b))
  }, [fornecedores, busca])

  // Combina busca por fornecedor + intervalo de dias + status de pagamento.
  // d_vencimento já vem restrito ao mês selecionado desde a query
  // server-side — aqui só refina por dia dentro desse mês, comparando
  // string "YYYY-MM-DD" pra evitar qualquer problema de fuso horário na
  // construção de Date.
  const titulosFiltrados = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return titulos.filter(t => {
      if (b && !(t.razao_fornecedor ?? "").toLowerCase().includes(b)) return false
      if (intervaloAtivo) {
        if (!t.d_vencimento) return false
        const dia = parseInt(t.d_vencimento.slice(8, 10), 10)
        if (dia < diaMin || dia > diaMax) return false
      }
      if (statusFiltro === "aberto" && situacao(t) !== "ATIVO") return false
      if (statusFiltro === "pago" && situacao(t) !== "LIQUIDADO") return false
      return true
    })
  }, [titulos, busca, intervaloAtivo, diaMin, diaMax, statusFiltro])

  // Recomputa KPIs sobre o subconjunto filtrado (fornecedor + dia + status)
  // — total do mês/unidade, não por fornecedor (o agrupamento da tabela não
  // afeta os KPIs). Vencidos/A vencer usam o campo posicao (VENCIDO/A
  // VENCER) que já vem classificado pelo ERP, só dentro de ATIVO — um
  // título LIQUIDADO não conta como "a pagar" em nenhum dos dois. Pago usa
  // v_pagamento (cai pra v_titulo se não vier preenchido).
  const kpis = useMemo(() => {
    let total_valor = 0, total_saldo = 0, fluxo_caixa_valor = 0
    let vencidos_count = 0, vencidos_valor = 0
    let a_vencer_count = 0, a_vencer_valor = 0
    let pagos_count = 0, pagos_valor = 0
    for (const t of titulosFiltrados) {
      const v = t.v_titulo ?? 0; const s = t.v_saldo_atual ?? 0
      total_valor += v; total_saldo += s
      if (t.fluxo_de_caixa) fluxo_caixa_valor += s

      const sit = situacao(t)
      if (sit === "LIQUIDADO") {
        pagos_count++
        pagos_valor += t.v_pagamento ?? v
      } else if (sit === "ATIVO") {
        const pos = posicao(t)
        if (pos === "VENCIDO") { vencidos_count++; vencidos_valor += s }
        else if (pos === "A VENCER") { a_vencer_count++; a_vencer_valor += s }
      }
    }
    return {
      total_titulos: titulosFiltrados.length, total_valor, total_saldo, fluxo_caixa_valor,
      vencidos_count, vencidos_valor, a_vencer_count, a_vencer_valor, pagos_count, pagos_valor,
      total_aberto_valor: vencidos_valor + a_vencer_valor,
    }
  }, [titulosFiltrados])

  // Visão de fluxo do mês inteiro — independente dos filtros de tela (dia,
  // fornecedor, status): sempre reflete o mês/unidade selecionados por
  // d_vencimento, igual à query server-side de `titulos`.
  const fluxoMes = useMemo(() => {
    let pago = 0, aberto = 0
    for (const t of titulos) {
      const sit = situacao(t)
      if (sit === "LIQUIDADO") pago += t.v_pagamento ?? t.v_titulo ?? 0
      else if (sit === "ATIVO") aberto += t.v_titulo ?? 0
    }
    const total = pago + aberto
    const pctPago = total > 0 ? (pago / total) * 100 : 0
    return { pago, aberto, total, pctPago }
  }, [titulos])

  // Agrupa por fornecedor (razao_fornecedor) — soma de v_titulo por grupo pra
  // dar o total pago no mês pra fornecedores pagos em várias parcelas/semanas.
  const gruposFornecedor = useMemo(() => {
    const map = new Map<string, TituloComUnidade[]>()
    for (const t of titulosFiltrados) {
      const key = t.razao_fornecedor ?? "(sem fornecedor)"
      const bucket = map.get(key) ?? []
      bucket.push(t)
      map.set(key, bucket)
    }
    const grupos = [...map.entries()].map(([razaoFornecedor, ts]) => {
      const ordenados = [...ts].sort((a, b) => {
        const da = a.d_vencimento ?? ""
        const db = b.d_vencimento ?? ""
        if (da !== db) return da.localeCompare(db)
        return (a.n_titulo ?? "").localeCompare(b.n_titulo ?? "", "pt-BR", { numeric: true })
      })
      const descricoes = new Set(ts.map(t => t.descricao_c_gerencial ?? "").filter(Boolean))
      const descCGerencial = descricoes.size === 0 ? "—" : descricoes.size === 1 ? [...descricoes][0] : "Vários"
      const vTituloTotal = ts.reduce((sum, t) => sum + (t.v_titulo ?? 0), 0)
      return {
        razaoFornecedor,
        fantasiaFornecedor: ts.find(t => t.fantasia_fornecedor)?.fantasia_fornecedor ?? null,
        cnpjCpf: ts.find(t => t.cnpj_cpf_fornecedor)?.cnpj_cpf_fornecedor ?? null,
        descCGerencial,
        vTituloTotal,
        titulos: ordenados,
      }
    })
    return grupos.sort((a, b) => b.vTituloTotal - a.vTituloTotal)
  }, [titulosFiltrados])

  const toggleFornecedor = (key: string) => {
    setExpandedFornecedores(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const semDados = titulosFiltrados.length === 0

  return (
    <>
      {/* Tab nav */}
      <nav style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", marginBottom: 24 }}>
        {(["titulos", "conciliacao", "protestos"] as const).map(t => {
          const labels = { titulos: "Títulos", conciliacao: "Conciliação", protestos: "Protestos" }
          const active = tab === t
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "8px 18px", fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? "var(--text)" : "var(--text-3)",
              borderBottom: active ? "2px solid var(--brand, #D4A574)" : "2px solid transparent",
              background: "transparent", border: "none", cursor: "pointer",
              whiteSpace: "nowrap", marginBottom: -1,
            }}>
              {labels[t]}
            </button>
          )
        })}
      </nav>

      {tab === "conciliacao" && (
        <ConciliacaoTab unitId={unitId} mes={mes} ano={ano} />
      )}

      {tab === "protestos" && (
        <ProtestosTab unitId={unitId} />
      )}

      {tab === "titulos" && (
        <>
        {/* Fluxo do mês — sempre o mês/unidade inteiros, por d_vencimento,
            independente dos filtros de tela abaixo (dia/fornecedor/status) */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
          padding: "16px 20px", marginBottom: 20,
        }}>
          <p style={{ ...sectionTitle, margin: "0 0 12px" }}>
            Fluxo do mês — {competenciaLabel}
          </p>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-3)", margin: 0 }}>Já pago</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: "#22C55E", margin: "2px 0 0" }}>{formatBRLCompact(fluxoMes.pago)}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-3)", margin: 0 }}>Em aberto</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "2px 0 0" }}>{formatBRLCompact(fluxoMes.aberto)}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-3)", margin: 0 }}>Total do mês</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: "var(--brand, #D4A574)", margin: "2px 0 0" }}>{formatBRLCompact(fluxoMes.total)}</p>
            </div>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: "var(--surface-2)", overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${fluxoMes.pctPago}%`, background: "#22C55E", transition: "width 0.3s ease" }} />
          </div>
          <p style={{ fontSize: 11, color: "var(--text-3)", margin: "6px 0 0" }}>
            {fluxoMes.pctPago.toFixed(0)}% do mês já pago
          </p>
        </div>

        {/* Status de pagamento — Em aberto (default) / Pagos / Todos */}
        <div style={{ display: "flex", borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden", width: "fit-content", marginBottom: 12 }}>
          {(Object.keys(STATUS_LABELS) as StatusFiltro[]).map(s => (
            <button key={s} onClick={() => setStatusFiltro(s)} style={{
              padding: "7px 14px", fontSize: 12, fontWeight: statusFiltro === s ? 700 : 500,
              background: statusFiltro === s ? "var(--brand, #D4A574)" : "var(--surface)",
              color: statusFiltro === s ? "var(--primary-foreground, #1A1208)" : "var(--text-3)",
              border: "none", cursor: "pointer", whiteSpace: "nowrap",
            }}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Filtro fornecedor — texto livre + dropdown, coerentes entre si */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
          <input
            placeholder="Buscar fornecedor por razão social…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{
              padding: "7px 12px", borderRadius: 8, fontSize: 12,
              background: "var(--surface)", color: "var(--text)",
              border: "1px solid var(--border)", minWidth: 260, flex: 1,
            }}
          />
          <select
            value={fornecedores.includes(busca) ? busca : ""}
            onChange={e => setBusca(e.target.value)}
            style={{
              padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: "var(--surface)", color: "var(--text)",
              border: "1px solid var(--border)", minWidth: 260, cursor: "pointer",
            }}
          >
            <option value="">Todos os fornecedores</option>
            {sugestoes.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          {busca && (
            <button
              onClick={() => setBusca("")}
              style={{
                padding: "6px 12px", borderRadius: 8, fontSize: 12,
                background: "transparent", color: "var(--text-3)",
                border: "1px solid var(--border)", cursor: "pointer",
              }}
            >
              Limpar
            </button>
          )}
        </div>

        {/* Intervalo de dias dentro do mês selecionado — opcional */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>Dia</span>
          <select
            value={diaInicial ?? ""}
            onChange={e => setDiaInicial(e.target.value ? Number(e.target.value) : null)}
            style={{
              padding: "7px 10px", borderRadius: 8, fontSize: 12,
              background: "var(--surface)", color: "var(--text)",
              border: "1px solid var(--border)", cursor: "pointer",
            }}
          >
            <option value="">Início do mês</option>
            {Array.from({ length: diasNoMes }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>até</span>
          <select
            value={diaFinal ?? ""}
            onChange={e => setDiaFinal(e.target.value ? Number(e.target.value) : null)}
            style={{
              padding: "7px 10px", borderRadius: 8, fontSize: 12,
              background: "var(--surface)", color: "var(--text)",
              border: "1px solid var(--border)", cursor: "pointer",
            }}
          >
            <option value="">Fim do mês</option>
            {Array.from({ length: diasNoMes }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          {intervaloAtivo && (
            <button
              onClick={limparIntervalo}
              style={{
                padding: "6px 12px", borderRadius: 8, fontSize: 12,
                background: "transparent", color: "var(--text-3)",
                border: "1px solid var(--border)", cursor: "pointer",
              }}
            >
              Limpar intervalo
            </button>
          )}
        </div>

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
            sub={`${STATUS_LABELS[statusFiltro]}${intervaloAtivo ? ` · dia ${diaMin}–${diaMax}` : ""}`}
          />
          <KpiCard
            label="Total em aberto"
            value={formatBRLCompact(kpis.total_aberto_valor)}
            sub="Vencidos + a vencer (ATIVO)"
          />
          <KpiCard
            label="Vencidos"
            value={
              <span style={{ color: kpis.vencidos_count > 0 ? "#EF4444" : "var(--text)" }}>
                {formatBRLCompact(kpis.vencidos_valor)}
              </span>
            }
            sub={`${kpis.vencidos_count} título${kpis.vencidos_count !== 1 ? "s" : ""} · ATIVO + VENCIDO`}
          />
          <KpiCard
            label="A vencer"
            value={formatBRLCompact(kpis.a_vencer_valor)}
            sub={`${kpis.a_vencer_count} título${kpis.a_vencer_count !== 1 ? "s" : ""} · ATIVO + A VENCER`}
          />
          <KpiCard
            label="Pago"
            value={
              <span style={{ color: "#22C55E" }}>{formatBRLCompact(kpis.pagos_valor)}</span>
            }
            sub={`${kpis.pagos_count} título${kpis.pagos_count !== 1 ? "s" : ""} · LIQUIDADO`}
          />
          <KpiCard
            label="Fluxo de caixa"
            value={formatBRLCompact(kpis.fluxo_caixa_valor)}
            sub="Marcados no FC"
          />
        </section>

        {/* Tabela de títulos — mestre por fornecedor, expande pros títulos individuais */}
        <h2 style={sectionTitle}>
          Títulos a pagar — {competenciaLabel}{intervaloAtivo ? ` · dia ${diaMin}–${diaMax}` : ""}
        </h2>

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
            Nenhum título encontrado para {competenciaLabel}
            {intervaloAtivo ? ` · dia ${diaMin}–${diaMax}` : ""}
            {busca ? ` · ${busca}` : ""}.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ background: "var(--surface-2)" }}>
                  <th style={thS()}></th>
                  <th style={thS()}>Razão Fornecedor</th>
                  <th style={thS()}>Fantasia Fornecedor</th>
                  <th style={thS()}>CNPJ/CPF</th>
                  <th style={thS()}>Desc. C. Gerencial</th>
                  <th style={thS("right")}>V. Título</th>
                  <th style={thS("right")}>Títulos</th>
                </tr>
              </thead>
              <tbody>
                {gruposFornecedor.map(g => {
                  const expanded = expandedFornecedores.has(g.razaoFornecedor)
                  return (
                    <Fragment key={g.razaoFornecedor}>
                      <tr
                        style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}
                        onClick={() => toggleFornecedor(g.razaoFornecedor)}
                      >
                        <td style={{ ...tdS(), width: 24 }}>
                          <span style={chevronStyle(expanded)}>›</span>
                        </td>
                        <td style={{ ...tdS(), fontWeight: 600, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.razaoFornecedor}
                        </td>
                        <td style={{ ...tdS(), maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.fantasiaFornecedor ?? "—"}
                        </td>
                        <td style={{ ...tdS(), whiteSpace: "nowrap" }}>{g.cnpjCpf ?? "—"}</td>
                        <td style={{ ...tdS(), maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.descCGerencial}
                        </td>
                        <td style={{ ...tdS("right"), fontWeight: 700 }}>{formatBRL(g.vTituloTotal)}</td>
                        <td style={tdS("right")}>
                          {g.titulos.length} título{g.titulos.length !== 1 ? "s" : ""}
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={7} style={{ padding: "0 12px 12px 36px", background: "var(--surface-2)" }}>
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ ...tableStyle, background: "var(--surface)", fontSize: 11 }}>
                                <thead>
                                  <tr>
                                    <th style={thS()}>N. Título</th>
                                    <th style={thS()}>Parcela</th>
                                    <th style={thS()}>D. Vencimento</th>
                                    <th style={thS()}>D. Competência</th>
                                    <th style={thS()}>Desc. C. Gerencial</th>
                                    <th style={thS()}>Portador</th>
                                    <th style={thS()}>Situação</th>
                                    <th style={thS("right")}>V. Título</th>
                                    <th style={thS("right")}>V. Saldo Atual</th>
                                    <th style={thS()}>N. Nota Fiscal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.titulos.map(t => {
                                    const vencido = !!t.d_vencimento && new Date(`${t.d_vencimento}T12:00:00`) < new Date(new Date().toDateString())
                                    return (
                                      <tr key={t.id} style={{
                                        borderTop: "1px solid var(--border)",
                                        background: vencido && (t.v_saldo_atual ?? 0) > 0 ? "rgba(239,68,68,0.04)" : undefined,
                                      }}>
                                        <td style={{ ...tdS(), whiteSpace: "nowrap" }}>{t.n_titulo ?? "—"}</td>
                                        <td style={{ ...tdS(), whiteSpace: "nowrap" }}>{t.parcela ?? "—"}</td>
                                        <td style={{ ...tdS(), whiteSpace: "nowrap" }}>
                                          <span style={{ color: vencido ? "#EF4444" : "var(--text)", fontWeight: vencido ? 600 : 400 }}>
                                            {fmtDate(t.d_vencimento)}
                                          </span>
                                        </td>
                                        <td style={{ ...tdS(), whiteSpace: "nowrap" }}>{fmtDate(t.d_competencia)}</td>
                                        <td style={{ ...tdS(), maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {t.descricao_c_gerencial ?? "—"}
                                        </td>
                                        <td style={{ ...tdS(), maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {t.portador ?? "—"}
                                        </td>
                                        <td style={tdS()}>
                                          <SituacaoBadge situacao={t.situacao_atual} />
                                        </td>
                                        <td style={tdS("right")}>{formatBRL(t.v_titulo)}</td>
                                        <td style={tdS("right")}><strong>{formatBRL(t.v_saldo_atual)}</strong></td>
                                        <td style={{ ...tdS(), whiteSpace: "nowrap" }}>{t.n_nota_fiscal ?? "—"}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        </>
      )}
    </>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

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

const sectionTitle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "var(--text-3)",
  margin: "0 0 10px",
};
