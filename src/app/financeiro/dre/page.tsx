import Link from "next/link"
import { requireUser } from "@kph/auth/server"
import { createSupabaseServerClient } from "@kph/db/supabase/server"
import { KpiCard } from "@kph/ui/kpi-card"
import { formatBRLCompact } from "@/lib/financeiro/utils"
import {
  DreBarChart,
  type DreChartPoint,
} from "@/components/financeiro/DreBarChart"
import { DreTabNav } from "@/components/financeiro/dre/DreTabNav"
import {
  DreDrillTable,
  type DreMensalRowClient,
  type LinhaDetalhadaRow,
} from "@/components/financeiro/dre/DreDrillTable"
import {
  IndicadoresTab,
  type IndicadorRow,
} from "@/components/financeiro/dre/IndicadoresTab"
import {
  ReceitaTab,
  type ReceitaRow,
} from "@/components/financeiro/dre/ReceitaTab"
import {
  DespesasTab,
  type DespesaAgg,
  type PessoalDetalheRow,
  type ManutencaoDetalheRow,
  type PrestadorRow,
  type ContratoFixoRow,
} from "@/components/financeiro/dre/DespesasTab"
import {
  FolhaTab,
  type FolhaRow,
} from "@/components/financeiro/dre/FolhaTab"
import {
  GorjetaTab,
  type GorjetaRow,
} from "@/components/financeiro/dre/GorjetaTab"
import {
  HistoricoTab,
  type HistoricoRow,
} from "@/components/financeiro/dre/HistoricoTab"
import {
  AuditTab,
  type AuditTabProps,
} from "@/components/financeiro/dre/AuditTab"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ mes?: string; aba?: string }>

// ── Types ─────────────────────────────────────────────────────────────────────

type DreMensalRow = {
  id: number
  mes_ano: string
  tipo: "orcado" | "realizado"
  receita_bruta: number | null
  cmv: number | null
  pessoal: number | null
  ocupacao: number | null
  utilidades: number | null
  operacao: number | null
  manutencao: number | null
  administrativa: number | null
  marketing: number | null
  taxa_cartao: number | null
  impostos: number | null
  ebitda: number | null
  resultado_liquido: number | null
  clientes: number | null
  ticket_medio: number | null
}

// ── DRE line definitions ──────────────────────────────────────────────────────

type DreLine = { key: string; label: string; isTotal?: boolean }

const DRE_LINES: DreLine[] = [
  { key: "receita_bruta",     label: "Receita Bruta" },
  { key: "impostos",          label: "(-) Impostos" },
  { key: "receita_liquida",   label: "(=) Receita Líquida",   isTotal: true },
  { key: "cmv",               label: "(-) CMV" },
  { key: "pessoal",           label: "(-) Pessoal" },
  { key: "ocupacao",          label: "(-) Ocupação" },
  { key: "utilidades",        label: "(-) Utilidades" },
  { key: "operacao",          label: "(-) Operação" },
  { key: "manutencao",        label: "(-) Manutenção" },
  { key: "administrativa",    label: "(-) Administrativa" },
  { key: "marketing",         label: "(-) Marketing" },
  { key: "taxa_cartao",       label: "(-) Taxa Cartão" },
  { key: "ebitda",            label: "(=) EBITDA",            isTotal: true },
  { key: "resultado_liquido", label: "(=) Resultado Líquido", isTotal: true },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]

function mesLabel(mesAno: string): string {
  const [year, month] = mesAno.split("-")
  const m = parseInt(month ?? "1", 10)
  return `${MESES[(m - 1) % 12] ?? "?"} ${year ?? ""}`
}

function mesShort(mesAno: string): string {
  const m = parseInt(mesAno.split("-")[1] ?? "1", 10)
  return MESES[(m - 1) % 12] ?? "?"
}

function sortMes(a: string, b: string) {
  const toN = (s: string) => {
    const [y, mo] = s.split("-").map(Number)
    return (y ?? 0) * 12 + (mo ?? 0)
  }
  return toN(a) - toN(b)
}

function rowVal(key: string, row: DreMensalRow | undefined): number | null {
  if (!row) return null
  if (key === "receita_liquida") {
    return (row.receita_bruta ?? 0) + (row.impostos ?? 0)
  }
  return (row as unknown as Record<string, number | null>)[key] ?? null
}

