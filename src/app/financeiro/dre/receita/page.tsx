"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
  BarChart as HBarChart,
} from "recharts";
import { useUnit } from "@kph/auth/context";

const API_BASE = process.env.NEXT_PUBLIC_FINANCEIRO_URL ?? "https://kph-os-financeiro.vercel.app";

// ── Types ───────────────────────────────────────────────────────────────────

type Workday = {
  id: string;
  data: string;
  turno: string | null;
  receita_bruta_real: number;  // SUM(lorean_pagamentos.valor_recebido)
  desconto: number | null;
  gorjeta: number | null;
  custo: number | null;
  cmv_pct: number | null;
  clientes: number | null;
  ticket_medio: number | null;
};

const TURNO_LABEL: Record<string, string> = {
  almoco: "Almoço",
  jantar: "Jantar",
  dia_inteiro: "Dia inteiro",
};

type Pagamento = { forma: string; valor_recebido: number | null };
type Desconto = { motivo: string; consumo: number | null };
type Ambiente = { ambiente: string; produto: number | null; clientes: number | null };
type Turno = { turno: string; produto: number | null; clientes: number | null };
type Grupo = { grupo: string; bruto: number | null; pct_bruto: number | null };

// ── Formatters ───────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number | null | undefined, digits = 1) =>
  v != null ? `${v.toFixed(digits)}%` : "—";
const DIAS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// ── Aggregation helpers ───────────────────────────────────────────────────────

