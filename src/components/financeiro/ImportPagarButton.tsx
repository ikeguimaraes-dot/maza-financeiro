"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

export function ImportPagarButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<"import" | "diagnostico" | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [diagOutput, setDiagOutput] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setStatus(null)
    setDiagOutput(null)
  }

  async function enviar(mode: "import" | "diagnostico") {
    if (!file) return
    const fd = new FormData()
    fd.append("file", file)
    if (mode === "diagnostico") fd.append("mode", "diagnostico")

    setBusy(mode)
    setStatus(null)
    if (mode === "diagnostico") setDiagOutput(null)

    try {
      const apiBase = "/financeiro"
      const res = await fetch(`${apiBase}/api/financeiro/pagar/import`, { method: "POST", body: fd })
      const json = await res.json()

      if (mode === "diagnostico") {
        setDiagOutput(json.ok ? JSON.stringify(json, null, 2) : `Erro: ${json.error ?? "desconhecido"}`)
      } else if (json.ok) {
        setStatus({ ok: true, msg: `${json.inserted} títulos importados` })
        setFile(null)
        if (inputRef.current) inputRef.current.value = ""
        startTransition(() => router.refresh())
      } else {
        setStatus({ ok: false, msg: json.error ?? "Erro desconhecido" })
      }
    } catch (err) {
      if (mode === "diagnostico") setDiagOutput(`Erro: ${String(err)}`)
      else setStatus({ ok: false, msg: String(err) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy != null}
          style={{
            padding: "7px 16px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: busy != null ? "var(--text-3)" : "var(--text)",
            fontSize: 12,
            fontWeight: 600,
            cursor: busy != null ? "default" : "pointer",
            letterSpacing: 0.3,
            whiteSpace: "nowrap",
          }}
        >
          ↑ {file ? file.name : "Selecionar planilha"}
        </button>

        {file && (
          <>
            <button
              onClick={() => enviar("diagnostico")}
              disabled={busy != null}
              title="Analisa o arquivo sem gravar nada no banco"
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "transparent",
                color: busy != null ? "var(--text-3)" : "var(--brand, #D4A574)",
                fontSize: 12,
                fontWeight: 600,
                cursor: busy != null ? "default" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {busy === "diagnostico" ? "Diagnosticando…" : "Diagnosticar"}
            </button>
            <button
              onClick={() => enviar("import")}
              disabled={busy != null}
              style={{
                padding: "7px 16px",
                borderRadius: 8,
                border: "none",
                background: busy != null ? "var(--surface-2)" : "var(--brand, #D4A574)",
                color: busy != null ? "var(--text-3)" : "var(--primary-foreground, #1A1208)",
                fontSize: 12,
                fontWeight: 700,
                cursor: busy != null ? "default" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {busy === "import" ? "Importando…" : "Importar"}
            </button>
          </>
        )}

        {isPending && <span style={{ fontSize: 12, color: "var(--text-3)" }}>Atualizando…</span>}
        {status && (
          <span style={{ fontSize: 12, color: status.ok ? "var(--brand)" : "#EF4444" }}>
            {status.msg}
          </span>
        )}
      </div>

      {diagOutput && (
        <div style={{ width: "100%", maxWidth: 720 }}>
          <p style={{ fontSize: 11, color: "var(--text-3)", margin: "0 0 4px" }}>
            Diagnóstico (nada foi gravado):
          </p>
          <pre style={{
            background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: 6, padding: 10, fontSize: 11, color: "var(--text)",
            maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {diagOutput}
          </pre>
        </div>
      )}
    </div>
  )
}
