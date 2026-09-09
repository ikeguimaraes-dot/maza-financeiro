"use client"

import { useEffect, useState } from "react"
import { gerarCatalogoAutomatico, getCatalogoGerado } from "@/app/financeiro/dre/cmv/actions"
import type { GerarCatalogoResultado, CatalogoItem } from "@/app/financeiro/dre/cmv/actions"

export function CatalogoTab() {
  const [itens, setItens] = useState<CatalogoItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [resultado, setResultado] = useState<GerarCatalogoResultado | null>(null)
  const [erro, setErro] = useState("")

  async function carregar() {
    setLoading(true)
    const r = await getCatalogoGerado()
    setItens(r)
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [])

  async function handleGerar() {
    setGerando(true); setErro(""); setResultado(null)
    const r = await gerarCatalogoAutomatico()
    setGerando(false)
    if (!r.ok) { setErro(r.error ?? "Falha ao gerar catálogo."); return }
    setResultado(r)
    await carregar()
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", margin: 0 }}>
            Catálogo de produtos
          </p>
          <p style={{ fontSize: 11, color: "var(--text-3)", margin: "2px 0 0" }}>
            Gera automaticamente a partir das compras (XML e planilha) que ainda não têm produto.
          </p>
        </div>
        <button disabled={gerando} onClick={() => void handleGerar()} style={{
          padding: "9px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700,
          background: "var(--brand, #C4622D)", color: "var(--primary-foreground)", border: "none",
          cursor: gerando ? "default" : "pointer", whiteSpace: "nowrap",
        }}>
          {gerando ? "Gerando…" : "Gerar catálogo"}
        </button>
      </div>

      {erro && (
        <div style={{ padding: "9px 12px", borderRadius: 7, background: "rgba(239,68,68,.1)",
          color: "#ef4444", fontSize: 12 }}>
          {erro}
        </div>
      )}
      {resultado && (
        <div style={{ padding: "9px 12px", borderRadius: 7, background: "rgba(34,197,94,.1)",
          color: "#22c55e", fontSize: 12 }}>
          {resultado.produtosCriados} produto{resultado.produtosCriados !== 1 ? "s" : ""} criado{resultado.produtosCriados !== 1 ? "s" : ""} · {resultado.itensVinculados} ite{resultado.itensVinculados !== 1 ? "ns" : "m"} vinculado{resultado.itensVinculados !== 1 ? "s" : ""}
          {(resultado.excluidosPorNcm > 0 || resultado.excluidosPorCategoria > 0) && (
            <> · {resultado.excluidosPorNcm} ignorado{resultado.excluidosPorNcm !== 1 ? "s" : ""} por NCM fora da faixa alimentar · {resultado.excluidosPorCategoria} ignorado{resultado.excluidosPorCategoria !== 1 ? "s" : ""} por categoria não-produto</>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ padding: "24px 0", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
          Carregando catálogo…
        </p>
      ) : !itens || itens.length === 0 ? (
        <div style={{ padding: "48px 24px", textAlign: "center",
          background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 14 }}>
          <p style={{ fontSize: 14, color: "var(--text-3)", margin: 0 }}>
            Catálogo vazio. Clique em &ldquo;Gerar catálogo&rdquo; para criar a partir das compras existentes.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12,
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                {["Código", "Nome", "NCM", "Unidade", "Itens vinculados", "Status"].map((h, i) => (
                  <th key={h} style={{
                    padding: "8px 12px", textAlign: i > 3 ? "right" : "left",
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
                    color: "var(--text-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map(p => (
                <tr key={p.id} style={{ borderTop: "1px solid var(--border)", opacity: p.ativo ? 1 : 0.5 }}>
                  <td style={{ padding: "7px 12px", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>
                    {p.codigo}
                  </td>
                  <td style={{ padding: "7px 12px", color: "var(--text)" }}>{p.nome}</td>
                  <td style={{ padding: "7px 12px", color: "var(--text-3)", whiteSpace: "nowrap" }}>
                    {p.ncm ?? "—"}
                  </td>
                  <td style={{ padding: "7px 12px", color: "var(--text-3)", whiteSpace: "nowrap" }}>
                    {p.unidadePadrao ?? "—"}
                  </td>
                  <td style={{ padding: "7px 12px", textAlign: "right", color: "var(--text)" }}>
                    {p.itensVinculados}
                  </td>
                  <td style={{ padding: "7px 12px", textAlign: "right" }}>
                    {p.ativo
                      ? <span style={{ fontSize:10,fontWeight:700,color:"#22C55E",background:"rgba(34,197,94,0.12)",padding:"2px 8px",borderRadius:99 }}>ATIVO</span>
                      : <span style={{ fontSize:10,color:"var(--text-3)" }}>MESCLADO</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
