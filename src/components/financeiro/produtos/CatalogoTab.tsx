"use client"

import { useEffect, useState } from "react"
import {
  getProdutosPendentes, getCandidatosProduto, criarProdutoCatalogo, vincularProduto,
} from "@/app/financeiro/dre/cmv/actions"
import type { ProdutoPendente, CatalogoCandidato } from "@/app/financeiro/dre/cmv/actions"

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—"
  : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

const fmtPct = (v: number) => `${Math.round(v * 100)}%`

const inputStyle: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 7, fontSize: 12,
  background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)",
}

export function CatalogoTab() {
  const [pendentes, setPendentes] = useState<ProdutoPendente[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [selecionado, setSelecionado] = useState<ProdutoPendente | null>(null)
  const [candidatos, setCandidatos] = useState<CatalogoCandidato[]>([])
  const [loadingCandidatos, setLoadingCandidatos] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")

  const [novoCodigo, setNovoCodigo] = useState("")
  const [novoNome, setNovoNome] = useState("")
  const [novaUnidade, setNovaUnidade] = useState("")
  const [novaCategoria, setNovaCategoria] = useState("")

  async function carregarPendentes() {
    setLoading(true)
    const r = await getProdutosPendentes()
    setPendentes(r)
    setLoading(false)
  }

  useEffect(() => { void carregarPendentes() }, [])

  useEffect(() => {
    if (!selecionado) { setCandidatos([]); return }
    setLoadingCandidatos(true)
    getCandidatosProduto(selecionado.fornecedorCnpj, selecionado.itemCodigo)
      .then(setCandidatos)
      .finally(() => setLoadingCandidatos(false))
    setNovoNome(selecionado.itemDescricao ?? "")
    setNovoCodigo("")
    setNovaUnidade("")
    setNovaCategoria("")
    setErro("")
  }, [selecionado])

  async function resolverAtual() {
    setSelecionado(null)
    await carregarPendentes()
  }

  async function handleVincular(produtoId: string) {
    if (!selecionado) return
    setSalvando(true); setErro("")
    const r = await vincularProduto(selecionado.fornecedorCnpj, selecionado.itemCodigo, produtoId)
    setSalvando(false)
    if (!r.ok) { setErro(r.error ?? "Falha ao vincular."); return }
    await resolverAtual()
  }

  async function handleCriarNovo() {
    if (!selecionado) return
    if (!novoCodigo.trim() || !novoNome.trim()) { setErro("Preencha código e nome."); return }
    setSalvando(true); setErro("")
    const criado = await criarProdutoCatalogo(
      novoCodigo.trim(), novoNome.trim(),
      selecionado.ncm, novaUnidade.trim() || null, novaCategoria.trim() || null
    )
    if (!criado.ok || !criado.produto) {
      setSalvando(false); setErro(criado.error ?? "Falha ao criar produto."); return
    }
    const vinculo = await vincularProduto(selecionado.fornecedorCnpj, selecionado.itemCodigo, criado.produto.id)
    setSalvando(false)
    if (!vinculo.ok) { setErro(vinculo.error ?? "Produto criado, mas falhou ao vincular."); return }
    await resolverAtual()
  }

  if (loading) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
        Carregando pendências…
      </div>
    )
  }

  if (!pendentes || pendentes.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center",
        background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 14 }}>
        <p style={{ fontSize: 14, color: "var(--text-3)", margin: 0 }}>
          Nenhum item pendente de catalogação.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, alignItems: "start" }}>
      {/* Lista de pendentes */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 10, color: "var(--text-3)" }}>
            {pendentes.length.toLocaleString("pt-BR")} pendente{pendentes.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div style={{ maxHeight: 640, overflowY: "auto" }}>
          {pendentes.map(p => {
            const key = `${p.fornecedorCnpj}::${p.itemCodigo}`
            const active = selecionado != null
              && selecionado.fornecedorCnpj === p.fornecedorCnpj
              && selecionado.itemCodigo === p.itemCodigo
            return (
              <button key={key} onClick={() => setSelecionado(p)} style={{
                display: "block", width: "100%", padding: "10px 12px", textAlign: "left",
                background: active ? "var(--surface-2)" : "transparent",
                borderBottom: "1px solid var(--border)",
                borderLeft: `3px solid ${active ? "var(--brand, #C4622D)" : "transparent"}`,
                cursor: "pointer",
              }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: active ? 700 : 500,
                  color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.itemDescricao ?? p.itemCodigo}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                  {p.fornecedorNome ?? p.fornecedorCnpj} · {p.compras} compra{p.compras !== 1 ? "s" : ""} · {fmtBRL(p.valorTotal)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Detalhe */}
      <div style={{ minWidth: 0 }}>
        {!selecionado ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 13,
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
            Selecione um item pendente para catalogar.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
              padding: "16px 20px" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
                {selecionado.itemDescricao ?? selecionado.itemCodigo}
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
                {[selecionado.fornecedorNome, `NCM ${selecionado.ncm ?? "—"}`,
                  `${selecionado.compras} compras`, fmtBRL(selecionado.valorTotal)]
                  .filter(Boolean).join(" · ")}
              </p>
            </div>

            {erro && (
              <div style={{ padding: "9px 12px", borderRadius: 7, background: "rgba(239,68,68,.1)",
                color: "#ef4444", fontSize: 12 }}>
                {erro}
              </div>
            )}

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
              padding: "14px 16px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
                color: "var(--text-3)", margin: "0 0 10px" }}>
                Candidatos no catálogo
              </p>
              {loadingCandidatos ? (
                <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>Buscando candidatos…</p>
              ) : candidatos.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
                  Nenhum produto do catálogo com o mesmo NCM.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {candidatos.map(c => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: 8, padding: "8px 10px", borderRadius: 8, background: "var(--surface-2)" }}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                          {c.nome}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                          {c.codigo} · {fmtPct(c.similaridade)} similar
                        </span>
                      </span>
                      <button disabled={salvando} onClick={() => void handleVincular(c.id)} style={{
                        padding: "6px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700,
                        background: "var(--brand, #C4622D)", color: "var(--primary-foreground)", border: "none",
                        cursor: salvando ? "default" : "pointer", whiteSpace: "nowrap",
                      }}>
                        Vincular
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
              padding: "14px 16px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
                color: "var(--text-3)", margin: "0 0 10px" }}>
                Criar produto novo
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input placeholder="Código (ex.: SAL-ATL-1416)" value={novoCodigo}
                  onChange={e => setNovoCodigo(e.target.value)} style={inputStyle} />
                <input placeholder="Nome" value={novoNome}
                  onChange={e => setNovoNome(e.target.value)} style={inputStyle} />
                <input placeholder="Unidade padrão" value={novaUnidade}
                  onChange={e => setNovaUnidade(e.target.value)} style={inputStyle} />
                <input placeholder="Categoria" value={novaCategoria}
                  onChange={e => setNovaCategoria(e.target.value)} style={inputStyle} />
              </div>
              <button disabled={salvando} onClick={() => void handleCriarNovo()} style={{
                marginTop: 10, padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)",
                cursor: salvando ? "default" : "pointer",
              }}>
                + Criar e vincular
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
