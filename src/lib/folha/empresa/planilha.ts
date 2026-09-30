import * as XLSX from "xlsx"

export type EtapaFolha = "mensal" | "adiantamento"
export type LinhaEmpresa = {
  nome: string
  nome_chave: string
  pagamento: number | null
  bonificacao: number | null
  fontes: { pagamento?: string; bonificacao?: string }
}
export type AbaEmpresa = {
  aba: string
  competencia: string
  etapa: EtapaFolha
  linhas: LinhaEmpresa[]
  avisos: string[]
}
export const normalizarNome = (nome: string) => nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase()
const meses = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"]

export function valorPlanilha(valor: unknown): number | null {
  if (valor == null || valor === "") return null
  if (typeof valor === "number") {
    if (!Number.isFinite(valor) || valor < 0) throw new Error("Valor inválido na folha.")
    return Math.round((valor + Number.EPSILON) * 100) / 100
  }
  const texto = String(valor).replace(/R\$/gi, "").trim()
  if (texto === "-") return 0
  if (!/^(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{1,2})?$/.test(texto)) throw new Error(`Valor monetário inválido: ${String(valor)}`)
  return valorPlanilha(Number(texto.replace(/\./g, "").replace(",", ".")))
}

/** Read the two labeled blocks, never the cached subtotal cells. Names are
 * joined only by exact spelling after accent/space normalization, not fuzzy IDs. */
export function lerFolhaEmpresa(buffer: ArrayBuffer | Buffer): AbaEmpresa[] {
  const wb = XLSX.read(buffer, { type: "array" })
  const abas: AbaEmpresa[] = []
  for (const aba of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba]!, { header: 1, defval: null })
    let categoria: "pagamento" | "bonificacao" | null = null
    let competencia = ""
    let etapa: EtapaFolha = "mensal"
    const porNome = new Map<string, LinhaEmpresa>()
    const avisos: string[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      const titulo = normalizarNome(String(row[0] ?? ""))
      if (/^(PAGAMENTO|BONIFICACAO)\s*-/.test(titulo)) {
        categoria = titulo.startsWith("PAGAMENTO") ? "pagamento" : "bonificacao"
        const periodo = titulo.match(/([A-Z]+)\s*\/\s*(20\d{2})/)
        const mes = periodo ? meses.indexOf(periodo[1]!) + 1 : 0
        if (!periodo || !mes) throw new Error(`${aba}!A${i + 1}: competência não reconhecida.`)
        const comp = `${periodo[2]}-${String(mes).padStart(2, "0")}`
        const tipo = titulo.includes("ADIANTAMENTO") ? "adiantamento" : "mensal"
        if (competencia && (comp !== competencia || tipo !== etapa)) throw new Error(`${aba}: cabeçalhos com períodos diferentes.`)
        competencia = comp
        etapa = tipo
        continue
      }
      const nome = String(row[1] ?? "").trim()
      if (!categoria || !nome || normalizarNome(nome) === "NOME") continue
      if (!Number.isInteger(Number(row[0])) || Number(row[0]) <= 0) throw new Error(`${aba}!A${i + 1}: linha de pessoa sem numeração.`)
      const chave = normalizarNome(nome)
      const linha = porNome.get(chave) ?? { nome, nome_chave: chave, pagamento: null, bonificacao: null, fontes: {} }
      if (linha.fontes[categoria]) throw new Error(`${aba}: nome repetido no bloco de ${categoria}: ${nome}. Revise antes de importar.`)
      const valor = valorPlanilha(row[2])
      if (valor === null) avisos.push(`${aba}!C${i + 1}: valor em branco para ${nome}.`)
      linha[categoria] = valor
      linha.fontes[categoria] = `${aba}!C${i + 1}`
      porNome.set(chave, linha)
    }
    if (!competencia || !porNome.size) continue
    const linhas = [...porNome.values()].filter(l => l.pagamento !== null || l.bonificacao !== null)
    abas.push({ aba, competencia, etapa, linhas, avisos })
  }
  if (!abas.length) throw new Error("Nenhuma aba com os blocos PAGAMENTO e BONIFICAÇÃO foi encontrada.")
  return abas
}

export function totaisEmpresa(linhas: Pick<LinhaEmpresa, "pagamento" | "bonificacao">[]) {
  const pagamento = linhas.reduce((s, l) => s + Math.round((l.pagamento ?? 0) * 100), 0)
  const bonificacao = linhas.reduce((s, l) => s + Math.round((l.bonificacao ?? 0) * 100), 0)
  return { pagamento: pagamento / 100, bonificacao: bonificacao / 100, total: (pagamento + bonificacao) / 100 }
}

export type SelecaoAba = { aba: string; competencia: string }
export function selecionarAbas(abas: AbaEmpresa[], selecao: SelecaoAba[]) {
  if (!selecao.length) throw new Error("Selecione pelo menos uma aba.")
  const chaves = new Set<string>()
  return selecao.map(s => {
    const aba = abas.find(a => a.aba === s.aba)
    if (!aba || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(s.competencia)) throw new Error("Aba ou competência inválida.")
    const chave = `${s.competencia}|${aba.etapa}`
    if (chaves.has(chave)) throw new Error(`Selecione uma única versão de ${s.competencia} (${aba.etapa}).`)
    chaves.add(chave)
    return { ...aba, competencia: s.competencia }
  })
}
