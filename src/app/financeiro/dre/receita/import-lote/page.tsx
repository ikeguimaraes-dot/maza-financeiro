"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useUnit } from "@kph/auth/context";

const API_BASE = process.env.NEXT_PUBLIC_FINANCEIRO_URL ?? "https://kph-os-financeiro.vercel.app";

// ── Color tokens (mesmos de /financeiro/dre/receita) ────────────────────────
const C = {
  receita:  "#34d399",
  meta:     "#fbbf24",
  alerta:   "#f87171",
  neutro:   "#8A8278",
  text:     "var(--text, #F5F0E8)",
  text2:    "var(--text-2, #C8C2B8)",
  text3:    "var(--text-3, #8A8278)",
  surface:  "var(--surface, #1A1A18)",
  surface2: "var(--surface-2, #222220)",
  surface3: "var(--surface-3, #2C2C2A)",
  border:   "var(--border, rgba(245,240,232,0.08))",
  brand:    "var(--brand, #C4622D)",
} as const;

// ── Parsing de nome de arquivo ───────────────────────────────────────────────
// Regex idêntica à extractDateFromFilename de /api/lorean/import — garante que
// o agrupamento client-side bate com a data que a API vai gravar no banco.
type Tipo = "movimento" | "venda" | "caixa";

type ParsedFile = {
  file: File;
  key: string;              // nome+tamanho, p/ dedupe
  loreanCode: string | null;
  data: string | null;      // YYYY-MM-DD (null se não extraível do nome — comum em Caixa)
  tipo: Tipo | null;
};

