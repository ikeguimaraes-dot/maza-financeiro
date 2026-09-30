import type { LinhaEmpresa, EtapaFolha } from "./planilha"

export type RegistroEmpresa = LinhaEmpresa & { id: string; etapa: EtapaFolha; arquivo: string }
export type LinhaPainelEmpresa = LinhaEmpresa & { id: string; arquivo: string; vale: number | null; fonteVale: string }

/** Input already scoped to one unit/month. Keep unmatched spellings separate. */
export function montarPainelEmpresa(registros: RegistroEmpresa[]): LinhaPainelEmpresa[] {
  const nomes = new Map<string, LinhaPainelEmpresa>()
  for (const r of registros) {
    const linha = nomes.get(r.nome_chave) ?? {
      id: r.nome_chave, nome: r.nome, nome_chave: r.nome_chave,
      pagamento: null, bonificacao: null, vale: null, fontes: {}, fonteVale: "", arquivo: r.arquivo,
    }
    if (r.etapa === "mensal") {
      linha.pagamento = r.pagamento
      linha.bonificacao = r.bonificacao
      linha.fontes = r.fontes
    } else {
      linha.vale = (Math.round((r.pagamento ?? 0) * 100) + Math.round((r.bonificacao ?? 0) * 100)) / 100
      linha.fonteVale = [r.fontes.pagamento, r.fontes.bonificacao].filter(Boolean).join(" + ")
    }
    linha.arquivo = [...new Set([linha.arquivo, r.arquivo])].join(", ")
    nomes.set(r.nome_chave, linha)
  }
  return [...nomes.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

export function totalizarPainelEmpresa(linhas: (Pick<LinhaEmpresa, "pagamento" | "bonificacao"> & { vale?: number | null })[]) {
  const soma = (campo: "pagamento" | "bonificacao" | "vale") => linhas.reduce((s, l) => s + Math.round((l[campo] ?? 0) * 100), 0)
  const pagamento = soma("pagamento"), bonificacao = soma("bonificacao"), vale = soma("vale")
  return { pagamento: pagamento / 100, bonificacao: bonificacao / 100, vale: vale / 100, total: (pagamento + bonificacao) / 100 }
}
