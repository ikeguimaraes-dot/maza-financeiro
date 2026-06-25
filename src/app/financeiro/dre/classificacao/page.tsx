"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_FINANCEIRO_URL ?? "https://kph-os-financeiro.vercel.app";

const C = {
  receita: "#34d399", amber: "#fbbf24", alerta: "#f87171",
  text: "var(--text, #F5F0E8)", text2: "var(--text-2, #C8C2B8)", text3: "var(--text-3, #8A8278)",
  surface: "var(--surface, #1A1A18)", surface2: "var(--surface-2, #222220)", surface3: "var(--surface-3, #2C2C2A)",
  border: "var(--border, rgba(245,240,232,0.08))", brand: "var(--brand, #C4622D)",
};
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmt = (n: number) => BRL.format(Math.abs(n)); // v_titulo positivo = despesa positiva
const fmtMes = (s: string | null) => { if (!s) return "—"; const [y, m] = s.split("-"); return `${m}/${y}`; };
const fmtDia = (s: string | null) => { if (!s) return "—"; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const selectStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, fontSize: 13, background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", cursor: "pointer" };

type Conta = {
  descricao_c_gerencial: string;
  total: number;
  count: number;
  linha_dre: string | null;
  esperada_mensal: boolean;
  classificada: boolean;
};
type Titulo = {
  id: string; fornecedor: string; documento: string | null; descricao_c_gerencial: string;
  v_titulo: number; ref_mes: string | null; d_vencimento: string | null;
  override_linha: string | null; override_obs: string | null;
};

export default function ClassificacaoPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [linhas, setLinhas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "a_classificar" | "classificadas">("todas");
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Drill-down: contas expandidas + títulos carregados por conta
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [titulosPorConta, setTitulosPorConta] = useState<Record<string, Titulo[]>>({});
  const [loadingConta, setLoadingConta] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true); setErro(null);
    try {
      const r = await fetch(`${API_BASE}/api/dre/mapa`);
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? `HTTP ${r.status}`); return; }
      setContas(j.contas ?? []);
      setLinhas(j.linhas ?? []);
      setDirty(new Set());
    } catch (e) { setErro(String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function editar(desc: string, patch: Partial<Conta>) {
    setContas((prev) => prev.map((c) => c.descricao_c_gerencial === desc
      ? { ...c, ...patch, classificada: (patch.linha_dre !== undefined ? !!patch.linha_dre : c.classificada) }
      : c));
    setDirty((prev) => new Set(prev).add(desc));
    setMsg(null);
  }

  async function salvar() {
    const mapeamentos = contas
      .filter((c) => dirty.has(c.descricao_c_gerencial))
      .map((c) => ({ descricao_c_gerencial: c.descricao_c_gerencial, linha_dre: c.linha_dre, esperada_mensal: c.esperada_mensal }));
    if (!mapeamentos.length) { setMsg({ ok: false, text: "Nada alterado." }); return; }
    setSalvando(true); setMsg(null);
    try {
      const r = await fetch(`${API_BASE}/api/dre/mapa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mapeamentos }) });
      const j = await r.json();
      if (!r.ok) { setMsg({ ok: false, text: j.error ?? "Falha ao salvar" }); return; }
      setMsg({ ok: true, text: `${j.salvos} conta(s) salva(s).` });
      await load();
    } catch (e) { setMsg({ ok: false, text: String(e) }); }
    finally { setSalvando(false); }
  }

  async function toggleConta(desc: string) {
    setAbertas((prev) => { const n = new Set(prev); if (n.has(desc)) n.delete(desc); else n.add(desc); return n; });
    if (!titulosPorConta[desc]) {
      setLoadingConta((p) => new Set(p).add(desc));
      try {
        const r = await fetch(`${API_BASE}/api/dre/titulos?conta=${encodeURIComponent(desc)}`);
        const j = await r.json();
        setTitulosPorConta((p) => ({ ...p, [desc]: j.titulos ?? [] }));
      } catch { /* ignore */ }
      finally { setLoadingConta((p) => { const n = new Set(p); n.delete(desc); return n; }); }
    }
  }

  // Reclassificação pontual: linha vazia = remover override (volta ao mapa).
  async function reclassificar(desc: string, tituloId: string, linha: string) {
    setTitulosPorConta((p) => ({ ...p, [desc]: (p[desc] ?? []).map((t) => t.id === tituloId ? { ...t, override_linha: linha || null } : t) }));
    try {
      if (linha) {
        await fetch(`${API_BASE}/api/dre/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo_id: tituloId, linha_dre_corrigida: linha }) });
      } else {
        await fetch(`${API_BASE}/api/dre/override?titulo_id=${encodeURIComponent(tituloId)}`, { method: "DELETE" });
      }
    } catch { /* ignore — estado local já atualizado */ }
  }

  const aClassificar = useMemo(() => contas.filter((c) => !c.classificada).length, [contas]);
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return contas.filter((c) =>
      (filtro === "todas" || (filtro === "a_classificar" ? !c.classificada : c.classificada)) &&
      (!q || c.descricao_c_gerencial.toLowerCase().includes(q) || (c.linha_dre ?? "").toLowerCase().includes(q)),
    );
  }, [contas, busca, filtro]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <nav style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 13 }}>
        <Link href="/financeiro/dre" style={{ color: C.text3, textDecoration: "none" }}>DRE</Link>
        <span style={{ color: C.text3 }}>/</span>
        <span style={{ color: C.text, fontWeight: 600 }}>Classificação de contas</span>
      </nav>

      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text, letterSpacing: -0.6, margin: 0 }}>Classificação de contas</h1>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>De-para entre as contas gerenciais do Everest e as linhas da DRE. Regime de caixa.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {aClassificar > 0 && (
            <span style={{ fontSize: 13, fontWeight: 700, color: C.amber, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: "7px 12px" }}>
              {aClassificar} conta{aClassificar > 1 ? "s" : ""} a classificar
            </span>
          )}
          <button onClick={salvar} disabled={salvando || dirty.size === 0} style={{
            padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: dirty.size === 0 ? C.surface3 : C.brand, color: dirty.size === 0 ? C.text3 : "#fff",
            border: "none", cursor: dirty.size === 0 ? "not-allowed" : "pointer",
          }}>
            {salvando ? "Salvando…" : `Salvar${dirty.size ? ` (${dirty.size})` : ""}`}
          </button>
        </div>
      </header>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input type="text" placeholder="Buscar conta ou linha…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ ...selectStyle, cursor: "text", minWidth: 240, flex: "1 1 240px" }} />
        <div style={{ display: "flex", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 3 }}>
          {([["todas", "Todas"], ["a_classificar", "A classificar"], ["classificadas", "Classificadas"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: filtro === k ? C.surface3 : "transparent", color: filtro === k ? C.text : C.text3 }}>{l}</button>
          ))}
        </div>
      </div>

      {msg && (
        <div style={{ padding: "9px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, background: msg.ok ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)", color: msg.ok ? C.receita : C.alerta, border: `1px solid ${msg.ok ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}` }}>
          {msg.ok ? "✓ " : "✗ "}{msg.text}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: C.text3, fontSize: 14 }}>Carregando…</div>
      ) : erro ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: C.alerta, fontSize: 14 }}>Erro: {erro}</div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.surface2 }}>
                  {["Conta gerencial (Everest)", "Total", "Títulos", "Linha da DRE", "Todo mês"].map((h, i) => (
                    <th key={h} style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 600, color: C.text3, textAlign: i === 1 || i === 2 ? "right" : "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((c) => {
                  const alerta = !c.classificada;
                  const desc = c.descricao_c_gerencial;
                  const aberta = abertas.has(desc);
                  return (
                    <Fragment key={desc}>
                      <tr style={{ borderBottom: `1px solid ${C.border}`, background: alerta ? "rgba(251,191,36,0.06)" : "transparent" }}>
                        <td onClick={() => toggleConta(desc)} style={{ padding: "9px 14px", color: C.text, cursor: "pointer" }}>
                          <span style={{ display: "inline-block", width: 14, color: C.text3, transform: aberta ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</span>
                          <span style={{ fontWeight: 500 }}>{desc}</span>
                          {alerta && <span style={{ marginLeft: 10, fontSize: 10, fontWeight: 700, color: C.amber, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 5, padding: "1px 6px", letterSpacing: 0.5 }}>A CLASSIFICAR</span>}
                        </td>
                        <td style={{ padding: "9px 14px", textAlign: "right", color: C.text, fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(c.total)}</td>
                        <td style={{ padding: "9px 14px", textAlign: "right", color: C.text3 }}>{c.count}</td>
                        <td style={{ padding: "9px 14px" }}>
                          <select value={c.linha_dre ?? ""} onChange={(e) => editar(desc, { linha_dre: e.target.value || null })}
                            style={{ ...selectStyle, minWidth: 180, borderColor: alerta ? "rgba(251,191,36,0.5)" : "var(--border)" }}>
                            <option value="">— escolher —</option>
                            {linhas.map((l) => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "9px 14px" }}>
                          <input type="checkbox" checked={c.esperada_mensal} onChange={(e) => editar(desc, { esperada_mensal: e.target.checked })} />
                        </td>
                      </tr>
                      {aberta && (
                        <tr>
                          <td colSpan={5} style={{ padding: 0, background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
                            <div style={{ padding: "6px 14px 14px 34px" }}>
                              {loadingConta.has(desc) ? (
                                <div style={{ padding: "12px 0", color: C.text3, fontSize: 12 }}>Carregando títulos…</div>
                              ) : (titulosPorConta[desc] ?? []).length === 0 ? (
                                <div style={{ padding: "12px 0", color: C.text3, fontSize: 12 }}>Sem títulos nesta conta.</div>
                              ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                  <thead>
                                    <tr>
                                      {["Fornecedor", "Doc", "Competência", "Vencimento", "Valor", "Reclassificar p/ linha"].map((h, i) => (
                                        <th key={h} style={{ padding: "6px 10px", fontSize: 10.5, fontWeight: 600, color: C.text3, textAlign: i === 4 ? "right" : "left", whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(titulosPorConta[desc] ?? []).map((t) => (
                                      <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                                        <td style={{ padding: "6px 10px", color: C.text2, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.fornecedor}</td>
                                        <td style={{ padding: "6px 10px", color: C.text3 }}>{t.documento ?? "—"}</td>
                                        <td style={{ padding: "6px 10px", color: C.text3 }}>{fmtMes(t.ref_mes)}</td>
                                        <td style={{ padding: "6px 10px", color: C.text3 }}>{fmtDia(t.d_vencimento)}</td>
                                        <td style={{ padding: "6px 10px", textAlign: "right", color: C.text, fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(t.v_titulo)}</td>
                                        <td style={{ padding: "6px 10px" }}>
                                          <select value={t.override_linha ?? ""} onChange={(e) => reclassificar(desc, t.id, e.target.value)}
                                            style={{ ...selectStyle, padding: "5px 8px", fontSize: 12, minWidth: 170, borderColor: t.override_linha ? "rgba(52,211,153,0.5)" : "var(--border)", color: t.override_linha ? C.receita : "var(--text)" }}>
                                            <option value="">Conta (padrão{c.linha_dre ? `: ${c.linha_dre}` : ""})</option>
                                            {linhas.map((l) => <option key={l} value={l}>{l}</option>)}
                                          </select>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filtradas.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "30px 14px", textAlign: "center", color: C.text3 }}>Nenhuma conta nos filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
