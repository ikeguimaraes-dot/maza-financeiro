"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const API_BASE = process.env.NEXT_PUBLIC_FINANCEIRO_URL ?? "https://kph-os-financeiro.vercel.app";

// ── Tokens ──────────────────────────────────────────────────────────────────
const GOLD = "#C9A86A";
const C = {
  gold:    GOLD,
  ativo:   GOLD,
  ambar:   "#fbbf24",
  vermelho:"#f87171",
  roxo:    "#a78bfa",
  azul:    "#818cf8",
  text:    "var(--text, #F5F0E8)",
  text2:   "var(--text-2, #C8C2B8)",
  text3:   "var(--text-3, #8A8278)",
  surface: "var(--surface, #1A1A18)",
  surface2:"var(--surface-2, #222220)",
  surface3:"var(--surface-3, #2C2C2A)",
  border:  "var(--border, rgba(245,240,232,0.08))",
} as const;
const serif: React.CSSProperties = { fontFamily: "Fraunces, Georgia, 'Times New Roman', serif" };

// ── Domínio ─────────────────────────────────────────────────────────────────
const UNITS = [
  { key: "674eac8c-5a38-4a42-aa60-0a666387909b", label: "Meet & Eat", short: "Meet & Eat" },
  { key: "f9c6c7fc-2ecc-4f79-98ce-c3118b670182", label: "Madonna",    short: "Madonna" },
  { key: "kph",                                   label: "KPH Holding", short: "KPH Holding" },
] as const;
function unitLabel(unit_id: string | null) {
  if (!unit_id) return "KPH Holding";
  return UNITS.find((u) => u.key === unit_id)?.label ?? "—";
}

const CATEGORIAS: [string, string][] = [
  ["locacao", "Locação"], ["seguro", "Seguro"], ["software", "Software"], ["servico", "Serviço"],
  ["consultoria", "Consultoria"], ["fornecimento", "Fornecimento"], ["manutencao", "Manutenção"],
  ["marketing", "Marketing"], ["sociedade", "Sociedade"], ["financiamento", "Financiamento"],
  ["licenca", "Licença"], ["outro", "Outro"],
];
const catLabel = (k: string | null) => CATEGORIAS.find((c) => c[0] === k)?.[1] ?? (k ?? "—");
const RECORRENCIAS: [string, string][] = [["mensal", "Mensal"], ["anual", "Anual"], ["trimestral", "Trimestral"], ["unico", "Único"], ["consignacao", "Consignação"], ["nenhuma", "Nenhuma"]];
const INDICES: [string, string][] = [["nenhum", "Nenhum"], ["IGP-M", "IGP-M"], ["IPCA", "IPCA"], ["INPC", "INPC"], ["fixo", "Fixo"]];
const STATUS_MANUAL: [string, string][] = [["", "Automático (por data)"], ["em_negociacao", "Em negociação"], ["encerrado", "Encerrado"], ["rascunho", "Rascunho"]];
const TIPOS_ARQ: [string, string][] = [["principal", "Principal"], ["aditivo", "Aditivo"], ["anexo", "Anexo"]];

// ── Tipos ───────────────────────────────────────────────────────────────────
type Contrato = {
  id: string; unit_id: string | null; titulo: string; categoria: string;
  contraparte: string; contraparte_doc: string | null; responsavel: string | null;
  valor: number | null; recorrencia: string | null; data_inicio: string | null;
  data_fim: string | null; vigencia_indeterminada: boolean | null;
  renovacao_automatica: boolean | null; aviso_previo_dias: number | null;
  indice_reajuste: string | null; data_proximo_reajuste: string | null;
  multa_rescisoria: string | null; status_manual: string | null;
  tags: string[] | null; observacoes: string | null;
  arquivos_count?: number;
};
type Arquivo = { id: string; tipo: string; nome: string; storage_path: string; tamanho_bytes: number | null; content_type: string | null; uploaded_at: string };