function parseFilename(file: File): ParsedFile {
  const name = file.name;
  const codeMatch = name.match(/LOREAN\s*\[(\d+)\]/i);
  const dateMatch = name.match(/\[(\d{2})\.(\d{2})\.(\d{2})\]/);
  const lower = name.toLowerCase();
  const tipo: Tipo | null =
    lower.includes("movimento") ? "movimento" :
    lower.includes("venda")     ? "venda" :
    lower.includes("caixa")     ? "caixa" : null;
  return {
    file,
    key: `${name}::${file.size}`,
    loreanCode: codeMatch ? codeMatch[1]! : null,
    data: dateMatch ? `20${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null,
    tipo,
  };
}

type Pacote = {
  data: string; // YYYY-MM-DD
  movimento: ParsedFile | null;
  venda: ParsedFile | null;
  caixas: ParsedFile[];
  codigos: Set<string>;
  status: "pronto" | "incompleto";
};

type ProcessState = "pendente" | "processando" | "sucesso" | "erro";
type PacoteStatus = { state: ProcessState; mensagem?: string };
type Fase = "selecao" | "processando" | "concluido";

const fmtDateBR = (iso: string) => iso.split("-").reverse().join("/");

function csvEscape(v: string): string {
  if (/[;"\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

// ── Chamada individual à API (1 PDF por request, mesmo contrato do import diário) ──
async function enviarArquivo(
  file: File, tipo: Tipo, unitId: string, workdayId: string | null,
): Promise<string | null> {
  const fd = new FormData();
  fd.append("tipo", tipo);
  fd.append("arquivo", file);
  fd.append("unit_id", unitId);
  if (workdayId) fd.append("workday_id", workdayId);
  const res = await fetch(`${API_BASE}/api/lorean/import`, { method: "POST", body: fd });
  let json: { success: boolean; workday_id?: string | null; errors?: string[] };
  try { json = await res.json(); }
  catch (e) { throw new Error(`resposta inválida: ${String(e)}`); }
  if (!res.ok || !json.success) {
    const msg = json.errors?.length ? json.errors.join(" | ") : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json.workday_id ?? null;
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function ImportLotePage() {
  const { unit, units } = useUnit();

  const [selectedUnitId, setSelectedUnitId] = useState<string>(unit?.id ?? units[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [ignoredMsg, setIgnoredMsg] = useState<string | null>(null);
  const [caixaAssignments, setCaixaAssignments] = useState<Record<string, string>>({});

  const [fase, setFase] = useState<Fase>("selecao");
  const [progressLabel, setProgressLabel] = useState("");
  const [pacoteStatus, setPacoteStatus] = useState<Record<string, PacoteStatus>>({});

  const unitLabel = units.find((u) => u.id === selectedUnitId)?.name ?? "—";

  // ── Seleção de arquivos ──────────────────────────────────────────────────
  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    const pdfs = arr.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    const ignored = arr.length - pdfs.length;
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}::${f.size}`));
      const merged = [...prev];
      for (const f of pdfs) {
        const k = `${f.name}::${f.size}`;
        if (!seen.has(k)) { seen.add(k); merged.push(f); }
      }
      return merged;
    });
    setIgnoredMsg(ignored > 0 ? `${ignored} arquivo(s) ignorado(s) (não são PDF)` : null);
  }

  function limparSelecao() {
    setFiles([]); setCaixaAssignments({}); setIgnoredMsg(null);
    setFase("selecao"); setPacoteStatus({}); setProgressLabel("");
  }

  // ── Agrupamento por data ──────────────────────────────────────────────────
  const parsedFiles = useMemo(() => files.map(parseFilename), [files]);

  const semTipo = useMemo(() => parsedFiles.filter((f) => !f.tipo), [parsedFiles]);

  const caixasSemData = useMemo(
    () => parsedFiles.filter((f) => f.tipo === "caixa" && !f.data && !caixaAssignments[f.key]),
    [parsedFiles, caixaAssignments],
  );

  const codigosDetectados = useMemo(
    () => [...new Set(parsedFiles.map((f) => f.loreanCode).filter((c): c is string => !!c))],
    [parsedFiles],
  );

  const pacotes: Pacote[] = useMemo(() => {
    const map = new Map<string, { movimento: ParsedFile | null; venda: ParsedFile | null; caixas: ParsedFile[]; codigos: Set<string> }>();
    const ensure = (data: string) => {
      if (!map.has(data)) map.set(data, { movimento: null, venda: null, caixas: [], codigos: new Set() });
      return map.get(data)!;
    };
    for (const f of parsedFiles) {
      if (!f.tipo) continue;
      const data = f.tipo === "caixa" && !f.data ? caixaAssignments[f.key] ?? null : f.data;
      if (!data) continue;
      const bucket = ensure(data);
      if (f.loreanCode) bucket.codigos.add(f.loreanCode);
      if (f.tipo === "movimento") bucket.movimento = f;
      else if (f.tipo === "venda") bucket.venda = f;
      else bucket.caixas.push(f);
    }
    return Array.from(map.entries())
      .map(([data, b]) => ({
        data, movimento: b.movimento, venda: b.venda, caixas: b.caixas, codigos: b.codigos,
        status: (b.movimento ? "pronto" : "incompleto") as Pacote["status"],
      }))
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [parsedFiles, caixaAssignments]);

  const prontos = pacotes.filter((p) => p.status === "pronto");
  const incompletos = pacotes.filter((p) => p.status === "incompleto");

  // ── Processamento sequencial ─────────────────────────────────────────────
  async function iniciarImportacao() {
    if (!selectedUnitId || prontos.length === 0) return;
    setFase("processando");
    setPacoteStatus({});
    for (let i = 0; i < prontos.length; i++) {
      const p = prontos[i]!;
      setProgressLabel(`Processando ${i + 1}/${prontos.length} — ${unitLabel} ${fmtDateBR(p.data)}…`);
      setPacoteStatus((prev) => ({ ...prev, [p.data]: { state: "processando" } }));
      try {
        const workdayId = await enviarArquivo(p.movimento!.file, "movimento", selectedUnitId, null);
        if (p.venda) await enviarArquivo(p.venda.file, "venda", selectedUnitId, workdayId);
        for (const c of p.caixas) await enviarArquivo(c.file, "caixa", selectedUnitId, workdayId);
        setPacoteStatus((prev) => ({ ...prev, [p.data]: { state: "sucesso" } }));
      } catch (e) {
        setPacoteStatus((prev) => ({ ...prev, [p.data]: { state: "erro", mensagem: String(e instanceof Error ? e.message : e) } }));
        // não interrompe — segue pro próximo pacote
      }
    }
    setProgressLabel("");
    setFase("concluido");
  }

  // ── Relatório final ───────────────────────────────────────────────────────
  const totalProcessados = Object.keys(pacoteStatus).length;
  const totalSucesso = Object.values(pacoteStatus).filter((s) => s.state === "sucesso").length;
  const totalErro = Object.values(pacoteStatus).filter((s) => s.state === "erro").length;
  const errosLista = pacotes.filter((p) => pacoteStatus[p.data]?.state === "erro");
  const progressoPct = prontos.length > 0
    ? (Object.values(pacoteStatus).filter((s) => s.state === "sucesso" || s.state === "erro").length / prontos.length) * 100
    : 0;

  function baixarRelatorio() {
    const header = ["Data", "Unidade", "Status", "Movimento", "Venda", "Caixas", "Mensagem"];
    const rows = pacotes.map((p) => {
      const st = pacoteStatus[p.data];
      const statusLabel =
        st?.state === "sucesso" ? "Sucesso" :
        st?.state === "erro" ? "Erro" :
        st?.state === "processando" ? "Processando" :
        p.status === "pronto" ? "Não processado" : "Incompleto (pulado)";
      return [
        fmtDateBR(p.data), unitLabel, statusLabel,
        p.movimento ? "Sim" : "Não", p.venda ? "Sim" : "Não",
        String(p.caixas.length), st?.mensagem ?? "",
      ];
    });
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-lote-${unitLabel.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const processando = fase === "processando";

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <Link href="/financeiro/dre/receita" style={{
        fontSize: 11, color: C.text3, textDecoration: "none", fontWeight: 600,
        letterSpacing: 0.6, textTransform: "uppercase",
      }}>
        ← Receita
      </Link>

      <header style={{ margin: "10px 0 24px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, letterSpacing: -0.5, margin: "0 0 4px" }}>
          Importar em Lote
        </h1>
        <p style={{ fontSize: 13, color: C.text3, margin: 0 }}>
          Importa histórico de múltiplos dias do Lorean (Movimento + Venda + Caixas) de uma vez.
        </p>
      </header>

      {/* ── Seletor de unidade ── */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.text3, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.6 }}>
          Unidade
        </label>
        <select
          value={selectedUnitId}
          onChange={(e) => setSelectedUnitId(e.target.value)}
          disabled={processando}
          style={{
            padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500,
            background: C.surface2, border: `1px solid ${C.border}`, color: C.text,
            cursor: processando ? "not-allowed" : "pointer", minWidth: 240,
          }}
        >
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      {/* ── Dropzone ── */}
      {fase === "selecao" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          onClick={() => document.getElementById("import-lote-input")?.click()}
          style={{
            border: `2px dashed ${dragOver ? C.brand : C.border}`, borderRadius: 14,
            padding: "48px 24px", textAlign: "center", cursor: "pointer",
            background: dragOver ? "rgba(196,98,45,0.08)" : C.surface,
            transition: "border-color 150ms ease, background 150ms ease",
            marginBottom: 16,
          }}
        >
          <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: "0 0 6px" }}>
            Arraste os PDFs aqui
          </p>
          <p style={{ fontSize: 12, color: C.text3, margin: 0 }}>
            ou clique para selecionar — Movimento, Venda e Caixa, sem limite de quantidade
          </p>
          <input
            id="import-lote-input" type="file" accept=".pdf" multiple
            style={{ display: "none" }}
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
          />
        </div>
      )}

      {ignoredMsg && (
        <p style={{ fontSize: 12, color: C.meta, marginTop: -8, marginBottom: 16 }}>⚠ {ignoredMsg}</p>
      )}

      {files.length > 0 && (
        <>
          {/* ── Resumo + limpar ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Chip label={`${files.length} arquivo${files.length !== 1 ? "s" : ""}`} />
              <Chip label={`${pacotes.length} dia${pacotes.length !== 1 ? "s" : ""}`} />
              <Chip label={`${prontos.length} pronto${prontos.length !== 1 ? "s" : ""}`} color={C.receita} />
              {incompletos.length > 0 && <Chip label={`${incompletos.length} incompleto${incompletos.length !== 1 ? "s" : ""}`} color={C.alerta} />}
              {caixasSemData.length > 0 && <Chip label={`${caixasSemData.length} caixa(s) sem data`} color={C.meta} />}
              {semTipo.length > 0 && <Chip label={`${semTipo.length} não reconhecido(s)`} color={C.alerta} />}
            </div>
            {fase === "selecao" && (
              <button onClick={limparSelecao} style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: "transparent", color: C.text3, border: `1px solid ${C.border}`, cursor: "pointer",
              }}>
                Limpar seleção
              </button>
            )}
          </div>

          {/* ── Aviso de códigos mistos ── */}
          {codigosDetectados.length > 1 && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 12,
              background: "rgba(251,191,36,0.08)", color: C.meta, border: "1px solid rgba(251,191,36,0.25)",
            }}>
              ⚠ Códigos Lorean distintos detectados nos arquivos: {codigosDetectados.map((c) => `[${c}]`).join(", ")}
              {" "}— confira se todos os PDFs são realmente da unidade selecionada ({unitLabel}).
            </div>
          )}

          {/* ── Arquivos não reconhecidos ── */}
          {semTipo.length > 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.alerta, margin: "0 0 8px" }}>
                Arquivos não reconhecidos (nome não contém "Movimento", "Venda" ou "Caixa")
              </p>
              {semTipo.map((f) => (
                <p key={f.key} style={{ fontSize: 12, color: C.text3, margin: "2px 0" }}>{f.file.name}</p>
              ))}
            </div>
          )}

          {/* ── Caixas sem data identificada — atribuição manual ── */}
          {caixasSemData.length > 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.meta, margin: "0 0 8px" }}>
                Caixas sem data no nome do arquivo — atribua manualmente
              </p>
              {caixasSemData.map((f) => (
                <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                  <span style={{ fontSize: 12, color: C.text2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.file.name}
                  </span>
                  <input
                    type="date"
                    onChange={(e) => setCaixaAssignments((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    style={{
                      padding: "5px 8px", borderRadius: 6, fontSize: 12,
                      background: C.surface2, border: `1px solid ${C.border}`, color: C.text,
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Preview / status table ── */}
          <div style={{ overflowX: "auto", marginBottom: 20 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <thead>
                <tr style={{ background: C.surface2 }}>
                  {["Data", "Unidade", "Movimento", "Venda", "Caixas", "Status"].map((h, i) => (
                    <th key={h} style={{
                      padding: "8px 12px", textAlign: i === 0 || i === 1 ? "left" : "right",
                      fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
                      color: C.text3, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pacotes.map((p) => {
                  const live = pacoteStatus[p.data];
                  const cell =
                    live?.state === "processando" ? { label: "⏳ processando", color: C.meta } :
                    live?.state === "sucesso"     ? { label: "✓ sucesso", color: C.receita } :
                    live?.state === "erro"        ? { label: "✗ erro", color: C.alerta } :
                    p.status === "pronto"         ? { label: "pronto", color: C.receita } :
                                                     { label: "incompleto", color: C.alerta };
                  return (
                    <tr key={p.data} style={{ borderTop: `1px solid ${C.border}` }} title={live?.mensagem}>
                      <td style={{ padding: "8px 12px", color: C.text, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDateBR(p.data)}</td>
                      <td style={{ padding: "8px 12px", color: C.text2, whiteSpace: "nowrap" }}>{unitLabel}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: p.movimento ? C.receita : C.alerta }}>{p.movimento ? "✓" : "✗"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: p.venda ? C.receita : C.text3 }}>{p.venda ? "✓" : "✗"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: p.caixas.length ? C.text2 : C.text3 }}>{p.caixas.length}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: cell.color }}>{cell.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Iniciar importação / progresso ── */}
          {fase === "selecao" && (
            <button
              onClick={iniciarImportacao}
              disabled={prontos.length === 0 || !selectedUnitId}
              style={{
                padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: prontos.length === 0 ? C.surface3 : C.brand,
                color: prontos.length === 0 ? C.text3 : "#fff",
                border: "none", cursor: prontos.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              Iniciar importação {prontos.length > 0 ? `(${prontos.length} dia${prontos.length !== 1 ? "s" : ""})` : ""}
            </button>
          )}

          {processando && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: C.text2, marginBottom: 8 }}>⏳ {progressLabel}</p>
              <div style={{ height: 8, background: C.surface3, borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${progressoPct}%`, background: C.brand,
                  borderRadius: 4, transition: "width 300ms ease-out",
                }} />
              </div>
            </div>
          )}

          {/* ── Relatório final ── */}
          {fase === "concluido" && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: "0 0 10px" }}>
                Concluído — {totalSucesso} dia{totalSucesso !== 1 ? "s" : ""} importado{totalSucesso !== 1 ? "s" : ""} com sucesso
                {totalErro > 0 && `, ${totalErro} com erro`}
                {totalProcessados < prontos.length && ` (${prontos.length - totalProcessados} não processado(s))`}
              </p>

              {errosLista.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.alerta, margin: "0 0 6px" }}>Dias com erro:</p>
                  {errosLista.map((p) => (
                    <p key={p.data} style={{ fontSize: 12, color: C.text2, margin: "3px 0" }}>
                      <strong>{fmtDateBR(p.data)}</strong> — {pacoteStatus[p.data]?.mensagem}
                    </p>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={baixarRelatorio} style={{
                  padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: C.surface3, color: C.text, border: `1px solid ${C.border}`, cursor: "pointer",
                }}>
                  Baixar relatório (CSV)
                </button>
                <button onClick={limparSelecao} style={{
                  padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: C.brand, color: "#fff", border: "none", cursor: "pointer",
                }}>
                  Nova importação
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────
function Chip({ label, color }: { label: string; color?: string }) {
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: C.surface3, color: color ?? C.text2, border: `1px solid ${C.border}`,
    }}>
      {label}
    </span>
  );
}
