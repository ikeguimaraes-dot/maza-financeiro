"use client"

// src/app/financeiro/dre/folha/page.tsx
// Repo: maza-financeiro

import { useEffect, useState, useMemo, useRef } from "react"
import { useUnit } from "@kph/auth/context"
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts"

// ── Tipos ──────────────────────────────────────────────────────────────────
interface Colaborador {
  id: number
  nome: string
  funcao: string
  divisao: string
  tipo: string
  admissao: string
  salario: number
  custo_total: number
  is_vaga: boolean
  total_proventos: number
  total_descontos: number
  valor_liquido: number
  base_inss: number
  base_fgts: number
  fgts_mes: number
  base_irrf: number
  gorjeta: number
  verbas: Array<{ codigo?: string; descricao: string; referencia?: string; provento?: number; desconto?: number }>
  documento_nome: string | null
  documento_pagina: number | null
  documento_path: string | null
}

interface DivisaoItem {
  divisao: string
  custo: number
  headcount: number
}

interface FuncaoItem {
  funcao: string
  custo: number
  headcount: number
}

interface GorjetaCargo {
  cargo: string
  pontos: number
  headcount: number
  valor_total: number
  valor_medio: number
}

interface GorjetaDistribuicao {
  id: string
  nome: string
  cargo: string
  percentual: number
  valor_bruto: number
  valor_liquido: number
  mes: number
  ano: number
  periodo: string
}

interface HistoricoItem {
  periodo: string
  total: number
}

interface FolhaData {
  resumo: {
    totalFolha: number
    totalSalario: number
    headcount: number
    custoPorPessoa: number
    vagasAbertas: number
  }
  colaboradores: Colaborador[]
  porDivisao: DivisaoItem[]
  topFuncoes: FuncaoItem[]
  gorjeta: {
    periodo: string | null
    totalBruto: number
    totalLiquido: number
    headcount: number
    distribuicao: GorjetaDistribuicao[]
    breakdownCargo: GorjetaCargo[]
    historico: HistoricoItem[]
    cargoPontos: { cargo: string; pontos: number }[]
  }
}

// ── Constantes ────────────────────────────────────────────────────────────
const API_BASE =
  "/financeiro"

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchJsonWithSessionRetry(url: string) {
  let lastStatus = 0
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store" })
    lastStatus = response.status
    const contentType = response.headers.get("content-type") ?? ""
    if (response.ok && contentType.includes("application/json")) return response.json()
    // Uma troca de zona pode restaurar o cookie alguns milissegundos depois da
    // primeira request. Não tente interpretar a tela HTML de login como JSON.
    if (attempt < 2 && (response.redirected || response.status === 307 || !contentType.includes("application/json"))) {
      await wait(350)
      continue
    }
    const text = await response.text()
    throw new Error(`API da folha respondeu HTTP ${response.status}: ${text.slice(0, 120)}`)
  }
  throw new Error(`API da folha indisponível (HTTP ${lastStatus})`)
}

// ── Helpers ───────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)

const fmtK = (v: number) => fmt(v)

const labelMes = (periodo: string) => {
  const [ano, mes] = periodo.split("-") as [string, string]
  return `${MESES[parseInt(mes) - 1] ?? ""}/${ano.slice(2)}`
}

const divisaoBadgeClass = (div: string) => {
  const d = div?.toUpperCase()
  if (d?.includes("COZINHA")) return "bg-amber-900/40 text-amber-400 border border-amber-800/50"
  if (d?.includes("SAL")) return "bg-green-900/40 text-green-400 border border-green-800/50"
  if (d?.includes("ADMIN")) return "bg-orange-900/40 text-orange-400 border border-orange-800/50"
  if (d?.includes("ROOF") || d?.includes("BAR")) return "bg-purple-900/40 text-purple-400 border border-purple-800/50"
  return "bg-gray-800 text-gray-400 border border-gray-700"
}

// ── Tooltip customizado ───────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {fmtK(p.value)}
        </p>
      ))}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────