function varR(real: number | null, bd: number | null): number | null {
  if (real === null || bd === null) return null
  return real - bd
}

function varPctFn(real: number | null, bd: number | null): number | null {
  if (real === null || bd === null || bd === 0) return null
  return ((real - bd) / Math.abs(bd)) * 100
}

function pctOfReceita(value: number | null, receita: number | null): number | null {
  if (value === null || receita === null || receita === 0) return null
  return (value / receita) * 100
}

function fmtPct(v: number | null, digits = 1): string {
  if (v === null) return "—"
  return `${v.toFixed(digits).replace(".", ",")}%`
}

function fmtVarPct(v: number | null): string {
  if (v === null) return "—"
  return `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`
}

function fmtVarR(v: number | null): string {
  if (v === null) return "—"
  const s = formatBRLCompact(Math.abs(v))
  return `${v >= 0 ? "+" : "-"}${s}`
}

function varColor(v: number | null): string {
  if (v === null || Math.abs(v) < 0.5) return "var(--text-3)"
  return v > 0 ? "#22C55E" : "#EF4444"
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DreGerencialPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireUser()
  const sp = await searchParams
  const aba = sp.aba ?? "dre"

  const supabase = await createSupabaseServerClient()

  // ── Data fetching per tab ─────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  let dreRows: DreMensalRow[] = []
  let indicRows: IndicadorRow[] = []
  let receitaRows: ReceitaRow[] = []
  let despesaAgg: DespesaAgg[] = []
  let pessoalRows: PessoalDetalheRow[] = []
  let manutencaoRows: ManutencaoDetalheRow[] = []
  let prestadoresRows: PrestadorRow[] = []
  let contratosRows: ContratoFixoRow[] = []
  let folhaRows: FolhaRow[] = []
  let gorjetaRows: GorjetaRow[] = []
  let historicoRows: HistoricoRow[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let kpiRows: any[] = []
  let linhasRows: LinhaDetalhadaRow[] = []
  let auditDespRows: AuditTabProps["despRows"] = []
  let auditPrestRows: AuditTabProps["prestadores"] = []
  let auditContratosRows: AuditTabProps["contratosFixos"] = []
  let auditReceitaRows: AuditTabProps["receitaDetalhada"] = []

  if (supabase) {
    if (aba === "dre") {
      const [dreRes, kpiRes, linhasRes] = await Promise.all([
        db.from("dre_mensal").select("*").order("mes_ano").order("tipo"),
        db.from("dre_kpis_mensais").select("*"),
        db.from("dre_linhas_detalhadas").select("*").order("mes_ano").order("tipo").order("grupo"),
      ])
      if (dreRes.data) dreRows = dreRes.data as DreMensalRow[]
      if (kpiRes.data) kpiRows = kpiRes.data
      if (linhasRes.data) linhasRows = linhasRes.data as LinhaDetalhadaRow[]
    }

    if (aba === "indicadores") {
      const [indRes, linhasRes] = await Promise.all([
        db.from("dre_indicadores").select("*").order("mes_ano").order("tipo").order("indicador"),
        db.from("dre_linhas_detalhadas").select("*").order("mes_ano").order("tipo").order("grupo"),
      ])
      if (indRes.data) indicRows = indRes.data as IndicadorRow[]
      if (linhasRes.data) linhasRows = linhasRes.data as LinhaDetalhadaRow[]
    }

    if (aba === "receita") {
      const { data } = await db.from("dre_receita_detalhada").select("*").order("mes_ano").order("bandeira")
      if (data) receitaRows = data as ReceitaRow[]
    }

    if (aba === "despesas") {
      const [despRes, pesRes, manRes, prestRes, contRes, linhasRes] = await Promise.all([
        db.from("dre_despesa_detalhada")
          .select("mes_ano,tipo_despesa,classificacao_dre,valor")
          .not("tipo_despesa", "in", '("IMOBILIZADO","INVESTIMENTO")'),
        db.from("dre_pessoal_detalhado").select("*").order("mes_ano").order("categoria"),
        db.from("dre_manutencao_detalhada").select("*").order("mes_ano").order("valor"),
        db.from("dre_prestadores").select("*").order("mes_ano").order("grupo").order("nome"),
        db.from("dre_contratos_fixos").select("*").order("tipo").order("razao_social"),
        db.from("dre_linhas_detalhadas").select("*").order("mes_ano").order("tipo").order("grupo"),
      ])

      if (despRes.data) {
        const map = new Map<string, DespesaAgg>()
        for (const row of despRes.data as { mes_ano: string; tipo_despesa: string; classificacao_dre: string; valor: number }[]) {
          if (!row.tipo_despesa || !row.classificacao_dre) continue
          const key = `${row.mes_ano}||${row.tipo_despesa}||${row.classificacao_dre}`
          const existing = map.get(key)
          if (existing) {
            existing.total += row.valor ?? 0
          } else {
            map.set(key, { mes_ano: row.mes_ano, tipo_despesa: row.tipo_despesa, classificacao_dre: row.classificacao_dre, total: row.valor ?? 0 })
          }
        }
        despesaAgg = [...map.values()]
      }
      if (pesRes.data) pessoalRows = pesRes.data as PessoalDetalheRow[]
      if (manRes.data) manutencaoRows = manRes.data as ManutencaoDetalheRow[]
      if (prestRes.data) prestadoresRows = prestRes.data as PrestadorRow[]
      if (contRes.data) contratosRows = contRes.data as ContratoFixoRow[]
      if (linhasRes.data) linhasRows = linhasRes.data as LinhaDetalhadaRow[]
    }

    if (aba === "folha") {
      const [folhaRes, linhasRes] = await Promise.all([
        db.from("dre_folha").select("*").order("divisao").order("funcao").order("nome"),
        db.from("dre_linhas_detalhadas").select("*").eq("grupo", "PESSOAL").order("mes_ano").order("tipo"),
      ])
      if (folhaRes.data) folhaRows = folhaRes.data as FolhaRow[]
      if (linhasRes.data) linhasRows = linhasRes.data as LinhaDetalhadaRow[]
    }

    if (aba === "gorjeta") {
      const { data } = await db.from("dre_gorjeta_mensal").select("*").order("mes_ano")
      if (data) gorjetaRows = data as GorjetaRow[]
    }

    if (aba === "historico") {
      const { data } = await db.from("dre_faturamento_historico").select("*").order("mes_num")
      if (data) historicoRows = data as HistoricoRow[]
    }

    if (aba === "auditoria") {
      const [dreARes, linhasARes, despARes, prestARes, contARes, recARes] = await Promise.all([
        db.from("dre_mensal").select("*").order("mes_ano").order("tipo"),
        db.from("dre_linhas_detalhadas").select("*").order("mes_ano").order("tipo").order("grupo"),
        db.from("dre_despesa_detalhada")
          .select("mes_ano,tipo_despesa,classificacao_dre,valor")
          .not("tipo_despesa","in",'("IMOBILIZADO","INVESTIMENTO")'),
        db.from("dre_prestadores").select("mes_ano,grupo,nome,valor").order("mes_ano").order("grupo"),
        db.from("dre_contratos_fixos").select("tipo,razao_social,descricao,valor_mensal"),
        db.from("dre_receita_detalhada").select("mes_ano,bandeira,valor").order("mes_ano"),
      ])
      if (dreARes.data)    dreRows            = dreARes.data    as DreMensalRow[]
      if (linhasARes.data) linhasRows         = linhasARes.data as LinhaDetalhadaRow[]
      if (despARes.data)   auditDespRows      = despARes.data   as AuditTabProps["despRows"]
      if (prestARes.data)  auditPrestRows     = prestARes.data  as AuditTabProps["prestadores"]
      if (contARes.data)   auditContratosRows = contARes.data   as AuditTabProps["contratosFixos"]
      if (recARes.data)    auditReceitaRows   = recARes.data    as AuditTabProps["receitaDetalhada"]
    }
  }

  // ── DRE tab derived values ────────────────────────────────────────────────

  const reMonths = [
    ...new Set(dreRows.filter((r) => r.tipo === "realizado").map((r) => r.mes_ano)),
  ].sort(sortMes)

  const mes =
    sp.mes && reMonths.includes(sp.mes)
      ? sp.mes
      : (reMonths.at(-1) ?? "2026-4")

  const re = dreRows.find((r) => r.mes_ano === mes && r.tipo === "realizado")
  const bd = dreRows.find((r) => r.mes_ano === mes && r.tipo === "orcado")

  const reRecLiq = rowVal("receita_liquida", re)
  const bdRecLiq = rowVal("receita_liquida", bd)

  const chartData: DreChartPoint[] = reMonths.map((m) => {
    const r = dreRows.find((x) => x.mes_ano === m && x.tipo === "realizado")
    const b = dreRows.find((x) => x.mes_ano === m && x.tipo === "orcado")
    const rLiq = rowVal("receita_liquida", r)
    const bLiq = rowVal("receita_liquida", b)
    const absPct = (v: number | null, base: number | null) =>
      v !== null && base ? Math.abs((v / base) * 100) : null
    const pct = (v: number | null, base: number | null) =>
      v !== null && base ? (v / base) * 100 : null
    return {
      mes: mesShort(m),
      cmv_re: absPct(r?.cmv ?? null, rLiq),
      cmv_bd: absPct(b?.cmv ?? null, bLiq),
      pessoal_re: absPct(r?.pessoal ?? null, rLiq),
      pessoal_bd: absPct(b?.pessoal ?? null, bLiq),
      ebitda_re: pct(r?.ebitda ?? null, rLiq),
      ebitda_bd: pct(b?.ebitda ?? null, bLiq),
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kpiForMes = (kpiRows as any[]).find((k) => k.mes_ano === mes)

  const cmvPctRe  = re?.cmv  != null && reRecLiq ? Math.abs((re.cmv  / reRecLiq) * 100) : null
  const cmvPctBd  = bd?.cmv  != null && bdRecLiq ? Math.abs((bd.cmv  / bdRecLiq) * 100) : null
  const pessPctRe = re?.pessoal != null && reRecLiq ? Math.abs((re.pessoal / reRecLiq) * 100) : null
  const pessPctBd = bd?.pessoal != null && bdRecLiq ? Math.abs((bd.pessoal / bdRecLiq) * 100) : null

  // ── Empty state for no-table scenario ─────────────────────────────────────

  const TABLE_FOR_TAB: Record<string, string> = {
    dre:         "dre_mensal",
    indicadores: "dre_indicadores",
    receita:     "dre_receita_detalhada",
    despesas:    "dre_despesa_detalhada",
    folha:       "dre_folha",
    gorjeta:     "dre_gorjeta_mensal",
    historico:   "dre_faturamento_historico",
    auditoria:   "dre_mensal",
  }
  const SQL_FOR_TAB: Record<string, string> = {
    dre:         "sql/002_dre_mensal.sql",
    indicadores: "sql/005_dre_indicadores.sql",
    receita:     "sql/006_dre_receita_detalhada.sql",
    despesas:    "sql/007_dre_despesa_detalhada.sql",
    folha:       "sql/008_dre_folha.sql",
    gorjeta:     "sql/009_dre_gorjeta_mensal.sql",
    historico:   "sql/010_dre_faturamento_historico.sql",
    auditoria:   "sql/002_dre_mensal.sql",
  }

  const isEmpty =
    (aba === "dre" && dreRows.length === 0) ||
    (aba === "indicadores" && indicRows.length === 0) ||
    (aba === "receita" && receitaRows.length === 0) ||
    (aba === "despesas" && despesaAgg.length === 0) ||
    (aba === "folha" && folhaRows.length === 0) ||
    (aba === "gorjeta" && gorjetaRows.length === 0) ||
    (aba === "historico" && historicoRows.length === 0) ||
    (aba === "auditoria" && dreRows.length === 0)

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Breadcrumb */}
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

      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          margin: "10px 0 20px",
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
              margin: "0 0 4px",
            }}
          >
            DRE Gerencial
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>
            Orçado vs Realizado · 2026
          </p>
        </div>

        {/* Month selector — only visible on DRE tab */}
        {aba === "dre" && reMonths.length > 0 && (
          <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {reMonths.map((m) => {
              const active = m === mes
              return (
                <Link
                  key={m}
                  href={`?aba=dre&mes=${m}`}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    background: active ? "var(--brand)" : "var(--surface)",
                    color: active ? "#1A1208" : "var(--text-3)",
                    border: `1px solid ${active ? "transparent" : "var(--border)"}`,
                    textDecoration: "none",
                  }}
                >
                  {mesLabel(m)}
                </Link>
              )
            })}
          </nav>
        )}
      </header>

      {/* Sub-tab navigation */}
      <DreTabNav aba={aba} />

      {/* ── EMPTY STATE ─────────────────────────────────────────────────────── */}
      {isEmpty ? (
        <div
          style={{
            padding: "40px 24px",
            textAlign: "center",
            background: "var(--surface)",
            border: "1px dashed var(--border)",
            borderRadius: 14,
          }}
        >
          <p style={{ fontSize: 14, color: "var(--text-3)", marginBottom: 12 }}>
            Tabela{" "}
            <code
              style={{
                background: "var(--surface-2)",
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              {TABLE_FOR_TAB[aba]}
            </code>{" "}
            não encontrada ou sem dados.
          </p>
          <p style={{ fontSize: 12, color: "var(--text-3)" }}>
            Execute{" "}
            <strong style={{ color: "var(--text)" }}>{SQL_FOR_TAB[aba]}</strong>{" "}
            no Supabase Dashboard → SQL Editor.
          </p>
        </div>
      ) : (
        <>
          {/* ── TAB: DRE ──────────────────────────────────────────────────── */}
          {aba === "dre" && (
            <>
              {/* Summary KPIs */}
              <SectionTitle>Resumo do Mês · {mesLabel(mes)}</SectionTitle>
              <section
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 12,
                  marginBottom: 28,
                }}
              >
                <KpiCard
                  label="Receita Bruta"
                  value={re?.receita_bruta != null ? formatBRLCompact(re.receita_bruta) : "—"}
                  sub={bd?.receita_bruta != null ? `BD: ${formatBRLCompact(bd.receita_bruta)}` : "Sem orçado"}
                  trailing={
                    <VarBadge
                      v={varPctFn(re?.receita_bruta ?? null, bd?.receita_bruta ?? null)}
                      lowerIsBetter={false}
                    />
                  }
                />
                <KpiCard
                  label="EBITDA"
                  value={re?.ebitda != null ? formatBRLCompact(re.ebitda) : "—"}
                  sub={bd?.ebitda != null ? `BD: ${formatBRLCompact(bd.ebitda)}` : "Sem orçado"}
                  trailing={
                    <VarBadge
                      v={varPctFn(re?.ebitda ?? null, bd?.ebitda ?? null)}
                      lowerIsBetter={false}
                    />
                  }
                >
                  {reRecLiq != null && reRecLiq > 0 && re?.ebitda != null && (
                    <span
                      style={{
                        fontSize: 11,
                        color: re.ebitda / reRecLiq >= 0.08 ? "#22C55E" : "#EF4444",
                        fontWeight: 600,
                      }}
                    >
                      {fmtPct(pctOfReceita(re.ebitda, reRecLiq))} da rec. líq.
                    </span>
                  )}
                </KpiCard>
                <KpiCard
                  label="Resultado Líquido"
                  value={re?.resultado_liquido != null ? formatBRLCompact(re.resultado_liquido) : "—"}
                  sub={bd?.resultado_liquido != null ? `BD: ${formatBRLCompact(bd.resultado_liquido)}` : "Sem orçado"}
                  trailing={
                    <VarBadge
                      v={varPctFn(re?.resultado_liquido ?? null, bd?.resultado_liquido ?? null)}
                      lowerIsBetter={false}
                    />
                  }
                />
                <KpiCard
                  label="CMV % da Receita Líq."
                  value={cmvPctRe != null ? fmtPct(cmvPctRe) : "—"}
                  sub={cmvPctBd != null ? `Meta: ${fmtPct(cmvPctBd)}` : "Sem meta"}
                  trailing={
                    <VarBadge
                      v={cmvPctRe != null && cmvPctBd != null ? cmvPctRe - cmvPctBd : null}
                      lowerIsBetter
                      isPct
                    />
                  }
                />
                <KpiCard
                  label="Pessoal % da Receita Líq."
                  value={pessPctRe != null ? fmtPct(pessPctRe) : "—"}
                  sub={pessPctBd != null ? `Meta: ${fmtPct(pessPctBd)}` : "Sem meta"}
                  trailing={
                    <VarBadge
                      v={pessPctRe != null && pessPctBd != null ? pessPctRe - pessPctBd : null}
                      lowerIsBetter
                      isPct
                    />
                  }
                />
              </section>

              {/* DRE Table with drill-down */}
              <SectionTitle>DRE Comparativa · {mesLabel(mes)}</SectionTitle>
              <DreDrillTable
                bd={bd as DreMensalRowClient | undefined}
                re={re as DreMensalRowClient | undefined}
                kpiForMes={kpiForMes}
                linhas={linhasRows}
                mes={mes}
              />

              {/* Charts */}
              <SectionTitle>Evolução Jan–{mesShort(reMonths.at(-1) ?? mes)} 2026</SectionTitle>
              <DreBarChart data={chartData} />
              <div style={{ height: 32 }} />
            </>
          )}

          {/* ── TAB: INDICADORES ────────────────────────────────────────── */}
          {aba === "indicadores" && <IndicadoresTab data={indicRows} linhas={linhasRows} />}

          {/* ── TAB: RECEITA ────────────────────────────────────────────── */}
          {aba === "receita" && <ReceitaTab data={receitaRows} />}

          {/* ── TAB: DESPESAS ───────────────────────────────────────────── */}
          {aba === "despesas" && (
            <DespesasTab
              data={despesaAgg}
              linhas={linhasRows}
              pessoal={pessoalRows}
              manutencao={manutencaoRows}
              prestadores={prestadoresRows}
              contratos={contratosRows}
            />
          )}

          {/* ── TAB: FOLHA ──────────────────────────────────────────────── */}
          {aba === "folha" && <FolhaTab data={folhaRows} linhas={linhasRows} />}

          {/* ── TAB: GORJETA ────────────────────────────────────────────── */}
          {aba === "gorjeta" && <GorjetaTab data={gorjetaRows} />}

          {/* ── TAB: HISTÓRICO ──────────────────────────────────────────── */}
          {aba === "historico" && <HistoricoTab data={historicoRows} />}

          {/* ── TAB: AUDITORIA ──────────────────────────────────────────── */}
          {aba === "auditoria" && (
            <AuditTab
              dreRows={dreRows as AuditTabProps["dreRows"]}
              linhas={linhasRows}
              despRows={auditDespRows}
              prestadores={auditPrestRows}
              contratosFixos={auditContratosRows}
              receitaDetalhada={auditReceitaRows}
            />
          )}
        </>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: "var(--text-3)",
        margin: "0 0 10px",
      }}
    >
      {children}
    </h2>
  )
}

function VarBadge({
  v,
  lowerIsBetter,
  isPct = false,
}: {
  v: number | null
  lowerIsBetter: boolean
  isPct?: boolean
}) {
  if (v === null) return null
  const good = lowerIsBetter ? v < 0 : v > 0
  const neutral = Math.abs(v) < 0.01
  const color = neutral ? "var(--text-3)" : good ? "#22C55E" : "#EF4444"
  const label = isPct
    ? `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}pp`
    : `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`

  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color,
        background: neutral ? "transparent" : good ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        padding: "2px 8px",
        borderRadius: 99,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  )
}

function DreThLeft({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: "8px 14px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        borderBottom: "1px solid var(--border)",
        textAlign: "left",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  )
}

function DreTh({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: "8px 12px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        borderBottom: "1px solid var(--border)",
        textAlign: "right",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  )
}

function DreTd({
  children,
  muted = false,
  bold = false,
}: {
  children: React.ReactNode
  muted?: boolean
  bold?: boolean
}) {
  return (
    <td
      style={{
        padding: "8px 12px",
        fontSize: 12,
        textAlign: "right",
        color: muted ? "var(--text-3)" : "var(--text)",
        fontWeight: bold ? 700 : 400,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  )
}
