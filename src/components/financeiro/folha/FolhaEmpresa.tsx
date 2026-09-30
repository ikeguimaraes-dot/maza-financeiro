"use client"

import { useMemo, useState } from "react"
import { useResource } from "@/lib/hooks/use-resource"
import type { AbaEmpresa } from "@/lib/folha/empresa/planilha"
import { analisarFolhaEmpresa, importarFolhaEmpresa } from "@/app/financeiro/dre/folha/empresa-actions"

import { montarPainelEmpresa, totalizarPainelEmpresa as totalizar, type RegistroEmpresa } from "@/lib/folha/empresa/painel"

import { ResumoFolha } from "./ResumoFolha"
import { ComparacaoFolha } from "./ComparacaoFolha"
import { mesAnterior } from "@/lib/folha/comparacao"

type Dados = { competencias: string[]; competencia: string | null; linhas: RegistroEmpresa[] }
const fmt = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const campo = "bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text)]"
const rotuloMes = (mes: string) => `${mes.slice(5)}/${mes.slice(0, 4)}`

export function FolhaEmpresa({ unitId, unitLabel }: { unitId: string; unitLabel: string }) {
  const [competencia, setCompetencia] = useState("")
  const [busca, setBusca] = useState("")
  const [importando, setImportando] = useState(false)
  const [mensagem, setMensagem] = useState("")
  const { data, loading, error, reload } = useResource<Dados | null>(`${unitId}|${competencia}`, async () => {
    const params = new URLSearchParams({ unit_id: unitId })
    if (competencia) params.set("competencia", competencia)
    const response = await fetch(`/financeiro/api/folha/empresa?${params}`, { cache: "no-store", signal: AbortSignal.timeout(20000) })
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Não foi possível carregar a folha. Tente novamente.")
    return response.json()
  }, null)
  const linhas = useMemo(() => montarPainelEmpresa(data?.linhas ?? []), [data])
  const filtradas = linhas.filter(l => l.nome.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")))
  const totais = totalizar(linhas)
  const subtotal = totalizar(filtradas)
  const temVale = (data?.linhas ?? []).some(l => l.etapa === "adiantamento")
  const mesAtual = competencia || data?.competencia || ""
  const { data: dadosAnteriores, loading: carregandoAnterior, error: erroAnterior, reload: recarregarAnterior } = useResource<Dados | null>(`${unitId}|anterior|${mesAtual}`, async () => {
    if (!mesAtual) return null
    const response = await fetch(`/financeiro/api/folha/empresa?${new URLSearchParams({unit_id: unitId, competencia: mesAnterior(mesAtual)})}`, {cache: "no-store", signal: AbortSignal.timeout(20000)})
    if (!response.ok) throw new Error("Não foi possível carregar o mês anterior.")
    return response.json()
  }, null)
  const mensais = linhas.filter(l => l.pagamento !== null || l.bonificacao !== null)
  const beneficiados = mensais.filter(l => l.bonificacao !== null && l.bonificacao > 0).length
  const bonusAnterior = dadosAnteriores?.linhas.some(l => l.etapa === "mensal" && l.bonificacao !== null)
    ? totalizar(montarPainelEmpresa(dadosAnteriores.linhas)).bonificacao : null
  return <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-6">
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div><p className="text-xs text-[var(--text-3)] mb-1">DRE › Pessoal</p><h1 className="text-lg font-medium text-[var(--text)]">Folha Empresa</h1></div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={campo}>{unitLabel}</span>
        <label className="text-xs text-[var(--text-3)]">Mês <select aria-label="Mês da Folha Empresa" className={campo} value={competencia || data?.competencia || ""} onChange={e => { setCompetencia(e.target.value); setBusca("") }}>
          {!data?.competencias.length && <option value="">Sem competências</option>}
          {data?.competencias.map(c => <option key={c} value={c}>{rotuloMes(c)}</option>)}
        </select></label>
        <button className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-active)] bg-[var(--brand-soft)] text-[var(--brand)]" onClick={() => { setImportando(true); setMensagem("") }}>Importar planilha</button>
      </div>
    </div>
    {mensagem && <p role="status" className="text-sm text-[var(--color-success)] mb-4">{mensagem}</p>}
    {loading && <p role="status" className="text-sm text-[var(--text-3)] py-16 text-center">Carregando Folha Empresa…</p>}
    {error && <div role="alert" className="text-sm text-[var(--color-danger)] p-4 border border-[var(--color-danger)] rounded-xl">{error} <button onClick={reload} className="underline">Tentar novamente</button></div>}
    {!loading && !error && <>
      <ResumoFolha cards={[
        {label: "Total folha", value: linhas.length ? fmt(totais.total) : "—", sub: `Pagamento + bonificação · Vale separado: ${fmt(totais.vale)}`},
        {label: "Headcount", value: mensais.length, sub: "nomes na folha mensal"},
        {label: "Valor / pessoa", value: mensais.length ? fmt(totais.total / mensais.length) : "—", sub: "(pagamento + bonificação) ÷ headcount"},
        {label: "Bonificação total", value: mensais.some(l => l.bonificacao !== null) ? fmt(totais.bonificacao) : "—", sub: `Pagamento: ${fmt(totais.pagamento)}`, highlight: true},
        {label: "Bonificação / pessoa", value: beneficiados ? fmt(totais.bonificacao / beneficiados) : "—", sub: `${beneficiados} beneficiados`},
      ]} />
      {mesAtual && <ComparacaoFolha titulo="Bonificação" competencia={mesAtual}
        atual={mensais.some(l => l.bonificacao !== null) ? totais.bonificacao : null}
        anterior={carregandoAnterior || erroAnterior ? null : bonusAnterior}
        pendencia={carregandoAnterior ? "Carregando mês anterior…" : erroAnterior || undefined} />}
      {linhas.length > 0 && !temVale && <p className="text-xs text-[var(--color-warning)] mb-4">Vale ainda não importado neste mês. O vale é informativo e não altera o total da folha.</p>}
      {!linhas.length ? <div className="rounded-xl border border-[var(--border)] p-10 text-center text-[var(--text-3)] text-sm">Nenhum pagamento importado para este mês e unidade.</div> : <>
        <div className="flex flex-wrap justify-between items-center gap-3 mb-3"><h2 className="text-sm font-medium">Pagamentos por nome <span className="text-[var(--text-3)]">({filtradas.length})</span></h2><input aria-label="Buscar nome na Folha Empresa" placeholder="Buscar nome…" className={campo} value={busca} onChange={e => setBusca(e.target.value)} /></div>
        <div className="overflow-x-auto rounded-xl bg-[var(--surface)] border border-[var(--border)]">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-[var(--surface-2)] text-xs text-[var(--text-3)]"><tr><th className="text-left p-3">Nome</th><th className="text-right p-3">Pagamento</th><th className="text-right p-3">Bonificação</th><th className="text-right p-3">Vale (adiantamento)</th><th className="text-right p-3">Total</th></tr></thead>
            <tbody>{filtradas.map(l => <tr key={l.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]">
              <td className="p-3 text-xs">{l.nome}</td>
              <td className="p-3 text-right tabular-nums" title={l.fontes.pagamento}>{l.pagamento === null ? "—" : fmt(l.pagamento)}</td>
              <td className="p-3 text-right tabular-nums" title={l.fontes.bonificacao}>{l.bonificacao === null ? "—" : fmt(l.bonificacao)}</td>
              <td className="p-3 text-right tabular-nums" title={l.fonteVale}>{l.vale === null ? "—" : fmt(l.vale)}</td>
              <td className="p-3 text-right tabular-nums font-medium">{fmt(totalizar([l]).total)}</td>
            </tr>)}</tbody>
            <tfoot className="bg-[var(--surface-2)] font-medium"><tr><td className="p-3">{busca ? "Total da busca" : "Total"}</td><td className="p-3 text-right">{fmt(subtotal.pagamento)}</td><td className="p-3 text-right">{fmt(subtotal.bonificacao)}</td><td className="p-3 text-right">{fmt(subtotal.vale)}</td><td className="p-3 text-right">{fmt(subtotal.total)}</td></tr></tfoot>
          </table>
        </div>
        <p className="text-xs text-[var(--text-3)] mt-3">Vale é o adiantamento salarial (soma dos blocos das abas VALE), exibido separadamente, sem alterar o total. Fonte: {[...new Set(linhas.map(l => l.arquivo))].join(", ")}. “—” indica ausência de valor nesse bloco. Nomes abreviados e nomes completos permanecem separados até conferência do cadastro.</p>
      </>}
    </>}
    {importando && <Importacao unitId={unitId} unitLabel={unitLabel} fechar={() => setImportando(false)} concluir={quantidade => { setImportando(false); setMensagem(`${quantidade} registros importados. Dados existentes atualizados e novos nomes incluídos.`); setCompetencia(""); reload(); recarregarAnterior() }} />}
  </div>
}