// ── Formatters / datas ──────────────────────────────────────────────────────
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmt = (n: number | null | undefined) => BRL.format(n ?? 0);
const fmtData = (s: string | null) => { if (!s) return "—"; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const parseDate = (s: string) => new Date(`${s}T12:00:00`);
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
const fmtBytes = (b: number | null) => (b == null ? "" : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

type Status = { key: string; label: string; color: string };
function statusOf(c: Contrato, hoje: Date): Status {
  if (c.status_manual) {
    if (c.status_manual === "em_negociacao") return { key: "em_negociacao", label: "Em negociação", color: C.azul };
    if (c.status_manual === "encerrado") return { key: "encerrado", label: "Encerrado", color: C.text3 };
    if (c.status_manual === "rascunho") return { key: "rascunho", label: "Rascunho", color: C.roxo };
  }
  if (c.vigencia_indeterminada || !c.data_fim) return { key: "indeterminado", label: "Indeterminado", color: C.gold };
  const dias = daysBetween(hoje, parseDate(c.data_fim));
  if (dias < 0) return { key: "vencido", label: "Vencido", color: C.vermelho };
  if (dias <= 60) return { key: "vencendo", label: "Vencendo", color: C.ambar };
  const aviso = c.aviso_previo_dias ?? 0;
  if (aviso > 0 && dias <= aviso) return { key: "aviso", label: "Aviso prévio", color: C.ambar };
  return { key: "ativo", label: "Ativo", color: C.gold };
}
// Data em que a ação deve começar: fim - aviso (ou o próprio fim).
function urgencyDate(c: Contrato): Date | null {
  if (!c.data_fim || c.vigencia_indeterminada) return null;
  const fim = parseDate(c.data_fim);
  const aviso = c.aviso_previo_dias ?? 0;
  if (aviso > 0) { const d = new Date(fim); d.setDate(d.getDate() - aviso); return d; }
  return fim;
}

// ── Supabase browser client (upload direto via signed URL) ──────────────────
let _sb: ReturnType<typeof createClient> | null = null;
function sb() {
  if (_sb) return _sb;
  _sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
  return _sb;
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function ContratosPage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [unitFiltro, setUnitFiltro] = useState<"todas" | string>("todas");
  const [busca, setBusca] = useState("");
  const [catFiltro, setCatFiltro] = useState<string>("todas");
  const [vista, setVista] = useState<"lista" | "timeline">("lista");

  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);

  const hoje = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  async function load() {
    setLoading(true); setErro(null);
    try {
      const r = await fetch(`${API_BASE}/api/contratos`);
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? `HTTP ${r.status}`); return; }
      setContratos(j.contratos ?? []);
    } catch (e) { setErro(String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // Filtro por unidade
  const porUnidade = useMemo(() => {
    if (unitFiltro === "todas") return contratos;
    const alvo = unitFiltro === "kph" ? null : unitFiltro;
    return contratos.filter((c) => c.unit_id === alvo);
  }, [contratos, unitFiltro]);

  // Cards de resumo
  const cards = useMemo(() => {
    let ativos = 0, mensal = 0, vencendo90 = 0;
    for (const c of porUnidade) {
      const s = statusOf(c, hoje);
      const vigente = !["vencido", "encerrado", "rascunho"].includes(s.key);
      if (vigente) ativos += 1;
      if (vigente && c.recorrencia === "mensal") mensal += c.valor ?? 0;
      if (c.data_fim && !c.vigencia_indeterminada && s.key !== "encerrado") {
        const dias = daysBetween(hoje, parseDate(c.data_fim));
        if (dias >= 0 && dias <= 90) vencendo90 += 1;
      }
    }
    return { ativos, mensal, vencendo90 };
  }, [porUnidade, hoje]);

  // Ação necessária — ordenado por quando a ação começa (urgência)
  const acaoNecessaria = useMemo(() => {
    return porUnidade
      .map((c) => ({ c, s: statusOf(c, hoje), u: urgencyDate(c) }))
      .filter((x) => ["vencido", "vencendo", "aviso"].includes(x.s.key))
      .sort((a, b) => (a.u?.getTime() ?? Infinity) - (b.u?.getTime() ?? Infinity));
  }, [porUnidade, hoje]);

  // Lista filtrada (busca + categoria), client-side
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const arr = porUnidade.filter((c) =>
      (catFiltro === "todas" || c.categoria === catFiltro) &&
      (!q || c.titulo.toLowerCase().includes(q) || c.contraparte.toLowerCase().includes(q) ||
        (c.responsavel ?? "").toLowerCase().includes(q) || (c.tags ?? []).some((t) => t.toLowerCase().includes(q))),
    );
    return arr.sort((a, b) => (urgencyDate(a)?.getTime() ?? Infinity) - (urgencyDate(b)?.getTime() ?? Infinity));
  }, [porUnidade, busca, catFiltro]);

  const categoriasPresentes = useMemo(() => {
    const s = new Set(porUnidade.map((c) => c.categoria));
    return CATEGORIAS.filter((c) => s.has(c[0]));
  }, [porUnidade]);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", paddingBottom: 60 }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <h1 style={{ ...serif, fontSize: 32, fontWeight: 600, color: C.text, letterSpacing: -0.5, margin: 0 }}>Contratos</h1>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>Gestão e arquivo de contratos do grupo KPH · vencimentos e aviso prévio</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Segmented
            value={unitFiltro}
            onChange={setUnitFiltro}
            options={[{ key: "todas", label: "Todas" }, ...UNITS.map((u) => ({ key: u.key, label: u.short }))]}
          />
          <button onClick={() => setNovoAberto(true)} style={btnPrimary}>+ Novo contrato</button>
        </div>
      </header>

      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Card label="Contratos ativos" value={String(cards.ativos)} />
        <Card label="Compromisso mensal recorrente" value={fmt(cards.mensal)} accent />
        <Card label="Vencendo em 90 dias" value={String(cards.vencendo90)} amber={cards.vencendo90 > 0} />
        <Card label="Ação necessária" value={String(acaoNecessaria.length)} amber={acaoNecessaria.length > 0} />
      </div>

      {/* Ação necessária */}
      <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px", marginBottom: 24 }}>
        <p style={{ ...serif, fontSize: 16, fontWeight: 600, color: C.text, margin: "0 0 12px" }}>Ação necessária</p>
        {acaoNecessaria.length === 0 ? (
          <p style={{ fontSize: 13, color: C.text3 }}>Nada urgente. Nenhum contrato vencido, vencendo ou em janela de aviso prévio.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {acaoNecessaria.slice(0, 8).map(({ c, s, u }) => {
              const dias = u ? daysBetween(hoje, u) : null;
              const txt = s.key === "vencido" ? "vencido" : s.key === "aviso" ? "aviso prévio aberto" : "vencendo";
              return (
                <button key={c.id} onClick={() => setDetalheId(c.id)} style={acaoRow}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.titulo}</span>
                  <span style={{ fontSize: 11, color: C.text3, whiteSpace: "nowrap" }}>{catLabel(c.categoria)} · {unitLabel(c.unit_id)}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: s.color, whiteSpace: "nowrap" }}>
                    {dias != null && dias < 0 ? `${txt} há ${Math.abs(dias)}d` : dias != null ? `${txt} em ${dias}d` : txt}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <input type="text" placeholder="Buscar contrato, contraparte, responsável…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ ...input, minWidth: 280, flex: "1 1 280px" }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Chip active={catFiltro === "todas"} onClick={() => setCatFiltro("todas")}>Todas</Chip>
          {categoriasPresentes.map(([k, l]) => (
            <Chip key={k} active={catFiltro === k} onClick={() => setCatFiltro(k)}>{l}</Chip>
          ))}
        </div>
        <Segmented value={vista} onChange={(v) => setVista(v as "lista" | "timeline")} options={[{ key: "lista", label: "Lista" }, { key: "timeline", label: "Linha do tempo" }]} />
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: C.text3, fontSize: 14 }}>Carregando…</div>
      ) : erro ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: C.vermelho, fontSize: 14 }}>Erro: {erro}</div>
      ) : lista.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.text3, fontSize: 14 }}>
          Nenhum contrato {contratos.length ? "nos filtros." : "ainda. Clique em “Novo contrato” para começar."}
        </div>
      ) : vista === "lista" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lista.map((c) => <LinhaContrato key={c.id} c={c} hoje={hoje} onClick={() => setDetalheId(c.id)} />)}
        </div>
      ) : (
        <Timeline lista={lista} hoje={hoje} onClick={setDetalheId} />
      )}

      {detalheId && (
        <DrawerDetalhe id={detalheId} hoje={hoje} onClose={() => setDetalheId(null)} onChanged={load} />
      )}
      {novoAberto && (
        <ModalNovo onClose={() => setNovoAberto(false)} onCreated={() => { setNovoAberto(false); load(); }} />
      )}
    </div>
  );
}

