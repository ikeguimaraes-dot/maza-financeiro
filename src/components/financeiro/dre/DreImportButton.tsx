"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DreImportModal } from "./DreImportModal"

export function DreImportButton() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "7px 16px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text-3)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.3,
          whiteSpace: "nowrap",
        }}
      >
        Importar Excel
      </button>

      {open && (
        <DreImportModal
          onClose={() => setOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}
    </>
  )
}
