"use client"

import { useEffect, useState } from "react"
import type { CSSProperties } from "react"
import { getNotaCompleta, getHistoricoProduto } from "@/app/financeiro/dre/cmv/actions"
import type { NotaCompletaResultado, NotaItem, HistoricoRow, RankingItem } from "@/app/financeiro/dre/cmv/actions"
import { HistoricoDrawer } from "./RankingTab"

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—"
  : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

const fmtQty = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(v)

const fmtDate = (value: string | null | undefined) => {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(date)
}

const formatCnpj = (cnpj: string | null | undefined) => {
  if (!cnpj) return "—"
  const d = cnpj.replace(/\D/g, "")
  if (d.length !== 14) return cnpj
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
}

const thD = (align: "left" | "right" = "left"): CSSProperties => ({
  padding: "7px 10px", textAlign: align,
  fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
  textTransform: "uppercase", color: "var(--text-3)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
})

type Props = {
  chaveNfe: string
  unitId: string | null
  onClose: () => void
}

export function NotaDrawer({ chaveNfe, unitId, onClose }: Props) {
  const [dados, setDados] = useState<NotaCompletaResultado | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiado, setCopiado] = useState(false)

  const [itemDrawer, setItemDrawer] = useState<RankingItem | null>(null)
  const [itemHistorico, setItemHistorico] = useState<HistoricoRow[]>([])
  const [loadingItemHistorico, setLoadingItemHistorico] = useState(false)

  useEffect(() => {
    setLoading(true)
    setDados(null)
    getNotaCompleta(chaveNfe).then(r => {
      setDados(r)
      setLoading(false)
    })
  }, [chaveNfe])

  async function abrirHistoricoItem(item: NotaItem) {
    if (!item.itemCodigo) return
    const rankingItem: RankingItem = {
      item_codigo: item.itemCodigo,
      item_descricao: item.itemDescricao,
      fornecedor_nome: dados?.nota?.emitenteNome ?? null,
      desc_gerencial: item.produtoNome,
      unidade_medida: item.unidade,
      custo_total: Number(item.valorTotal ?? 0),
      quantidade_total: Number(item.quantidade ?? 0),
      custo_medio: Number(item.valorUnitario ?? 0),
      variacao_media: null,
    }
    setItemDrawer(rankingItem)
    setItemHistorico([])
    setLoadingItemHistorico(true)
    try {
      setItemHistorico(await getHistoricoProduto(unitId, item.itemCodigo))
    } finally {
      setLoadingItemHistorico(false)
    }
  }

  function copiarChave() {
    void navigator.clipboard.writeText(chaveNfe)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }

  const nota = dados?.nota ?? null
  const itens = dados?.itens ?? []
  const somaItens = dados?.somaItens ?? 0
  const diferenca = nota ? somaItens - nota.valorTotal : 0
  const divergente = Math.abs(diferenca) > 0.01

  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, zIndex: 998, background: "rgba(0,0,0,0.45)",
      }} />

      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 720, maxWidth: "94vw",
        zIndex: 999, background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column", overflowY: "auto",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.3)",
      }}>
        {/* Sticky header */}
        <div style={{
          padding: "20px 24px 16px", borderBottom: "1px solid var(--border)",
          position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
                color: "var(--text-3)", margin: "0 0 4px" }}>
                Nota Fiscal Eletrônica
              </p>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", lineHeight: 1.3 }}>
                {nota ? `NF ${nota.numero ?? "—"} · Série ${nota.serie ?? "—"}` : "Carregando…"}
                {nota?.cancelada && (
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#ef4444",
                    background: "rgba(239,68,68,0.12)", padding: "2px 8px", borderRadius: 99 }}>
                    CANCELADA
                  </span>
                )}
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
                {nota
                  ? `${nota.emitenteNome ?? "—"} · ${formatCnpj(nota.emitenteCnpj)} · ${fmtDate(nota.emissao)}`
                  : "—"}
              </p>
            </div>
            <button onClick={onClose} style={{
              background: "none", border: "none", color: "var(--text-3)",
              cursor: "pointer", fontSize: 22, lineHeight: 1, flexShrink: 0,
            }}>×</button>
          </div>

          {nota && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "monospace",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nota.chave}
                </span>
                <button onClick={copiarChave} style={{
                  padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)",
                  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {copiado ? "Copiado!" : "Copiar chave"}
                </button>
              </div>
              <p style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", margin: 0, whiteSpace: "nowrap" }}>
                {fmtBRL(nota.valorTotal)}
              </p>
            </div>
          )}
        </div>

        <div style={{ padding: "20px 24px", flex: 1 }}>
          {loading && (
            <p style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: "40px 0" }}>
              Carregando nota…
            </p>
          )}

          {!loading && !nota && itens.length === 0 && (
            <p style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: "40px 0" }}>
              Nenhum dado encontrado para esta nota.
            </p>
          )}

          {!loading && itens.length > 0 && (
            <>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
                color: "var(--text-3)", margin: "0 0 10px" }}>
                {itens.length} {itens.length === 1 ? "item" : "itens"}
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11,
                  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2)" }}>
                      <th style={thD()}>Código</th>
                      <th style={thD()}>Descrição</th>
                      <th style={thD()}>NCM</th>
                      <th style={thD("right")}>Unid.</th>
                      <th style={thD("right")}>Qtd</th>
                      <th style={thD("right")}>Vlr. Unit.</th>
                      <th style={thD("right")}>Vlr. Total</th>
                      <th style={thD()}>Produto do catálogo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item, i) => (
                      <tr key={i}
                        onClick={() => void abrirHistoricoItem(item)}
                        style={{ borderTop: "1px solid var(--border)", cursor: item.itemCodigo ? "pointer" : "default" }}
                        onMouseEnter={e => { if (item.itemCodigo) e.currentTarget.style.background = "var(--surface-2)" }}
                        onMouseLeave={e => { e.currentTarget.style.background = "" }}
                      >
                        <td style={{ padding: "6px 10px", color: "var(--text-3)", whiteSpace: "nowrap" }}>
                          {item.itemCodigo ?? "—"}
                        </td>
                        <td style={{ padding: "6px 10px", color: "var(--text)", maxWidth: 200,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.itemDescricao ?? "—"}
                        </td>
                        <td style={{ padding: "6px 10px", color: "var(--text-3)", whiteSpace: "nowrap" }}>
                          {item.ncm ?? "—"}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--text-3)" }}>
                          {item.unidade ?? "—"}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--text)" }}>
                          {fmtQty(item.quantidade)}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--text)" }}>
                          {fmtBRL(item.valorUnitario)}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, color: "var(--text)" }}>
                          {fmtBRL(item.valorTotal)}
                        </td>
                        <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                          {item.produtoCodigo
                            ? <span style={{ color: "var(--text)" }}>
                                <strong>{item.produtoCodigo}</strong> {item.produtoNome}
                              </span>
                            : <span style={{ color: "var(--text-3)", fontStyle: "italic" }}>sem produto</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer: soma dos itens vs valor total da nota */}
              <div style={{
                marginTop: 14, padding: "12px 16px", borderRadius: 10,
                background: divergente ? "rgba(239,68,68,0.08)" : "var(--surface-2)",
                border: `1px solid ${divergente ? "rgba(239,68,68,0.3)" : "var(--border)"}`,
                display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
              }}>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                    Soma dos itens: <strong style={{ color: "var(--text)" }}>{fmtBRL(somaItens)}</strong>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                    Valor da nota: <strong style={{ color: "var(--text)" }}>{fmtBRL(nota?.valorTotal ?? null)}</strong>
                  </span>
                </div>
                {divergente && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444" }}>
                    Diferença: {fmtBRL(diferenca)} — impostos/frete explicam parte; diferença grande pode indicar item faltando
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {itemDrawer && (
        <HistoricoDrawer
          item={itemDrawer}
          historico={itemHistorico}
          loading={loadingItemHistorico}
          onClose={() => { setItemDrawer(null); setItemHistorico([]) }}
        />
      )}
    </>
  )
}
