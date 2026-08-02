"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

export function ImportPagarButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus(null)

    const fd = new FormData()
    fd.append("file", file)

    try {
      const apiBase = "/financeiro";
      const res = await fetch(`${apiBase}/api/financeiro/pagar/import`, {
        method: "POST",
        body: fd,
      })
      const json = await res.json()
      if (json.ok) {
        setStatus({ ok: true, msg: `${json.inserted} títulos importados` })
        startTransition(() => router.refresh())
      } else {
        setStatus({ ok: false, msg: json.error ?? "Erro desconhecido" })
      }
    } catch (err) {
      setStatus({ ok: false, msg: String(err) })
    }

    e.target.value = ""
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={handleFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
        style={{
          padding: "7px 16px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: isPending ? "var(--text-3)" : "var(--text)",
          fontSize: 12,
          fontWeight: 600,
          cursor: isPending ? "default" : "pointer",
          letterSpacing: 0.3,
          whiteSpace: "nowrap",
        }}
      >
        {isPending ? "Atualizando…" : "↑ Importar planilha"}
      </button>
      {status && (
        <span style={{ fontSize: 12, color: status.ok ? "var(--brand)" : "#EF4444" }}>
          {status.msg}
        </span>
      )}
    </div>
  )
}