export default function FolhaPage() {
  const now = new Date()
  const { unit } = useUnit()
  const unitId = unit?.id ?? null
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())
  const [data, setData] = useState<FolhaData | null>(null)
  const [colaboradorAberto, setColaboradorAberto] = useState<Colaborador | null>(null)
  const [documentoUrl, setDocumentoUrl] = useState<string | null>(null)
  const [documentoErro, setDocumentoErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [buscaColab, setBuscaColab] = useState("")
  const [sortColab, setSortColab] = useState<"nome" | "custo" | "divisao">("divisao")
  const [uploading, setUploading] = useState(false)
  const monthsRequestRef = useRef(0)
  const dataRequestRef = useRef(0)

  // Default inteligente: ao trocar de unidade, busca a competência mais recente
  // COM dados e ajusta os seletores — evita abrir num mês sem folha (ex.: mês
  // corrente ainda não importado) e renderizar vazio.
  useEffect(() => {
    if (!unitId) return
    const requestId = ++monthsRequestRef.current
    fetchJsonWithSessionRetry(`${API_BASE}/api/folha/meses-disponiveis?unit_id=${unitId}`)
      .then((d: { competencias?: string[] }) => {
        if (requestId !== monthsRequestRef.current) return
        const comps = d.competencias ?? []
        if (comps.length > 0) {
          const [a, m] = comps[0]!.split("-").map(Number)
          if (a && m) { setAno(a); setMes(m) }
        }
      })
      .catch(() => {})
  }, [unitId])

  useEffect(() => {
    if (!unitId) {
      setData(null)
      setLoading(false)
      setError("Nenhuma unidade ativa selecionada.")
      return
    }
    const requestId = ++dataRequestRef.current
    setLoading(true)
    setError(null)
    setData(null)
    fetchJsonWithSessionRetry(
      `${API_BASE}/api/folha/dados?unit_id=${unitId}&mes=${mes}&ano=${ano}`
    )
      .then((d) => {
        if (requestId !== dataRequestRef.current) return
        if (d.error) throw new Error(d.error)
        setData(d)
      })
      .catch((e: Error) => {
        if (requestId === dataRequestRef.current) setError(e.message)
      })
      .finally(() => {
        if (requestId === dataRequestRef.current) setLoading(false)
      })
  }, [unitId, mes, ano])

  // Colaboradores filtrados + ordenados
  const colabFiltrados = useMemo(() => {
    if (!data) return []
    let list = [...data.colaboradores]
    if (buscaColab) {
      const q = buscaColab.toLowerCase()
      list = list.filter(
        (c) =>
          c.nome.toLowerCase().includes(q) ||
          c.funcao.toLowerCase().includes(q) ||
          c.divisao?.toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      if (sortColab === "custo") return b.custo_total - a.custo_total
      if (sortColab === "divisao") return (a.divisao ?? "").localeCompare(b.divisao ?? "")
      return a.nome.localeCompare(b.nome)
    })
    return list
  }, [data, buscaColab, sortColab])

  const unitLabel = unit?.name ?? "unidade atual"

  useEffect(() => {
    setDocumentoUrl(null)
    setDocumentoErro(null)
    if (!colaboradorAberto?.documento_path) return
    fetchJsonWithSessionRetry(`${API_BASE}/api/folha/documento/${colaboradorAberto.id}`)
      .then((result: { url?: string; pagina?: number; error?: string }) => {
        if (!result.url) throw new Error(result.error ?? "PDF não encontrado")
        setDocumentoUrl(`${result.url}#page=${result.pagina ?? 1}`)
      })
      .catch((error: Error) => setDocumentoErro(error.message))
  }, [colaboradorAberto])

  // ── Upload de recibos em PDF ────────────────────────────────────────────
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    if (!unitId) {
      alert("Selecione uma unidade antes de importar.")
      e.target.value = ""
      return
    }
    setUploading(true)
    const formData = new FormData()
    files.forEach((file) => formData.append("files", file))
    formData.append("unit_id", unitId)
    formData.append("mes", String(mes))
    formData.append("ano", String(ano))
    try {
      const res = await fetch(`${API_BASE}/api/folha/import`, {
        method: "POST",
        body: formData,
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? "Erro no upload")
      // Recarrega dados após import
      const [resultYear, resultMonth] = String(result.competencia ?? `${ano}-${mes}`).split("-").map(Number)
      const reloadYear = resultYear || ano
      const reloadMonth = resultMonth || mes
      const reloadResponse = await fetch(
        `${API_BASE}/api/folha/dados?unit_id=${unitId}&mes=${reloadMonth}&ano=${reloadYear}`
      )
      const novo = await reloadResponse.json()
      if (!reloadResponse.ok || novo.error) throw new Error(novo.error ?? "Erro ao recarregar a folha")
      if (!Array.isArray(novo.colaboradores) || novo.colaboradores.length !== result.colaboradores) {
        throw new Error(`Foram gravados ${result.colaboradores} colaboradores, mas a página recebeu ${novo.colaboradores?.length ?? 0}.`)
      }
      setMes(reloadMonth)
      setAno(reloadYear)
      setData(novo)
      alert(`${result.importados} funcionário${result.importados === 1 ? "" : "s"} importado${result.importados === 1 ? "" : "s"} com sucesso.`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      alert(`Erro ao importar: ${msg}`)
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d0d0c] text-gray-200 p-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">DRE › Pessoal</p>
          <h1 className="text-lg font-medium text-gray-100">Folha de Pessoal</h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-700/50 bg-gray-800/60 text-gray-300">
            {unitLabel}
          </span>

          {/* Seletor de mês */}
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
          >
            {MESES.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>

          {/* Seletor de ano */}
          <select
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
          >
            {[2024, 2025, 2026].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {/* Importar planilha */}
          <label className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
            uploading
              ? "border-gray-700 text-gray-500 cursor-not-allowed"
              : "border-gray-600 text-gray-300 bg-gray-800/40 hover:bg-gray-800"
          }`}>
            Importar planilha
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={uploading}
              onChange={handleUpload}
            />
          </label>

          {/* Importar PDFs */}
          <label className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
            uploading
              ? "border-gray-700 text-gray-500 cursor-not-allowed"
              : "border-purple-700/60 text-purple-400 bg-purple-900/20 hover:bg-purple-900/40"
          }`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {uploading ? "Importando…" : "Importar PDFs"}
            <input
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={handleUpload}
            />
          </label>
        </div>
      </div>

      {/* ── Loading / Error ──────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-24 text-gray-500 text-sm">
          Carregando dados de {unitLabel}…
        </div>
      )}
      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 text-red-400 text-sm mb-6">
          Erro ao carregar: {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* ── Cards resumo ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-5 gap-3 mb-6">
            {[
              {
                label: "Total folha",
                value: fmtK(data.resumo.totalFolha),
                sub: `salários: ${fmtK(data.resumo.totalSalario)}`,
                highlight: false,
              },
              {
                label: "Headcount",
                value: data.resumo.headcount,
                sub: data.resumo.vagasAbertas > 0
                  ? `${data.resumo.vagasAbertas} vaga${data.resumo.vagasAbertas > 1 ? "s" : ""} aberta${data.resumo.vagasAbertas > 1 ? "s" : ""}`
                  : "sem vagas abertas",
                highlight: false,
              },
              {
                label: "Custo / pessoa",
                value: fmtK(data.resumo.custoPorPessoa),
                sub: "custo total ÷ headcount",
                highlight: false,
              },
              {
                label: "Gorjeta total",
                value: fmtK(data.gorjeta.totalBruto),
                sub: data.gorjeta.periodo ? `período ${data.gorjeta.periodo}` : "sem dados de gorjeta",
                highlight: true,
              },
              {
                label: "Gorjeta / pessoa",
                value: data.gorjeta.headcount > 0
                  ? fmtK(data.gorjeta.totalBruto / data.gorjeta.headcount)
                  : "—",
                sub: `${data.gorjeta.headcount} beneficiados`,
                highlight: false,
              },
            ].map((card) => (
              <div
                key={card.label}
                className={`rounded-xl p-4 border ${
                  card.highlight
                    ? "bg-purple-900/20 border-purple-800/40"
                    : "bg-gray-800/40 border-gray-700/40"
                }`}
              >
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
                  {card.label}
                </p>
                <p className={`text-xl font-medium ${card.highlight ? "text-purple-300" : "text-gray-100"}`}>
                  {card.value}
                </p>
                <p className="text-[10px] text-gray-600 mt-1">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* ── Gráficos ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Evolução gorjeta */}
            <div className="bg-gray-800/30 border border-gray-700/40 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-300 mb-4">Evolução da gorjeta — últimos 12 meses</p>
              {data.gorjeta.historico.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={data.gorjeta.historico.map(h => ({
                    periodo: labelMes(h.periodo),
                    gorjeta: Math.round(h.total),
                  }))}>
                    <defs>
                      <linearGradient id="gradGorjeta" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7f77dd" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#7f77dd" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a28" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: "#888" }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#888" }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="gorjeta" stroke="#7f77dd" strokeWidth={2} fill="url(#gradGorjeta)" name="Gorjeta" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-600 text-xs">
                  Sem histórico disponível
                </div>
              )}
            </div>

            {/* Custo por divisão */}
            <div className="bg-gray-800/30 border border-gray-700/40 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-300 mb-4">Custo por divisão</p>
              {data.porDivisao.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart
                    data={data.porDivisao.map(d => ({
                      divisao: d.divisao?.split(" ")[0] ?? "—",
                      custo: Math.round(d.custo),
                      headcount: d.headcount,
                    }))}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a28" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#888" }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="divisao" tick={{ fontSize: 10, fill: "#888" }} tickLine={false} axisLine={false} width={70} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="custo" fill="#534ab7" radius={[0, 3, 3, 0]} name="Custo" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-600 text-xs">
                  Sem dados
                </div>
              )}
            </div>
          </div>

          {/* ── Breakdown: Divisão + Top Funções ───────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Por divisão */}
            <div className="bg-gray-800/30 border border-gray-700/40 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-300 mb-4">Headcount & custo por divisão</p>
              <div className="space-y-3">
                {data.porDivisao.map((d) => {
                  const pct = data.resumo.totalFolha > 0
                    ? (d.custo / data.resumo.totalFolha) * 100
                    : 0
                  return (
                    <div key={d.divisao}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${divisaoBadgeClass(d.divisao)}`}>
                          {d.divisao}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-gray-500">{d.headcount} pess.</span>
                          <span className="text-xs font-medium text-gray-300">{fmtK(d.custo)}</span>
                          <span className="text-[10px] text-gray-500 w-8 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="h-1 bg-gray-700/50 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-purple-500/70"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Top funções */}
            <div className="bg-gray-800/30 border border-gray-700/40 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-300 mb-4">Top funções por custo</p>
              <div className="space-y-3">
                {data.topFuncoes.slice(0, 8).map((f) => {
                  const pct = data.resumo.totalFolha > 0
                    ? (f.custo / data.resumo.totalFolha) * 100
                    : 0
                  return (
                    <div key={f.funcao}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400 truncate max-w-[160px]">{f.funcao}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-gray-500">{f.headcount} pess.</span>
                          <span className="text-xs font-medium text-gray-300">{fmtK(f.custo)}</span>
                        </div>
                      </div>
                      <div className="h-1 bg-gray-700/50 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500/60"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Gorjeta ──────────────────────────────────────────────────── */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                Gorjeta
              </p>
              {data.gorjeta.periodo && (
                <span className="text-[10px] text-purple-400 bg-purple-900/20 border border-purple-800/30 px-2 py-0.5 rounded">
                  {data.gorjeta.periodo}
                </span>
              )}
            </div>

            {/* Cards gorjeta */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Total bruto distribuído", value: fmtK(data.gorjeta.totalBruto) },
                { label: "Total líquido (após INSS)", value: fmtK(data.gorjeta.totalLiquido) },
                { label: "Colaboradores beneficiados", value: data.gorjeta.headcount },
              ].map((c) => (
                <div key={c.label} className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">{c.label}</p>
                  <p className="text-lg font-medium text-gray-100">{c.value}</p>
                </div>
              ))}
            </div>

            {/* Tabela breakdown por cargo */}
            {data.gorjeta.breakdownCargo.length > 0 && (
              <div className="bg-gray-800/30 border border-gray-700/40 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-800/60 border-b border-gray-700/40">
                      {["Cargo", "Pontos", "Pessoas", "Total bruto", "Média / pessoa"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] text-gray-500 uppercase tracking-wider font-medium last:text-right">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.gorjeta.breakdownCargo.map((row, i) => (
                      <tr key={row.cargo} className={`border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors ${i % 2 === 0 ? "" : "bg-gray-800/10"}`}>
                        <td className="px-4 py-2.5 text-gray-300 font-medium">{row.cargo || "—"}</td>
                        <td className="px-4 py-2.5 text-gray-400">
                          {row.pontos > 0 ? (
                            <span className="bg-purple-900/30 text-purple-400 border border-purple-800/30 px-2 py-0.5 rounded text-[10px]">
                              {row.pontos} pts
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400">{row.headcount}</td>
                        <td className="px-4 py-2.5 text-gray-200 font-medium">{fmt(row.valor_total)}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-right">{fmt(row.valor_medio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.gorjeta.breakdownCargo.length === 0 && (
              <div className="bg-gray-800/20 border border-gray-700/30 rounded-xl p-6 text-center text-gray-600 text-sm">
                Sem dados de gorjeta para {MESES[mes - 1]}/{ano}
              </div>
            )}
          </div>

          {/* ── Tabela detalhada de colaboradores ─────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                Colaboradores ({colabFiltrados.length})
              </p>
              <div className="flex items-center gap-2">
                {/* Busca */}
                <input
                  type="text"
                  placeholder="Buscar nome, função…"
                  value={buscaColab}
                  onChange={(e) => setBuscaColab(e.target.value)}
                  className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-700/60 w-48"
                />
                {/* Ordenação */}
                <select
                  value={sortColab}
                  onChange={(e) => setSortColab(e.target.value as "nome" | "custo" | "divisao")}
                  className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
                >
                  <option value="divisao">Ordenar: Divisão</option>
                  <option value="custo">Ordenar: Custo ↓</option>
                  <option value="nome">Ordenar: Nome</option>
                </select>
              </div>
            </div>

            <div className="bg-gray-800/30 border border-gray-700/40 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-800/60 border-b border-gray-700/40">
                    {["Nome", "Função", "Divisão", "Tipo", "Admissão", "Salário", "Custo total", "% folha"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] text-gray-500 uppercase tracking-wider font-medium last:text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colabFiltrados.map((c, i) => {
                    const pct = data.resumo.totalFolha > 0
                      ? (c.custo_total / data.resumo.totalFolha) * 100
                      : 0
                    const admissao = c.admissao
                      ? new Date(c.admissao + "T00:00:00").toLocaleDateString("pt-BR")
                      : "—"
                    return (
                      <tr
                        key={c.id}
                        className={`border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors ${i % 2 === 0 ? "" : "bg-gray-800/10"}`}
                      >
                        <td className="px-4 py-2.5 text-gray-200 font-medium">
                          <button type="button" onClick={() => setColaboradorAberto(c)} className="text-left text-purple-300 hover:text-purple-200 hover:underline underline-offset-2">
                            {c.nome}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 max-w-[160px] truncate">
                          {c.funcao}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${divisaoBadgeClass(c.divisao)}`}>
                            {c.divisao ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{c.tipo}</td>
                        <td className="px-4 py-2.5 text-gray-500">{admissao}</td>
                        <td className="px-4 py-2.5 text-gray-300">{fmt(c.salario)}</td>
                        <td className="px-4 py-2.5 text-gray-100 font-medium">{fmt(c.custo_total)}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-right">{pct.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                  {colabFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-600">
                        Nenhum colaborador encontrado
                      </td>
                    </tr>
                  )}
                </tbody>
                {/* Totalizador */}
                {colabFiltrados.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-800/60 border-t border-gray-700/40">
                      <td colSpan={5} className="px-4 py-2.5 text-[10px] text-gray-500 uppercase tracking-wider">
                        Total ({colabFiltrados.length} colaboradores)
                      </td>
                      <td className="px-4 py-2.5 text-gray-300 font-medium text-xs">
                        {fmt(colabFiltrados.reduce((s, c) => s + (c.salario ?? 0), 0))}
                      </td>
                      <td className="px-4 py-2.5 text-gray-100 font-medium text-xs">
                        {fmt(colabFiltrados.reduce((s, c) => s + (c.custo_total ?? 0), 0))}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[10px] text-gray-500">
                        {data.resumo.totalFolha > 0
                          ? `${((colabFiltrados.reduce((s, c) => s + c.custo_total, 0) / data.resumo.totalFolha) * 100).toFixed(0)}%`
                          : "—"}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
      {colaboradorAberto && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-5" onMouseDown={() => setColaboradorAberto(null)}>
          <div className="w-full max-w-6xl h-[90vh] bg-[#151514] border border-gray-700 rounded-2xl overflow-hidden flex flex-col" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/60">
              <div>
                <h2 className="text-base font-semibold text-gray-100">{colaboradorAberto.nome}</h2>
                <p className="text-xs text-gray-500">{colaboradorAberto.funcao} · competência {ano}-{String(mes).padStart(2, "0")}</p>
              </div>
              <button type="button" onClick={() => setColaboradorAberto(null)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="grid grid-cols-[340px_1fr] min-h-0 flex-1">
              <aside className="overflow-y-auto p-5 border-r border-gray-700/60 space-y-5">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["Salário base", colaboradorAberto.salario], ["Proventos", colaboradorAberto.total_proventos],
                    ["Descontos", colaboradorAberto.total_descontos], ["Líquido", colaboradorAberto.valor_liquido],
                    ["Gorjeta", colaboradorAberto.gorjeta], ["Base INSS", colaboradorAberto.base_inss],
                    ["Base FGTS", colaboradorAberto.base_fgts], ["FGTS mês", colaboradorAberto.fgts_mes],
                    ["Base IRRF", colaboradorAberto.base_irrf],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg bg-gray-800/50 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
                      <p className={`mt-1 text-sm font-medium ${label === "Gorjeta" ? "text-purple-300" : "text-gray-100"}`}>{fmt(Number(value ?? 0))}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Verbas mapeadas</p>
                  {colaboradorAberto.verbas?.length ? colaboradorAberto.verbas.map((verba, index) => (
                    <div key={`${verba.codigo ?? verba.descricao}-${index}`} className="py-2 border-b border-gray-800 text-xs">
                      <p className="text-gray-300">{verba.codigo ? `${verba.codigo} · ` : ""}{verba.descricao}</p>
                      <p className="text-gray-500">{verba.provento ? `Provento ${fmt(verba.provento)}` : ""}{verba.desconto ? `Desconto ${fmt(verba.desconto)}` : ""}</p>
                    </div>
                  )) : <p className="text-xs text-gray-600">Sem rubricas detalhadas neste arquivo.</p>}
                </div>
              </aside>
              <section className="min-w-0 bg-[#0d0d0c] flex items-center justify-center">
                {documentoUrl ? <iframe title={`Folha de ${colaboradorAberto.nome}`} src={documentoUrl} className="w-full h-full border-0" />
                  : documentoErro ? <p className="text-sm text-amber-400 px-6 text-center">{documentoErro}. Reimporte o PDF desta competência para vinculá-lo.</p>
                  : colaboradorAberto.documento_path ? <p className="text-sm text-gray-500">Carregando PDF…</p>
                  : <p className="text-sm text-gray-500 px-6 text-center">Este registro veio de planilha ou de uma importação antiga. Reimporte os PDFs para anexar o documento.</p>}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