// ── Linha de contrato (com barra de vigência) ───────────────────────────────
function LinhaContrato({ c, hoje, onClick }: { c: Contrato; hoje: Date; onClick: () => void }) {
  const s = statusOf(c, hoje);
  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left", background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "block",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, flex: 1, minWidth: 0 }}>{c.titulo}</span>
        <StatusBadge s={s} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 4, fontSize: 12, color: C.text3 }}>
        <span>{c.contraparte}</span>
        <span>· {catLabel(c.categoria)}</span>
        <span>· {unitLabel(c.unit_id)}</span>
        {c.valor ? <span>· {fmt(c.valor)}{c.recorrencia && c.recorrencia !== "nenhuma" ? `/${c.recorrencia}` : ""}</span> : null}
        {c.arquivos_count ? <span>· 📎 {c.arquivos_count}</span> : null}
      </div>
      <div style={{ marginTop: 10 }}><VigenciaBar c={c} hoje={hoje} color={s.color} /></div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: C.text3 }}>
        <span>{c.data_inicio ? `Início ${fmtData(c.data_inicio)}` : ""}</span>
        <span>{c.vigencia_indeterminada || !c.data_fim ? "Vigência indeterminada" : `Fim ${fmtData(c.data_fim)}`}</span>
      </div>
    </button>
  );
}