function Importacao({ unitId, unitLabel, fechar, concluir }: { unitId: string; unitLabel: string; fechar: () => void; concluir: (n: number) => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [abas, setAbas] = useState<AbaEmpresa[]>([])
  const [selecao, setSelecao] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState("")
  async function analisar(file: File) {
    setArquivo(file); setAbas([]); setSelecao({}); setOcupado(true); setErro("")
    try {
      const form = new FormData(); form.set("arquivo", file)
      const result = await analisarFolhaEmpresa(form)
      setAbas(result)
      setSelecao(Object.fromEntries(result.filter(a => result.filter(b => b.competencia === a.competencia && b.etapa === a.etapa).length === 1).map(a => [a.aba, a.competencia])))
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível ler a planilha.") }
    finally { setOcupado(false) }
  }
  async function salvar() {
    if (!arquivo) return
    setOcupado(true); setErro("")
    try {
      const form = new FormData(); form.set("arquivo", arquivo); form.set("unit_id", unitId)
      form.set("selecao", JSON.stringify(Object.entries(selecao).map(([aba, competencia]) => ({ aba, competencia }))))
      concluir((await importarFolhaEmpresa(form)).quantidade)
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível importar.") }
    finally { setOcupado(false) }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="importar-folha-titulo">
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4"><h2 id="importar-folha-titulo" className="font-medium">Importar Folha Empresa</h2><button disabled={ocupado} onClick={fechar} aria-label="Fechar importação">✕</button></div>
      <p className="text-sm text-[var(--text-3)] mb-4">Unidade: <strong className="text-[var(--text)]">{unitLabel}</strong>. Escolha uma versão por mês e tipo. Valores preenchidos atualizam o cadastro; campos vazios e nomes ausentes preservam os dados anteriores.</p>
      <input aria-label="Planilha da Folha Empresa" type="file" accept=".xlsx" disabled={ocupado} onChange={e => { const file = e.target.files?.[0]; if (file) void analisar(file) }} className="text-sm mb-4" />
      {abas.length > 0 && <div className="overflow-x-auto"><table className="w-full text-xs min-w-[560px]"><thead><tr className="text-[var(--text-3)]"><th className="text-left p-2">Importar / Aba</th><th className="p-2">Competência</th><th className="text-right p-2">Pagamento</th><th className="text-right p-2">Bonificação</th><th className="text-right p-2">Total</th></tr></thead><tbody>
        {abas.map(a => { const total = totalizar(a.linhas); const duplicada = abas.filter(b => b.competencia === a.competencia && b.etapa === a.etapa).length > 1; return <tr key={a.aba} className="border-t border-[var(--border)]">
          <td className="p-2"><label><input type="checkbox" disabled={ocupado} checked={a.aba in selecao} onChange={e => setSelecao(prev => { const next = { ...prev }; if (e.target.checked) next[a.aba] = a.competencia; else delete next[a.aba]; return next })} /> {a.aba}</label>{duplicada && <p className="text-[var(--color-warning)] mt-1">Escolha uma versão</p>}</td>
          <td className="p-2"><input aria-label={`Competência de ${a.aba}`} type="month" disabled={ocupado || !(a.aba in selecao)} className={campo} value={selecao[a.aba] ?? a.competencia} onChange={e => setSelecao(prev => ({ ...prev, [a.aba]: e.target.value }))} /></td>
          <td className="p-2 text-right">{fmt(total.pagamento)}</td><td className="p-2 text-right">{fmt(total.bonificacao)}</td><td className="p-2 text-right">{fmt(total.total)}</td>
        </tr> })}
      </tbody></table><p className="text-xs text-[var(--text-3)] my-3">Confira o ano de cada competência. As abas VALE entram na coluna Vale como adiantamento salarial e não alteram o total do mês.</p>
      {abas.flatMap(a => a.avisos).length > 0 && <details className="text-xs text-[var(--color-warning)] mb-3"><summary>Valores em branco na planilha</summary>{abas.flatMap(a => a.avisos).map(aviso => <p key={aviso}>{aviso}</p>)}</details>}</div>}
      {erro && <p role="alert" className="text-sm text-[var(--color-danger)] my-3">{erro}</p>}
      <div className="flex justify-end gap-3 mt-4"><button disabled={ocupado} className={campo} onClick={fechar}>Cancelar</button><button disabled={ocupado || !Object.keys(selecao).length} onClick={() => void salvar()} className="maza-button maza-button-primary disabled:opacity-40">{ocupado ? "Processando…" : "Importar selecionadas"}</button></div>
    </div>
  </div>
}
