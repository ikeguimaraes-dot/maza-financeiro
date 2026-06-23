"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PieChart, Pie, Cell,
  BarChart, Bar,
  XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useUnit } from "@kph/auth/context";

const API_BASE = process.env.NEXT_PUBLIC_FINANCEIRO_URL ?? "https://kph-os-financeiro.vercel.app";

// ── Color tokens ─────────────────────────────────────────────────────────────
const C = {
  receita:  "#34d399",
  meta:     "#fbbf24",
  alerta:   "#f87171",
  a:        "#34d399",
  b:        "#fbbf24",
  c:        "#f87171",
  text:     "var(--text, #F5F0E8)",
  text2:    "var(--text-2, #C8C2B8)",
  text3:    "var(--text-3, #8A8278)",
  surface:  "var(--surface, #1A1A18)",
  surface2: "var(--surface-2, #222220)",
  surface3: "var(--surface-3, #2C2C2A)",
  border:   "var(--border, rgba(245,240,232,0.08))",
  brand:    "var(--brand, #C4622D)",
} as const;

const PIE_COLORS = ["#34d399", "#818cf8", "#fbbf24", "#f87171", "#22d3ee", "#f472b6", "#a3e635", "#fb923c", "#c084fc", "#2dd4bf"];

// ── Types ────────────────────────────────────────────────────────────────────
type Periodo = {
  id: string;
  unit_id: string;
  data_inicio: string;
  data_fim: string;
  label: string;
  importado_em: string;
};
type Produto = {
  id: string;
  periodo_id: string;
  grupo: string | null;
  produto: string;
  quantidade: number | null;
  valor_bruto: number | null;
  valor_desconto: number | null;
  valor_liquido: number | null;
  participacao_pct: number | null;
};
type Curva = "A" | "B" | "C";

// ── Formatters ───────────────────────────────────────────────────────────────
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmt = (n: number) => BRL.format(n);
const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const pct = (v: number | null | undefined, d = 1) => (v != null ? `${v.toFixed(d)}%` : "—");
const fmtData = (s: string) => {
  const [y, m, d] = s.split("-");
  return d && m && y ? `${d}/${m}/${y}` : s;
};

const selectStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500,
  background: "var(--surface-2)", color: "var(--text)",
  border: "1px solid var(--border)", cursor: "pointer",
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AnaliseVendasPage() {
  const { unit } = useUnit();

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [periodoSel, setPeriodoSel] = useState<string | null>(null);
  const [periodoAtual, setPeriodoAtual] = useState<Periodo | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [movFile, setMovFile] = useState<File | null>(null);
  const [vendaFile, setVendaFile] = useState<File | null>(null);
  const [caixaFile, setCaixaFile] = useState<File | null>(null);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [label, setLabel] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const movRef = useRef<HTMLInputElement>(null);
  const vendaRef = useRef<HTMLInputElement>(null);
  const caixaRef = useRef<HTMLInputElement>(null);

  async function loadData(periodoId?: string | null) {
    if (!unit) return;
    setLoading(true);
    setDbError(null);
    try {
      const params = new URLSearchParams({ unit_id: unit.id });
      if (periodoId) params.set("periodo_id", periodoId);
      const res = await fetch(`${API_BASE}/api/vendas-consolidado/dados?${params}`);
      const json = await res.json();
      if (!res.ok) { setDbError(json.error ?? `HTTP ${res.status}`); setLoading(false); return; }
      setPeriodos(json.periodos ?? []);
      setPeriodoAtual(json.periodo ?? null);
      setPeriodoSel(json.periodo?.id ?? null);
      setProdutos(json.produtos ?? []);
    } catch (e) {
      setDbError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [unit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSelectPeriodo(id: string) {
    setPeriodoSel(id);
    loadData(id);
  }

  async function handleImport() {
    if (!unit) return;
    if (!vendaFile) { setImportMsg({ ok: false, text: "O PDF de Venda é obrigatório." }); return; }
    if (!dataInicio || !dataFim) { setImportMsg({ ok: false, text: "Informe data de início e fim." }); return; }
    setImporting(true); setImportMsg(null);
    try {
      const fd = new FormData();
      fd.append("unit_id", unit.id);
      fd.append("data_inicio", dataInicio);
      fd.append("data_fim", dataFim);
      if (label.trim()) fd.append("label", label.trim());
      fd.append("venda", vendaFile);
      if (movFile) fd.append("movimento", movFile);
      if (caixaFile) fd.append("caixa", caixaFile);
      const res = await fetch(`${API_BASE}/api/vendas-consolidado/import`, { method: "POST", body: fd });
      const json = await res.json();
      if (json.success) {
        setImportMsg({ ok: true, text: `Importado: ${json.produtos} produtos.` });
        setMovFile(null); setVendaFile(null); setCaixaFile(null);
        setDataInicio(""); setDataFim(""); setLabel("");
        setShowImport(false);
        await loadData(json.periodo_id);
      } else {
        setImportMsg({ ok: false, text: (json.errors ?? []).join(" | ") || "Falha na importação" });
      }
    } catch (e) {
      setImportMsg({ ok: false, text: String(e) });
    } finally {
      setImporting(false);
    }
  }

  // ── Derivados ────────────────────────────────────────────────────────────────
  const totalLiquido = useMemo(() => produtos.reduce((s, p) => s + (p.valor_liquido ?? 0), 0), [produtos]);
  const totalQtd     = useMemo(() => produtos.reduce((s, p) => s + (p.quantidade ?? 0), 0), [produtos]);

  // Curva ABC: ordena por valor desc, acumula % e classifica.
  const produtosABC = useMemo(() => {
    const ord = [...produtos].sort((a, b) => (b.valor_liquido ?? 0) - (a.valor_liquido ?? 0));
    let acc = 0;
    return ord.map((p) => {
      const part = totalLiquido > 0 ? ((p.valor_liquido ?? 0) / totalLiquido) * 100 : 0;
      acc += part;
      const curva: Curva = acc <= 80 ? "A" : acc <= 95 ? "B" : "C";
      return { ...p, _part: part, _acc: acc, _curva: curva };
    });
  }, [produtos, totalLiquido]);

  const resumoABC = useMemo(() => {
    const base = { A: { n: 0, valor: 0 }, B: { n: 0, valor: 0 }, C: { n: 0, valor: 0 } };
    for (const p of produtosABC) { base[p._curva].n += 1; base[p._curva].valor += p.valor_liquido ?? 0; }
    return base;
  }, [produtosABC]);

  // Filtro client-side (busca por produto/grupo)
  const produtosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return produtosABC;
    return produtosABC.filter(
      (p) => p.produto.toLowerCase().includes(q) || (p.grupo ?? "").toLowerCase().includes(q),
    );
  }, [produtosABC, busca]);

  // Participação por grupo
  const porGrupo = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of produtos) {
      const g = p.grupo ?? "—";
      map.set(g, (map.get(g) ?? 0) + (p.valor_liquido ?? 0));
    }
    return Array.from(map.entries())
      .map(([grupo, valor]) => ({ grupo, valor, pct: totalLiquido > 0 ? (valor / totalLiquido) * 100 : 0 }))
      .sort((a, b) => b.valor - a.valor);
  }, [produtos, totalLiquido]);

  const topPorValor = useMemo(
    () => [...produtos].sort((a, b) => (b.valor_liquido ?? 0) - (a.valor_liquido ?? 0)).slice(0, 10),
    [produtos],
  );
  const topPorQtd = useMemo(
    () => [...produtos].sort((a, b) => (b.quantidade ?? 0) - (a.quantidade ?? 0)).slice(0, 10),
    [produtos],
  );

  const hasData = produtos.length > 0;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text, letterSpacing: -0.6, margin: 0 }}>Análise de Vendas</h1>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>
            {unit?.name ?? "—"} · relatório consolidado por período
            {periodoAtual ? ` · ${periodoAtual.label}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {periodos.length > 0 && (
            <select value={periodoSel ?? ""} onChange={(e) => onSelectPeriodo(e.target.value)} style={selectStyle}>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({fmtData(p.data_inicio)}–{fmtData(p.data_fim)})
                </option>
              ))}
            </select>
          )}
          <button onClick={() => { setShowImport((v) => !v); setImportMsg(null); }} style={{
            padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: showImport ? C.surface3 : C.brand, color: showImport ? C.text : "#fff",
            border: "none", cursor: "pointer",
          }}>
            {showImport ? "Fechar" : "Importar relatório do período"}
          </button>
        </div>
      </header>

      {/* Breadcrumb / sub-nav dentro de Receita */}
      <nav style={{ display: "flex", gap: 16, marginBottom: 24, fontSize: 13 }}>
        <Link href="/financeiro/dre/receita" style={{ color: C.text3, textDecoration: "none" }}>Receita</Link>
        <span style={{ color: C.text3 }}>/</span>
        <span style={{ color: C.text, fontWeight: 600 }}>Análise de Vendas</span>
      </nav>

      {/* Import panel */}
      {showImport && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: "0 0 16px" }}>
            Importar relatório consolidado (período longo)
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Data início</label>
              <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={selectStyle} />
            </div>
            <div>
              <label style={labelStyle}>Data fim</label>
              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} style={selectStyle} />
            </div>
            <div>
              <label style={labelStyle}>Rótulo (opcional)</label>
              <input type="text" placeholder="Ex: Jan-Jun 2026" value={label} onChange={(e) => setLabel(e.target.value)}
                style={{ ...selectStyle, cursor: "text", width: "100%" }} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <FileSlot label="Movimento (opcional)" inputRef={movRef}   file={movFile}   onChange={setMovFile} />
            <FileSlot label="Venda (obrigatório)"  inputRef={vendaRef} file={vendaFile} onChange={setVendaFile} />
            <FileSlot label="Caixa (opcional)"     inputRef={caixaRef} file={caixaFile} onChange={setCaixaFile} />
          </div>
          {importMsg && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13,
              background: importMsg.ok ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
              color: importMsg.ok ? C.receita : C.alerta,
              border: `1px solid ${importMsg.ok ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
            }}>
              {importMsg.ok ? "✓ " : "✗ "}{importMsg.text}
            </div>
          )}
          <button disabled={importing || !vendaFile || !dataInicio || !dataFim} onClick={handleImport} style={{
            padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: importing ? C.surface3 : C.brand, color: importing ? C.text3 : "#fff",
            border: "none", cursor: importing ? "not-allowed" : "pointer",
            opacity: (!vendaFile || !dataInicio || !dataFim) ? 0.4 : 1,
          }}>
            {importing ? "Processando…" : "Processar e importar"}
          </button>
        </div>
      )}

      {loading && <div style={{ textAlign: "center", padding: "40px 0", color: C.text3, fontSize: 14 }}>Carregando…</div>}

      {!loading && !hasData && (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.text3, fontSize: 14 }}>
          {dbError ? <span style={{ color: C.alerta }}>Erro: {dbError}</span>
            : <>Sem dados consolidados. Importe o relatório de um período.</>}
        </div>
      )}

      {!loading && hasData && (
        <>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 28 }}>
            <Kpi label="Valor Líquido"    value={fmt(totalLiquido)} />
            <Kpi label="Quantidade"       value={fmtInt(totalQtd)} />
            <Kpi label="Produtos"         value={fmtInt(produtos.length)} />
            <Kpi label="Grupos"           value={fmtInt(porGrupo.length)} />
            <Kpi label="Itens Curva A"    value={`${resumoABC.A.n}`} sub={`${pct(totalLiquido > 0 ? resumoABC.A.valor / totalLiquido * 100 : 0)} do valor`} />
          </div>

          {/* Curva ABC + Participação por grupo */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
            <CurvaABCCard resumo={resumoABC} total={totalLiquido} />
            <GrupoPieCard rows={porGrupo} total={totalLiquido} />
          </div>

          {/* Top produtos */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
            <TopBarCard title="Top 10 por Valor" rows={topPorValor.map((p) => ({ nome: p.produto, valor: p.valor_liquido ?? 0 }))} fmtVal={fmt} color={C.receita} />
            <TopBarCard title="Top 10 por Quantidade" rows={topPorQtd.map((p) => ({ nome: p.produto, valor: p.quantidade ?? 0 }))} fmtVal={fmtInt} color="#818cf8" />
          </div>

          {/* Tabela de produtos */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                Produtos · {produtosFiltrados.length}{busca ? ` de ${produtos.length}` : ""}
              </span>
              <input
                type="text" placeholder="Buscar produto ou grupo…" value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{ ...selectStyle, cursor: "text", minWidth: 220 }}
              />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.surface2 }}>
                    {["ABC", "Grupo", "Produto", "Qtd", "Bruto", "Desconto", "Líquido", "Part.%", "Acum.%"].map((h, i) => (
                      <th key={h} style={{
                        padding: "9px 12px", borderBottom: `1px solid ${C.border}`,
                        fontSize: 11, fontWeight: 600, color: C.text3,
                        textAlign: i <= 2 ? "left" : "right", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {produtosFiltrados.map((p) => (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "8px 12px" }}><CurvaBadge curva={p._curva} /></td>
                      <td style={{ padding: "8px 12px", color: C.text3 }}>{p.grupo ?? "—"}</td>
                      <td style={{ padding: "8px 12px", color: C.text, fontWeight: 500 }}>{p.produto}</td>
                      <td style={tdNum}>{fmtInt(p.quantidade ?? 0)}</td>
                      <td style={tdNum}>{fmt(p.valor_bruto ?? 0)}</td>
                      <td style={{ ...tdNum, color: C.alerta }}>{fmt(p.valor_desconto ?? 0)}</td>
                      <td style={{ ...tdNum, color: C.text, fontWeight: 600 }}>{fmt(p.valor_liquido ?? 0)}</td>
                      <td style={tdNum}>{pct(p._part)}</td>
                      <td style={{ ...tdNum, color: C.text3 }}>{pct(p._acc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: C.text3, marginBottom: 6 };
const tdNum: React.CSSProperties = { padding: "8px 12px", textAlign: "right", color: C.text2, whiteSpace: "nowrap" };

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.text3, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function CurvaBadge({ curva }: { curva: Curva }) {
  const col = curva === "A" ? C.a : curva === "B" ? C.b : C.c;
  return (
    <span style={{
      display: "inline-block", minWidth: 18, textAlign: "center",
      padding: "1px 7px", borderRadius: 6, fontSize: 11, fontWeight: 700,
      color: col, background: `${col}1f`, border: `1px solid ${col}55`,
    }}>{curva}</span>
  );
}

function CurvaABCCard({ resumo, total }: { resumo: Record<Curva, { n: number; valor: number }>; total: number }) {
  const rows: { curva: Curva; faixa: string; n: number; valor: number }[] = [
    { curva: "A", faixa: "até 80%",   n: resumo.A.n, valor: resumo.A.valor },
    { curva: "B", faixa: "80–95%",    n: resumo.B.n, valor: resumo.B.valor },
    { curva: "C", faixa: "95–100%",   n: resumo.C.n, valor: resumo.C.valor },
  ];
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px" }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: "0 0 14px" }}>Curva ABC</p>
      {rows.map((r) => {
        const col = r.curva === "A" ? C.a : r.curva === "B" ? C.b : C.c;
        const part = total > 0 ? (r.valor / total) * 100 : 0;
        return (
          <div key={r.curva} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: C.text2 }}>
                <CurvaBadge curva={r.curva} /> <span style={{ marginLeft: 6, color: C.text3 }}>{r.faixa} · {r.n} itens</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{fmt(r.valor)} · {pct(part)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: C.surface3, overflow: "hidden" }}>
              <div style={{ width: `${part}%`, height: "100%", background: col }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GrupoPieCard({ rows, total }: { rows: { grupo: string; valor: number; pct: number }[]; total: number }) {
  const data = rows.slice(0, 8);
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px" }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: "0 0 12px" }}>Participação por grupo</p>
      {!data.length ? <p style={{ fontSize: 12, color: C.text3 }}>Sem dados</p> : (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flexShrink: 0, width: 140, height: 140 }}>
            <PieChart width={140} height={140}>
              <Pie data={data} dataKey="valor" cx="50%" cy="50%" innerRadius={42} outerRadius={64} paddingAngle={2} strokeWidth={0}>
                {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#1A1A18", border: "1px solid rgba(245,240,232,0.12)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: any) => fmt(Number(v))}
              />
            </PieChart>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {data.map((r, i) => (
              <div key={r.grupo} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: C.text2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.grupo}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{pct(r.pct)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TopBarCard({ title, rows, fmtVal, color }: {
  title: string; rows: { nome: string; valor: number }[]; fmtVal: (n: number) => string; color: string;
}) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px" }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: "0 0 12px" }}>{title}</p>
      {!rows.length ? <p style={{ fontSize: 12, color: C.text3 }}>Sem dados</p> : (
        <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 26)}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barSize={14}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{ background: "#1A1A18", border: "1px solid rgba(245,240,232,0.12)", borderRadius: 8, fontSize: 12 }}
              formatter={(v: any) => fmtVal(Number(v))}
            />
            <Bar dataKey="valor" radius={[0, 4, 4, 0]} fill={color} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function FileSlot({ label, inputRef, file, onChange }: {
  label: string; inputRef: React.RefObject<HTMLInputElement | null>; file: File | null; onChange: (f: File | null) => void;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input ref={inputRef} type="file" accept=".pdf" style={{ display: "none" }}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      <button onClick={() => inputRef.current?.click()} style={{
        width: "100%", padding: "16px 12px", borderRadius: 8, fontSize: 12,
        background: file ? "rgba(52,211,153,0.08)" : C.surface2,
        color: file ? C.receita : C.text3,
        border: `1px dashed ${file ? "rgba(52,211,153,0.4)" : C.border}`,
        cursor: "pointer", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {file ? `✓ ${file.name}` : "Selecionar PDF"}
      </button>
    </div>
  );
}
