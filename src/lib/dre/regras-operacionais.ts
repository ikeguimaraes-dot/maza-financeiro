import { classificarLiquidacao } from "../financeiro/fluxo/liquidacao"
export const normalizarConta = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ')
export function categoriaOperacional(descricao: string): string | null {
  const d = normalizarConta(descricao)
  if (d === 'ALUGUEL') return 'Aluguel'
  if (['ENERGIA', 'ENERGIA ELETRICA', 'CONSUMO DE ENERGIA'].includes(d)) return 'Energia elétrica'
  if (['CONSUMO AGUA', 'CONSUMO DE AGUA', 'AGUA', 'AGUA E ESGOTO', 'ESGOTO'].includes(d)) return 'Água e esgoto'
  if (['TELEFONE', 'TELEFONIA', 'INTERNET', 'TELEFONE E INTERNET'].includes(d)) return 'Telefone e internet'
  return null
}
export type TituloOperacional = { id: string; liquidacao_origem?: string | null; descricao_c_gerencial: string | null; v_titulo: number | null; d_competencia: string | null; d_lancamento: string | null; d_vencimento: string | null; ref_mes: string | null }
export type FolhaOperacional = { competencia: string; etapa: string; nome: string; pagamento: number | null; bonificacao: number | null }
export type ContaOperacional = { pagamentos_confirmados?: Record<string, boolean>; conta: string; esperada_mensal: boolean; meses: Record<string, number>; total: number }
export function contasOperacionais(linha: string, titulos: TituloOperacional[], folha: FolhaOperacional[]) {
  const contas = new Map<string, ContaOperacional>()
  function add(conta: string, mes: string, valor: number, pago?: boolean) {
    const c: ContaOperacional = contas.get(conta) ?? { conta, esperada_mensal: false, meses: {}, total: 0 }
    c.meses[mes] = Math.round(((c.meses[mes] ?? 0) + valor) * 100) / 100
    if (pago !== undefined) { c.pagamentos_confirmados ??= {}; c.pagamentos_confirmados[mes] = (c.pagamentos_confirmados[mes] ?? true) && pago }
    c.total = Math.round((c.total + valor) * 100) / 100
    contas.set(conta, c)
  }
  if (linha === 'Manutenção') add('Manutenção — zerada por definição', '', 0)
  if (linha === 'Administrativo') {
    for (const f of folha) {
      if (normalizarConta(f.nome) !== 'CINTIA OLIVEIRA DE CARVALHO' || f.etapa !== 'mensal') continue
      const valor = (Math.round(Number(f.pagamento ?? 0) * 100) + Math.round(Number(f.bonificacao ?? 0) * 100)) / 100
      add('Folha Cintia — pagamento + bonificação', `${f.competencia.slice(0, 7)}-01`, valor)
    }
  } else for (const t of titulos) {
    const descricao = t.descricao_c_gerencial ?? ''
    const normalizada = normalizarConta(descricao)
    const categoria = linha === 'Impostos' ? (/^IMPOSTOS?\b/.test(normalizada) ? descricao : null)
      : linha === 'Despesas Financeiras' ? (normalizada.startsWith('CONTABILIDADE') ? descricao : null)
      : categoriaOperacional(descricao)
    if (linha === 'Ocupação' ? categoria !== 'Aluguel' : linha === 'Utilidades' ? !categoria || categoria === 'Aluguel' : !['Impostos','Despesas Financeiras'].includes(linha) || !categoria) continue
    const data = t.d_competencia ?? t.ref_mes ?? t.d_lancamento ?? t.d_vencimento
    if (data) add(categoria!, `${data.slice(0, 7)}-01`, Number(t.v_titulo ?? 0), classificarLiquidacao(t.liquidacao_origem ?? null) === "pago")
  }
  return [...contas.values()]
}