// Barra de vigência — fração decorrida + marcador de hoje + faixa de aviso prévio
function VigenciaBar({ c, hoje, color }: { c: Contrato; hoje: Date; color: string }) {
  if (c.vigencia_indeterminada || !c.data_fim || !c.data_inicio) {
    return <div style={{ height: 6, borderRadius: 4, background: `linear-gradient(90deg, ${color}55, ${color}22)` }} />;
  }
  const ini = parseDate(c.data_inicio).getTime();
  const fim = parseDate(c.data_fim).getTime();
  const total = Math.max(1, fim - ini);
  const frac = Math.min(1, Math.max(0, (hoje.getTime() - ini) / total));
  const aviso = c.aviso_previo_dias ?? 0;
  const avisoStart = aviso > 0 ? Math.min(1, Math.max(0, ((fim - aviso * 86400000) - ini) / total)) : 1;
  return (
    <div style={{ position: "relative", height: 6, borderRadius: 4, background: C.surface3, overflow: "hidden" }}>
      {aviso > 0 && (
        <div style={{ position: "absolute", left: `${avisoStart * 100}%`, right: 0, top: 0, bottom: 0, background: "rgba(251,191,36,0.22)" }} />
      )}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${frac * 100}%`, background: color, opacity: 0.85 }} />
      <div style={{ position: "absolute", left: `calc(${frac * 100}% - 1px)`, top: -2, bottom: -2, width: 2, background: C.text }} />
    </div>
  );
}

function Timeline({ lista, hoje, onClick }: { lista: Contrato[]; hoje: Date; onClick: (id: string) => void }) {
  const comFim = lista.filter((c) => c.data_fim && !c.vigencia_indeterminada).sort((a, b) => parseDate(a.data_fim!).getTime() - parseDate(b.data_fim!).getTime());
  const semFim = lista.filter((c) => !c.data_fim || c.vigencia_indeterminada);
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "8px 8px 8px 0" }}>
      {comFim.map((c) => {
        const s = statusOf(c, hoje);
        return (
          <button key={c.id} onClick={() => onClick(c.id)} style={{ ...timelineRow }}>
            <span style={{ width: 86, textAlign: "right", fontSize: 11, color: C.text3, flexShrink: 0 }}>{fmtData(c.data_fim)}</span>
            <span style={{ position: "relative", width: 18, flexShrink: 0, alignSelf: "stretch" }}>
              <span style={{ position: "absolute", left: 8, top: 0, bottom: 0, width: 2, background: C.border }} />
              <span style={{ position: "absolute", left: 4, top: "50%", width: 10, height: 10, marginTop: -5, borderRadius: 99, background: s.color, border: `2px solid ${C.surface}` }} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.titulo}</span>
            <span style={{ fontSize: 11, color: C.text3 }}>{catLabel(c.categoria)}</span>
            <StatusBadge s={s} />
          </button>
        );
      })}
      {semFim.length > 0 && (
        <div style={{ padding: "10px 18px", fontSize: 11, color: C.text3 }}>
          + {semFim.length} com vigência indeterminada
        </div>
      )}
    </div>
  );
}

// ── Drawer de detalhe ───────────────────────────────────────────────────────
function DrawerDetalhe({ id, hoje, onClose, onChanged }: { id: string; hoje: Date; onClose: () => void; onChanged: () => void }) {
  const [c, setC] = useState<Contrato | null>(null);
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [apagando, setApagando] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/contratos/${id}`);
      const j = await r.json();
      setC(j.contrato ?? null);
      setArquivos(j.contrato?.contratos_arquivos ?? []);
    } finally { setLoading(false); }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [id]);

  async function baixar(arqId: string) {
    const r = await fetch(`${API_BASE}/api/contratos/arquivos/${arqId}/download`);
    const j = await r.json();
    if (j.url) window.open(j.url, "_blank");
  }
  async function apagar() {
    if (!confirm("Apagar este contrato e todos os arquivos?")) return;
    setApagando(true);
    await fetch(`${API_BASE}/api/contratos/${id}`, { method: "DELETE" });
    setApagando(false);
    onChanged(); onClose();
  }

  const s = c ? statusOf(c, hoje) : null;
  const avisoAberto = c && s && s.key === "aviso";

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={drawer}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: C.text3, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>Contrato</span>
          <button onClick={onClose} style={iconBtn}>✕</button>
        </div>
        {loading || !c ? (
          <p style={{ color: C.text3, fontSize: 13 }}>Carregando…</p>
        ) : (
          <>
            <h2 style={{ ...serif, fontSize: 22, fontWeight: 600, color: C.text, margin: "0 0 6px" }}>{c.titulo}</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
              {s && <StatusBadge s={s} />}
              <span style={{ fontSize: 12, color: C.text3 }}>{catLabel(c.categoria)} · {unitLabel(c.unit_id)}</span>
            </div>

            {avisoAberto && (
              <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", color: C.ambar, borderRadius: 10, padding: "10px 14px", fontSize: 12, marginBottom: 16 }}>
                ⚠ Janela de aviso prévio aberta — {c.aviso_previo_dias} dias antes do fim ({fmtData(c.data_fim)}). Decida sobre renovar ou encerrar.
              </div>
            )}

            <div style={{ marginBottom: 16 }}><VigenciaBar c={c} hoje={hoje} color={s?.color ?? C.gold} /></div>

            <Campos c={c} />

            {c.observacoes && (
              <div style={{ marginTop: 14 }}>
                <p style={lblCampo}>Observações</p>
                <p style={{ fontSize: 13, color: C.text2, whiteSpace: "pre-wrap", margin: 0 }}>{c.observacoes}</p>
              </div>
            )}
            {c.tags?.length ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
                {c.tags.map((t) => <span key={t} style={tagPill}>{t}</span>)}
              </div>
            ) : null}

            {/* Documentos */}
            <p style={{ ...serif, fontSize: 15, fontWeight: 600, color: C.text, margin: "22px 0 10px" }}>Documentos</p>
            {arquivos.length === 0 ? (
              <p style={{ fontSize: 12, color: C.text3 }}>Nenhum arquivo anexado.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {arquivos.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
                    <span style={{ fontSize: 16 }}>📄</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</div>
                      <div style={{ fontSize: 11, color: C.text3 }}>{TIPOS_ARQ.find((t) => t[0] === a.tipo)?.[1] ?? a.tipo}{a.tamanho_bytes ? ` · ${fmtBytes(a.tamanho_bytes)}` : ""}</div>
                    </div>
                    <button onClick={() => baixar(a.id)} style={btnSmall}>Baixar</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 28 }}>
              <button onClick={apagar} disabled={apagando} style={{ ...btnDanger, opacity: apagando ? 0.5 : 1 }}>
                {apagando ? "Apagando…" : "Apagar contrato"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Campos({ c }: { c: Contrato }) {
  const itens: [string, string][] = [
    ["Contraparte", c.contraparte],
    ["CNPJ / CPF", c.contraparte_doc ?? "—"],
    ["Responsável", c.responsavel ?? "—"],
    ["Valor", c.valor ? `${fmt(c.valor)}${c.recorrencia && c.recorrencia !== "nenhuma" ? ` / ${c.recorrencia}` : ""}` : "—"],
    ["Início", fmtData(c.data_inicio)],
    ["Fim", c.vigencia_indeterminada || !c.data_fim ? "Indeterminado" : fmtData(c.data_fim)],
    ["Renovação automática", c.renovacao_automatica ? "Sim" : "Não"],
    ["Aviso prévio", c.aviso_previo_dias ? `${c.aviso_previo_dias} dias` : "—"],
    ["Índice de reajuste", c.indice_reajuste ?? "—"],
    ["Próximo reajuste", fmtData(c.data_proximo_reajuste)],
    ["Multa rescisória", c.multa_rescisoria ?? "—"],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
      {itens.map(([k, v]) => (
        <div key={k}>
          <p style={lblCampo}>{k}</p>
          <p style={{ fontSize: 13, color: C.text, margin: 0 }}>{v}</p>
        </div>
      ))}
    </div>
  );
}

// ── Modal: novo contrato ────────────────────────────────────────────────────
type Form = {
  titulo: string; contraparte: string; contraparte_doc: string; unitKey: string; categoria: string;
  responsavel: string; valor: string; recorrencia: string; data_inicio: string; data_fim: string;
  vigencia_indeterminada: boolean; renovacao_automatica: boolean; aviso_previo_dias: string;
  indice_reajuste: string; data_proximo_reajuste: string; multa_rescisoria: string;
  observacoes: string; tags: string; status_manual: string;
};
const FORM0: Form = {
  titulo: "", contraparte: "", contraparte_doc: "", unitKey: "674eac8c-5a38-4a42-aa60-0a666387909b", categoria: "locacao",
  responsavel: "", valor: "", recorrencia: "mensal", data_inicio: "", data_fim: "",
  vigencia_indeterminada: false, renovacao_automatica: false, aviso_previo_dias: "",
  indice_reajuste: "nenhum", data_proximo_reajuste: "", multa_rescisoria: "",
  observacoes: "", tags: "", status_manual: "",
};

function ModalNovo({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState<Form>(FORM0);
  const [files, setFiles] = useState<{ file: File; tipo: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof Form, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  function addFiles(list: FileList | null) {
    if (!list) return;
    const novos = Array.from(list).filter((x) => x.type === "application/pdf" || x.name.toLowerCase().endsWith(".pdf"))
      .map((file) => ({ file, tipo: files.length === 0 ? "principal" : "aditivo" }));
    setFiles((p) => [...p, ...novos]);
  }

  async function salvar() {
    if (!f.titulo.trim() || !f.contraparte.trim()) { setMsg("Título e contraparte são obrigatórios."); return; }
    setSalvando(true); setMsg(null);
    try {
      // 1) cria o contrato (metadados)
      const payload = {
        unit_id: f.unitKey === "kph" ? null : f.unitKey,
        titulo: f.titulo.trim(), categoria: f.categoria, contraparte: f.contraparte.trim(),
        contraparte_doc: f.contraparte_doc || null, responsavel: f.responsavel || null,
        valor: f.valor ? Number(f.valor) : 0, recorrencia: f.recorrencia,
        data_inicio: f.data_inicio || null,
        data_fim: f.vigencia_indeterminada ? null : (f.data_fim || null),
        vigencia_indeterminada: f.vigencia_indeterminada,
        renovacao_automatica: f.renovacao_automatica,
        aviso_previo_dias: f.aviso_previo_dias ? Number(f.aviso_previo_dias) : 0,
        indice_reajuste: f.indice_reajuste, data_proximo_reajuste: f.data_proximo_reajuste || null,
        multa_rescisoria: f.multa_rescisoria || null, status_manual: f.status_manual || null,
        observacoes: f.observacoes || null,
        tags: f.tags ? f.tags.split(",").map((t) => t.trim()).filter(Boolean) : null,
      };
      const rc = await fetch(`${API_BASE}/api/contratos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const jc = await rc.json();
      if (!rc.ok || !jc.id) throw new Error(jc.error ?? "Falha ao criar contrato");
      const id = jc.id as string;

      // 2) upload de cada PDF direto ao Storage via signed URL
      for (let i = 0; i < files.length; i++) {
        const { file, tipo } = files[i]!;
        setMsg(`Enviando ${i + 1}/${files.length}: ${file.name}…`);
        const ru = await fetch(`${API_BASE}/api/contratos/${id}/arquivos/upload-url`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: file.name }),
        });
        const ju = await ru.json();
        if (!ru.ok || !ju.path) throw new Error(ju.error ?? "Falha ao gerar URL de upload");
        const up = await sb().storage.from("contratos").uploadToSignedUrl(ju.path, ju.token, file, { contentType: file.type || "application/pdf" });
        if (up.error) throw new Error(`Upload ${file.name}: ${up.error.message}`);
        // 3) registra metadados
        const rm = await fetch(`${API_BASE}/api/contratos/${id}/arquivos`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo, nome: file.name, storage_path: ju.path, tamanho_bytes: file.size, content_type: file.type || "application/pdf" }),
        });
        if (!rm.ok) { const jm = await rm.json(); throw new Error(jm.error ?? "Falha ao registrar arquivo"); }
      }
      onCreated();
    } catch (e) {
      setMsg(String(e instanceof Error ? e.message : e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...drawer, width: "min(620px, 96vw)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ ...serif, fontSize: 22, fontWeight: 600, color: C.text, margin: 0 }}>Novo contrato</h2>
          <button onClick={onClose} style={iconBtn}>✕</button>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragOver ? C.gold : C.border}`, borderRadius: 12, padding: "22px 16px",
            textAlign: "center", cursor: "pointer", marginBottom: 14,
            background: dragOver ? "rgba(201,168,106,0.06)" : C.surface2,
          }}
        >
          <input ref={inputRef} type="file" accept="application/pdf" multiple style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />
          <div style={{ fontSize: 13, color: C.text2 }}>Arraste PDFs aqui ou clique para selecionar</div>
          <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>Principal + aditivos/anexos. Upload direto ao Storage (suporta arquivos &gt; 5 MB).</div>
        </div>
        {files.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {files.map((x, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.text2 }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {x.file.name} · {fmtBytes(x.file.size)}</span>
                <select value={x.tipo} onChange={(e) => setFiles((p) => p.map((y, j) => j === i ? { ...y, tipo: e.target.value } : y))} style={{ ...input, padding: "4px 8px", fontSize: 11 }}>
                  {TIPOS_ARQ.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} style={iconBtn}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Formulário */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FieldFull><Lbl>Título</Lbl><input style={input} value={f.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex: Locação Salão Principal" /></FieldFull>
          <div><Lbl>Contraparte</Lbl><input style={input} value={f.contraparte} onChange={(e) => set("contraparte", e.target.value)} /></div>
          <div><Lbl>CNPJ / CPF</Lbl><input style={input} value={f.contraparte_doc} onChange={(e) => set("contraparte_doc", e.target.value)} /></div>
          <div><Lbl>Unidade</Lbl><select style={input} value={f.unitKey} onChange={(e) => set("unitKey", e.target.value)}>{UNITS.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}</select></div>
          <div><Lbl>Categoria</Lbl><select style={input} value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>{CATEGORIAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><Lbl>Responsável</Lbl><input style={input} value={f.responsavel} onChange={(e) => set("responsavel", e.target.value)} /></div>
          <div><Lbl>Status</Lbl><select style={input} value={f.status_manual} onChange={(e) => set("status_manual", e.target.value)}>{STATUS_MANUAL.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><Lbl>Valor (R$)</Lbl><input style={input} type="number" value={f.valor} onChange={(e) => set("valor", e.target.value)} /></div>
          <div><Lbl>Recorrência</Lbl><select style={input} value={f.recorrencia} onChange={(e) => set("recorrencia", e.target.value)}>{RECORRENCIAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><Lbl>Início</Lbl><input style={input} type="date" value={f.data_inicio} onChange={(e) => set("data_inicio", e.target.value)} /></div>
          <div><Lbl>Fim</Lbl><input style={{ ...input, opacity: f.vigencia_indeterminada ? 0.4 : 1 }} type="date" disabled={f.vigencia_indeterminada} value={f.data_fim} onChange={(e) => set("data_fim", e.target.value)} /></div>
          <label style={check}><input type="checkbox" checked={f.vigencia_indeterminada} onChange={(e) => set("vigencia_indeterminada", e.target.checked)} /> Vigência indeterminada</label>
          <label style={check}><input type="checkbox" checked={f.renovacao_automatica} onChange={(e) => set("renovacao_automatica", e.target.checked)} /> Renovação automática</label>
          <div><Lbl>Aviso prévio (dias)</Lbl><input style={input} type="number" value={f.aviso_previo_dias} onChange={(e) => set("aviso_previo_dias", e.target.value)} /></div>
          <div><Lbl>Índice de reajuste</Lbl><select style={input} value={f.indice_reajuste} onChange={(e) => set("indice_reajuste", e.target.value)}>{INDICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><Lbl>Próximo reajuste</Lbl><input style={input} type="date" value={f.data_proximo_reajuste} onChange={(e) => set("data_proximo_reajuste", e.target.value)} /></div>
          <FieldFull><Lbl>Multa rescisória</Lbl><input style={input} value={f.multa_rescisoria} onChange={(e) => set("multa_rescisoria", e.target.value)} placeholder="Ex: 3 aluguéis" /></FieldFull>
          <FieldFull><Lbl>Tags (separadas por vírgula)</Lbl><input style={input} value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="aluguel, matriz" /></FieldFull>
          <FieldFull><Lbl>Observações</Lbl><textarea style={{ ...input, minHeight: 64, resize: "vertical" }} value={f.observacoes} onChange={(e) => set("observacoes", e.target.value)} /></FieldFull>
        </div>

        {msg && <div style={{ marginTop: 14, fontSize: 12, color: msg.toLowerCase().includes("envia") ? C.text3 : C.vermelho }}>{msg}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={btnSmall}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{ ...btnPrimary, opacity: salvando ? 0.6 : 1 }}>{salvando ? "Salvando…" : "Salvar contrato"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Pequenos componentes / estilos ──────────────────────────────────────────
function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { key: T; label: string }[] }) {
  return (
    <div style={{ display: "inline-flex", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3 }}>
      {options.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)} style={{
          padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
          background: value === o.key ? C.surface3 : "transparent", color: value === o.key ? C.text : C.text3,
        }}>{o.label}</button>
      ))}
    </div>
  );
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 11px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
      background: active ? "rgba(201,168,106,0.14)" : C.surface2,
      color: active ? C.gold : C.text3,
      border: `1px solid ${active ? "rgba(201,168,106,0.4)" : C.border}`,
    }}>{children}</button>
  );
}
function Card({ label, value, accent, amber }: { label: string; value: string; accent?: boolean; amber?: boolean }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.text3, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ ...serif, fontSize: 26, fontWeight: 600, marginTop: 6, color: amber ? C.ambar : accent ? C.gold : C.text }}>{value}</div>
    </div>
  );
}
function StatusBadge({ s }: { s: Status }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: s.color, background: `${s.color}1f`, border: `1px solid ${s.color}55`, whiteSpace: "nowrap" }}>{s.label}</span>
  );
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <p style={lblCampo}>{children}</p>;
}
function FieldFull({ children }: { children: React.ReactNode }) {
  return <div style={{ gridColumn: "1 / -1" }}>{children}</div>;
}

const input: React.CSSProperties = { width: "100%", padding: "8px 11px", borderRadius: 8, fontSize: 13, background: C.surface2, color: C.text, border: `1px solid ${C.border}`, boxSizing: "border-box" };
const lblCampo: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: C.text3, margin: "0 0 4px" };
const check: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.text2, alignSelf: "end", paddingBottom: 8 };
const btnPrimary: React.CSSProperties = { padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, background: GOLD, color: "#1A1A18", border: "none", cursor: "pointer" };
const btnSmall: React.CSSProperties = { padding: "7px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: C.surface3, color: C.text2, border: "none", cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "rgba(248,113,113,0.12)", color: C.vermelho, border: "1px solid rgba(248,113,113,0.3)", cursor: "pointer" };
const iconBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 7, background: "transparent", color: C.text3, border: "none", cursor: "pointer", fontSize: 13 };
const tagPill: React.CSSProperties = { fontSize: 11, color: C.text2, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 99, padding: "2px 9px" };
const acaoRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 9, padding: "9px 12px", cursor: "pointer" };
const timelineRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", justifyContent: "flex-end" };
const drawer: React.CSSProperties = { width: "min(520px, 96vw)", height: "100%", overflowY: "auto", background: C.surface, borderLeft: `1px solid ${C.border}`, padding: "20px 24px", boxShadow: "-8px 0 40px rgba(0,0,0,0.4)" };