function aggByKey<T>(rows: T[], keyFn: (r: T) => string, valFn: (r: T) => number): { key: string; total: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = keyFn(r);
    map.set(k, (map.get(k) ?? 0) + valFn(r));
  }
  return Array.from(map.entries())
    .map(([key, total]) => ({ key, total }))
    .sort((a, b) => b.total - a.total);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReceitaPage() {
  const { unit } = useUnit();
  const today = new Date();
  const [mes, setMes] = useState(today.getMonth() + 1);
  const [ano, setAno] = useState(today.getFullYear());
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(false);

  // Data
  const [workdays, setWorkdays] = useState<Workday[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [descontos, setDescontos] = useState<Desconto[]>([]);
  const [ambientes, setAmbientes] = useState<Ambiente[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [metaReceita, setMetaReceita] = useState<number | null>(null);

  // Import
  const movRef = useRef<HTMLInputElement>(null);
  const vendaRef = useRef<HTMLInputElement>(null);
  const caixasRef = useRef<HTMLInputElement>(null);
  const [movFile, setMovFile] = useState<File | null>(null);
  const [vendaFile, setVendaFile] = useState<File | null>(null);
  const [caixaFiles, setCaixaFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importProgress, setImportProgress] = useState<string>("");
  const [dbError, setDbError] = useState<string | null>(null);

  // ── Load data ──────────────────────────────────────────────────────────────

  async function loadData() {
    if (!unit) return;
    setLoading(true);

    const mm = String(mes).padStart(2, "0");
    const start  = `${ano}-${mm}-01`;
    const end    = new Date(ano, mes, 0).toISOString().split("T")[0]!;
    const mesAno = `${ano}-${mm}`;

    try {
      const params = new URLSearchParams({ unit_id: unit.id, start, end, mes_ano: mesAno });
      const res  = await fetch(`${API_BASE}/api/lorean/workdays?${params}`);
      const json = await res.json();

      if (!res.ok) {
        setDbError(json.error ?? `HTTP ${res.status}`);
        setLoading(false);
        return;
      }

      setWorkdays(json.workdays   ?? []);
      setPagamentos(json.pagamentos ?? []);
      setDescontos(json.descontos  ?? []);
      setAmbientes(json.ambientes  ?? []);
      setTurnos(json.turnos        ?? []);
      setGrupos(json.grupos        ?? []);
      setMetaReceita(json.meta     ?? null);
      setDbError(null);
    } catch (e) {
      setDbError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [unit?.id, mes, ano]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Import handler — one PDF per call ─────────────────────────────────────

  async function handleImport() {
    if (!unit) return;
    setImporting(true);
    setImportMsg(null);

    const steps: { tipo: string; arquivo: File; label: string }[] = [];
    if (movFile)   steps.push({ tipo: "movimento", arquivo: movFile,   label: "Movimento" });
    if (vendaFile) steps.push({ tipo: "venda",     arquivo: vendaFile, label: "Venda" });
    caixaFiles.forEach((f, i) =>
      steps.push({ tipo: "caixa", arquivo: f, label: `Caixa${caixaFiles.length > 1 ? ` ${i + 1}` : ""}` }),
    );

    const allErrors: string[] = [];
    let workdayId: string | null = null;

    try {
      for (let i = 0; i < steps.length; i++) {
        const { tipo, arquivo, label } = steps[i]!;
        setImportProgress(`${i + 1}/${steps.length} — Processando ${label}…`);

        const fd = new FormData();
        fd.append("tipo", tipo);
        fd.append("arquivo", arquivo);
        fd.append("unit_id", unit.id);
        if (workdayId) fd.append("workday_id", workdayId);

        let json: { success: boolean; workday_id?: string | null; errors?: string[] };
        try {
          const res = await fetch(`${API_BASE}/api/lorean/import`, { method: "POST", body: fd });
          json = await res.json();
        } catch (e) {
          allErrors.push(`${label}: falha na requisição — ${String(e)}`);
          continue;
        }

        if (json.errors?.length) allErrors.push(...json.errors);
        if (json.workday_id) workdayId = json.workday_id;
      }

      if (allErrors.length === 0) {
        setImportMsg({ ok: true, text: "Importado com sucesso!" });
        setMovFile(null); setVendaFile(null); setCaixaFiles([]);
        setShowImport(false);
        await loadData();
      } else {
        setImportMsg({ ok: false, text: allErrors.join(" | ") });
      }
    } catch (e) {
      setImportMsg({ ok: false, text: String(e) });
    } finally {
      setImporting(false);
      setImportProgress("");
    }
  }

  // ── Aggregations ───────────────────────────────────────────────────────────

  const totalBruto    = workdays.reduce((s, w) => s + w.receita_bruta_real,      0);
  const totalDesconto = workdays.reduce((s, w) => s + (w.desconto    ?? 0),      0);
  const totalGorjeta  = workdays.reduce((s, w) => s + (w.gorjeta     ?? 0),      0);
  const totalLiquida  = totalBruto - totalDesconto;
  const totalClientes = workdays.reduce((s, w) => s + (w.clientes    ?? 0),      0);
  const ticketMedio   = totalClientes > 0 ? totalBruto / totalClientes : null;
  const metaDiaria    = metaReceita && workdays.length > 0 ? metaReceita / workdays.length : null;
  const atingMeta     = metaReceita && metaReceita > 0 ? (totalBruto / metaReceita) * 100 : null;

  const pagAgg = aggByKey(pagamentos, (p) => p.forma, (p) => p.valor_recebido ?? 0);
  const descAgg = aggByKey(descontos, (d) => d.motivo, (d) => d.consumo ?? 0);
  const ambAgg = aggByKey(ambientes, (a) => a.ambiente, (a) => a.produto ?? 0);
  const turAgg = aggByKey(turnos, (t) => t.turno, (t) => t.produto ?? 0);

  const gruposAgg = (() => {
    const map = new Map<string, number>();
    for (const g of grupos) {
      map.set(g.grupo, (map.get(g.grupo) ?? 0) + (g.bruto ?? 0));
    }
    return Array.from(map.entries())
      .map(([grupo, bruto]) => ({ grupo, bruto, pct: totalBruto > 0 ? (bruto / totalBruto) * 100 : 0 }))
      .sort((a, b) => b.bruto - a.bruto)
      .slice(0, 10);
  })();

  // Chart data — ordered ascending for chart display
  const chartData = [...workdays]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((w) => ({
      dia: w.data.slice(8),
      bruto: w.receita_bruta_real,
      meta: metaDiaria ?? 0,
    }));

  // ── Render ─────────────────────────────────────────────────────────────────

  const mesLabel = `${MESES[mes - 1]} ${ano}`;
  const hasData = workdays.length > 0;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", letterSpacing: -0.6, margin: 0 }}>
            Receita
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            {unit?.name ?? "—"} · {mesLabel}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Seletor mês/ano */}
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            style={selectStyle}
          >
            {MESES.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            style={selectStyle}
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Botão importar */}
          <button
            onClick={() => { setShowImport((v) => !v); setImportMsg(null); }}
            style={{
              padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: showImport ? "var(--surface-3)" : "var(--brand)",
              color: showImport ? "var(--text)" : "#fff",
              border: "none", cursor: "pointer", transition: "all var(--t)",
            }}
          >
            {showImport ? "Fechar" : "Importar PDFs"}
          </button>
        </div>
      </header>

      {/* ── Painel de importação ────────────────────────────────────────────── */}
      {showImport && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
          padding: "20px 24px", marginBottom: 24,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>
            Importar relatórios Lorean
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <FileSlot
              label="Movimento (Workday)"
              accept=".pdf"
              inputRef={movRef}
              file={movFile}
              onChange={(f) => setMovFile(f)}
            />
            <FileSlot
              label="Venda"
              accept=".pdf"
              inputRef={vendaRef}
              file={vendaFile}
              onChange={(f) => setVendaFile(f)}
            />
            <MultiFileSlot
              label="Caixa(s)"
              accept=".pdf"
              inputRef={caixasRef}
              files={caixaFiles}
              onChange={(fs) => setCaixaFiles(fs)}
            />
          </div>

          {importProgress && (
            <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 12 }}>
              ⏳ {importProgress}
            </p>
          )}

          {importMsg && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13,
              background: importMsg.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
              color: importMsg.ok ? "#22C55E" : "#EF4444",
              border: `1px solid ${importMsg.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            }}>
              {importMsg.ok ? "✓ " : "✗ "}{importMsg.text}
            </div>
          )}

          <button
            disabled={importing || (!movFile && !vendaFile && caixaFiles.length === 0)}
            onClick={handleImport}
            style={{
              padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: importing ? "var(--surface-3)" : "var(--brand)",
              color: importing ? "var(--text-3)" : "#fff",
              border: "none", cursor: importing ? "not-allowed" : "pointer",
              opacity: (!movFile && !vendaFile && caixaFiles.length === 0) ? 0.4 : 1,
            }}
          >
            {importing ? "Processando…" : "Processar e importar"}
          </button>
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-3)", fontSize: 14 }}>
          Carregando dados…
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!loading && !hasData && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)", fontSize: 14 }}>
          {dbError ? (
            <>
              <span style={{ color: "#EF4444" }}>Erro ao buscar dados: {dbError}</span>
              <br />
              <span style={{ fontSize: 12 }}>unit_id: {unit?.id}</span>
            </>
          ) : (
            <>
              Sem dados de receita para {mesLabel}. Importe os PDFs do Lorean para começar.
              <br />
              <span style={{ fontSize: 11, marginTop: 4, display: "block" }}>
                unit_id: {unit?.id} · {unit?.name}
              </span>
            </>
          )}
        </div>
      )}

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      {!loading && hasData && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 28 }}>
            <KpiCard
              label="Receita Bruta"
              value={BRL.format(totalBruto)}
              sub={atingMeta != null ? `${atingMeta.toFixed(1)}% da meta` : undefined}
              alert={atingMeta != null && atingMeta < 90}
              ok={atingMeta != null && atingMeta >= 100}
            />
            <KpiCard
              label="Desconto"
              value={BRL.format(totalDesconto)}
              sub={totalBruto > 0 ? pct((totalDesconto / totalBruto) * 100) + " da bruta" : undefined}
              alert={totalBruto > 0 && (totalDesconto / totalBruto) > 0.08}
            />
            <KpiCard
              label="Gorjeta"
              value={BRL.format(totalGorjeta)}
              sub={totalBruto > 0 ? pct((totalGorjeta / totalBruto) * 100) + " cobrado" : undefined}
            />
            <KpiCard
              label="Receita Líquida"
              value={BRL.format(totalLiquida)}
            />
            <KpiCard
              label="Clientes"
              value={totalClientes.toLocaleString("pt-BR")}
            />
            <KpiCard
              label="Ticket Médio"
              value={ticketMedio != null ? BRL.format(ticketMedio) : "—"}
              sub={metaReceita && totalClientes > 0 ? `Meta: ${BRL.format(metaReceita / totalClientes)}` : undefined}
            />
          </div>

          {/* ── Tabela dia a dia ────────────────────────────────────────────── */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 28 }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Dia a dia</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)" }}>
                    {["Data", "Turno", "Dia", "Bruto", "Meta", "Ating.%", "Desconto", "Gorjeta", "Clientes", "Ticket", "CMV%"].map((h) => (
                      <th key={h} style={{
                        padding: "8px 12px", textAlign: h === "Data" || h === "Dia" ? "left" : "right",
                        fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
                        color: "var(--text-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workdays.map((w) => {
                    const dt = new Date(w.data + "T12:00:00");
                    const diaSemana = DIAS_PT[dt.getDay()];
                    const ating = metaDiaria && metaDiaria > 0 ? (w.receita_bruta_real / metaDiaria) * 100 : null;
                    return (
                      <tr key={w.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 12px", color: "var(--text-2)", fontWeight: 500 }}>
                          {w.data.split("-").reverse().join("/")}
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--text-3)", whiteSpace: "nowrap" }}>
                          {w.turno ? (TURNO_LABEL[w.turno] ?? w.turno) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--text-3)" }}>{diaSemana}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-2)" }}>
                          {BRL.format(w.receita_bruta_real)}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-3)" }}>
                          {metaDiaria ? BRL.format(metaDiaria) : "—"}
                        </td>
                        <td style={{
                          padding: "10px 12px", textAlign: "right", fontWeight: 600,
                          color: ating == null ? "var(--text-3)" : ating >= 100 ? "#22C55E" : "#EF4444",
                        }}>
                          {ating != null ? `${ating.toFixed(0)}%` : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-2)" }}>
                          {BRL.format(w.desconto ?? 0)}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-2)" }}>
                          {BRL.format(w.gorjeta ?? 0)}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-2)" }}>
                          {w.clientes ?? "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-2)" }}>
                          {w.ticket_medio != null ? BRL.format(w.ticket_medio) : "—"}
                        </td>
                        <td style={{
                          padding: "10px 12px", textAlign: "right",
                          color: w.cmv_pct != null && w.cmv_pct > 0.32 ? "#EF4444" : w.cmv_pct != null && w.cmv_pct > 0.28 ? "#F59E0B" : "var(--text-2)",
                        }}>
                          {w.cmv_pct != null ? pct(w.cmv_pct * 100) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "var(--surface-2)", fontWeight: 700 }}>
                    <td colSpan={3} style={{ padding: "10px 12px", color: "var(--text)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>TOTAL</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text)" }}>{BRL.format(totalBruto)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-3)" }}>
                      {metaReceita ? BRL.format(metaReceita) : "—"}
                    </td>
                    <td style={{
                      padding: "10px 12px", textAlign: "right",
                      color: atingMeta == null ? "var(--text-3)" : atingMeta >= 100 ? "#22C55E" : "#EF4444",
                    }}>
                      {atingMeta != null ? `${atingMeta.toFixed(0)}%` : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text)" }}>{BRL.format(totalDesconto)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text)" }}>{BRL.format(totalGorjeta)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text)" }}>{totalClientes}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text)" }}>
                      {ticketMedio != null ? BRL.format(ticketMedio) : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-3)" }}>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Gráfico receita vs meta ─────────────────────────────────────── */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px", marginBottom: 28 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>
              Receita diária vs meta
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barSize={22} margin={{ top: 4, right: 8, bottom: 0, left: 40 }}>
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(val) => [BRL.format(Number(val ?? 0)), ""]}
                  contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                {metaDiaria != null && (
                  <ReferenceLine y={metaDiaria} stroke="#F59E0B" strokeDasharray="4 3" strokeWidth={1.5} />
                )}
                <Bar dataKey="bruto" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={metaDiaria && d.bruto >= metaDiaria ? "#22C55E" : "#EF4444"} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Pagamentos + Descontos ─────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
            <ListCard title="Por forma de pagamento" rows={pagAgg} total={pagAgg.reduce((s, r) => s + r.total, 0)} />
            <ListCard title="Desconto por motivo" rows={descAgg} total={descAgg.reduce((s, r) => s + r.total, 0)} />
          </div>

          {/* ── Ambientes + Turnos ─────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
            <SplitCard title="Por ambiente" rows={ambAgg} />
            <SplitCard title="Por turno" rows={turAgg} />
          </div>

          {/* ── Top grupos ─────────────────────────────────────────────────── */}
          {gruposAgg.length > 0 && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px", marginBottom: 28 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>
                Top grupos de produto
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {gruposAgg.map((g) => (
                  <div key={g.grupo} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 12, color: "var(--text-2)", width: 140, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g.grupo}
                    </span>
                    <div style={{ flex: 1, height: 8, background: "var(--surface-3)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(g.pct, 100)}%`, height: "100%", background: "var(--brand)", borderRadius: 4, transition: "width 0.4s ease" }} />
                    </div>
                    <span style={{ fontSize: 12, color: "var(--text-3)", width: 44, textAlign: "right", flexShrink: 0 }}>
                      {pct(g.pct, 0)}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-2)", width: 90, textAlign: "right", flexShrink: 0 }}>
                      {BRL.format(g.bruto)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, alert, ok }: { label: string; value: string; sub?: string; alert?: boolean; ok?: boolean }) {
  const color = alert ? "#EF4444" : ok ? "#22C55E" : "var(--text)";
  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${alert ? "rgba(239,68,68,0.3)" : ok ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
      borderRadius: 8, padding: "16px 18px",
    }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-3)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, letterSpacing: -0.4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ListCard({ title, rows, total }: { title: string; rows: { key: string; total: number }[]; total: number }) {
  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 12px" }}>{title}</p>
      {rows.length === 0
        ? <p style={{ fontSize: 12, color: "var(--text-3)" }}>Sem dados</p>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((r) => (
              <div key={r.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.key}</span>
                <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>
                  {total > 0 ? `${((r.total / total) * 100).toFixed(1)}%` : "—"}
                </span>
                <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 600, flexShrink: 0, width: 90, textAlign: "right" }}>
                  {BRL.format(r.total)}
                </span>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

function SplitCard({ title, rows }: { title: string; rows: { key: string; total: number }[] }) {
  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 12px" }}>{title}</p>
      {rows.length === 0
        ? <p style={{ fontSize: 12, color: "var(--text-3)" }}>Sem dados</p>
        : <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(rows.length, 2)}, 1fr)`, gap: 10 }}>
            {rows.map((r) => (
              <div key={r.key} style={{ background: "var(--surface-2)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--text-3)", marginBottom: 4 }}>{r.key}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{BRL.format(r.total)}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                  {total > 0 ? `${((r.total / total) * 100).toFixed(1)}%` : "—"}
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

function FileSlot({
  label, accept, inputRef, file, onChange,
}: {
  label: string; accept: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {label}
      </div>
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1px dashed ${file ? "var(--brand)" : "var(--border)"}`,
          borderRadius: 8, padding: "14px 12px", cursor: "pointer",
          background: file ? "var(--brand-soft)" : "var(--surface-2)",
          textAlign: "center", fontSize: 12, color: file ? "var(--brand)" : "var(--text-3)",
          transition: "all var(--t)",
        }}
      >
        {file ? `✓ ${file.name}` : "Clique para selecionar PDF"}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function MultiFileSlot({
  label, accept, inputRef, files, onChange,
}: {
  label: string; accept: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  files: File[];
  onChange: (fs: File[]) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {label}
      </div>
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1px dashed ${files.length ? "var(--brand)" : "var(--border)"}`,
          borderRadius: 8, padding: "14px 12px", cursor: "pointer",
          background: files.length ? "var(--brand-soft)" : "var(--surface-2)",
          textAlign: "center", fontSize: 12, color: files.length ? "var(--brand)" : "var(--text-3)",
          transition: "all var(--t)",
        }}
      >
        {files.length ? `✓ ${files.length} arquivo(s)` : "Clique para selecionar PDFs"}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        style={{ display: "none" }}
        onChange={(e) => onChange(Array.from(e.target.files ?? []))}
      />
    </div>
  );
}

// ── Shared style ──────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 8, fontSize: 13, fontWeight: 500,
  background: "var(--surface-2)", border: "1px solid var(--border)",
  color: "var(--text)", cursor: "pointer",
};
