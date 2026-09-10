"use client";

import { useState } from "react";
import Link from "next/link";
import { ComprasImportModal } from "@/components/financeiro/compras/ComprasImportModal";
import { LimparHistoricoButton } from "@/components/financeiro/compras/LimparHistoricoButton";

const YOSHIMORI_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909c";
const IKY_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909b";
const UNIDADES = [
  { id: YOSHIMORI_UNIT_ID, nome: "Yoshimori" },
  { id: IKY_UNIT_ID, nome: "IKY Delivery" },
] as const;

export default function ImportarComprasPage() {
  const [unitIdBase, setUnitIdBase] = useState<string>(YOSHIMORI_UNIT_ID);
  const [modalAberto, setModalAberto] = useState<"nf_pedidos" | "contas_pagar" | null>(null);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <nav style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 13 }}>
        <Link href="/financeiro/pagar" style={{ color: "var(--text-3)", textDecoration: "none" }}>Contas a pagar</Link>
        <span style={{ color: "var(--text-3)" }}>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>Importar compras</span>
      </nav>

      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", letterSpacing: -0.5, margin: "0 0 4px" }}>
          Importar NF_PEDIDOS e Contas a Pagar
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", maxWidth: 600, margin: 0 }}>
          A unidade abaixo é a &quot;unidade base&quot; do arquivo — vale pra toda a planilha, exceto
          linhas cuja categoria contenha &quot;IKY DELIVERY&quot;, que são roteadas automaticamente pra
          IKY Delivery.
        </p>
      </header>

      <div style={{ display: "grid", gap: 20 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-3)", display: "block", marginBottom: 6 }}>
            Unidade base do arquivo
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            {UNIDADES.map((u) => (
              <button
                key={u.id}
                onClick={() => setUnitIdBase(u.id)}
                style={{
                  padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: u.id === unitIdBase ? 700 : 500,
                  background: u.id === unitIdBase ? "var(--brand, #C4622D)" : "var(--surface-2)",
                  color: u.id === unitIdBase ? "var(--primary-foreground)" : "var(--text-3)",
                  border: "1px solid var(--border)", cursor: "pointer",
                }}
              >
                {u.nome}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={() => setModalAberto("nf_pedidos")}
            style={{ padding: "10px 18px", borderRadius: 8, border: 0, background: "var(--brand)", color: "white", fontWeight: 600, cursor: "pointer" }}
          >
            Importar NF_PEDIDOS
          </button>
          <button
            onClick={() => setModalAberto("contas_pagar")}
            style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontWeight: 600, cursor: "pointer" }}
          >
            Importar Contas a Pagar
          </button>
        </div>

        <LimparHistoricoButton onSuccess={() => { /* nada a recarregar nesta página */ }} />
      </div>

      {modalAberto && (
        <ComprasImportModal
          tipo={modalAberto}
          unitIdBase={unitIdBase}
          onClose={() => setModalAberto(null)}
          onSuccess={() => setModalAberto(null)}
        />
      )}
    </div>
  );
}
