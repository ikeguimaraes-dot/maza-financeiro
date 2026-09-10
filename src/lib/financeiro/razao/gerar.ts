// Lógica pura de geração do razão — recebe o client Supabase como parâmetro
// em vez de criar o seu próprio, pra ser chamável tanto pela Server Action
// (src/app/financeiro/razao/actions.ts, que faz requireUser() +
// createServiceClient() por cima) quanto por scripts/regerar-razao.ts (CLI,
// sem sessão de app) — mesmo código nos dois casos, sem duplicar regra de
// classificação.
import { normalizeDescricao } from "@/lib/financeiro/normalizeDescricao"

// unit_id conhecidos — únicas duas units operacionais do grupo (ver
// sql/026_cmv_bootstrap.sql). Yoshimori é salão, IKY é delivery: a unidade
// já define o canal de receita, não precisa de outra coluna pra isso.
export const YOSHIMORI_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909c"
export const IKY_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909b"

const CONTA_RECEITA_POR_UNIDADE: Record<string, string> = {
  [YOSHIMORI_UNIT_ID]: "1.01",
  [IKY_UNIT_ID]: "1.02",
}

export type GerarLancamentosResultado = { ok: boolean; inseridos: number; error?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllPaginado(buildQuery: (from: number, to: number) => any): Promise<any[]> {
  const pageSize = 1000
  const result: any[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const page = data ?? []
    result.push(...page)
    if (page.length < pageSize) return result
  }
}

// "competencia" sempre chega como o primeiro dia do mês, ex. "2026-06-01".
function competenciaRange(competencia: string): { mes: number; ano: number; inicio: string; fim: string } {
  const ano = Number(competencia.slice(0, 4))
  const mes = Number(competencia.slice(5, 7))
  const inicio = `${competencia.slice(0, 7)}-01`
  const fim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`
  return { mes, ano, inicio, fim }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteEscopo(db: any, origem: string, unitId: string, competencia: string): Promise<void> {
  const { error } = await db.from("lancamentos").delete()
    .eq("origem", origem).eq("unit_id", unitId).eq("competencia", competencia)
  if (error) throw new Error(error.message)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function inserirLancamentos(db: any, rows: any[]): Promise<void> {
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("lancamentos").insert(rows.slice(i, i + CHUNK))
    if (error) throw new Error(error.message)
  }
}

// Projeta produtos_relatorio (compras por XML) em lançamentos de CMV.
// Classificação automática pelo capítulo do NCM (2 primeiros dígitos de
// tipo_item) contra plano_contas.ncm_capitulos — sem match cai em 9.99.
export async function gerarLancamentosNfeEntrada(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  unitId: string,
  competencia: string
): Promise<GerarLancamentosResultado> {
  try {
    const { mes, ano, inicio } = competenciaRange(competencia)

    const linhas = await fetchAllPaginado((from, to) =>
      db.from("produtos_relatorio")
        .select("chave_nfe,item_codigo,fornecedor_codigo,fornecedor_nome,tipo_item,dt_emissao,v_total_danfe,v_custo_total")
        .eq("unit_id", unitId)
        .eq("mes_lancamento", mes)
        .eq("ano_lancamento", ano)
        .eq("direcao_nfe", "entrada")
        .not("chave_nfe", "is", null)
        .range(from, to)
    ) as Array<{
      chave_nfe: string; item_codigo: string | null; fornecedor_codigo: string | null
      fornecedor_nome: string | null; tipo_item: string | null; dt_emissao: string | null
      v_total_danfe: number | null; v_custo_total: number | null
    }>

    // Bonificação (item de brinde/promocional) não é compra real.
    const validas = linhas.filter(r =>
      r.item_codigo && r.v_total_danfe !== 0 && r.v_total_danfe !== 0.01
    )

    const cnpjs = [...new Set(validas.map(r => r.fornecedor_codigo).filter((v): v is string => Boolean(v)))]
    const itemCodigos = [...new Set(validas.map(r => r.item_codigo!).filter(Boolean))]
    const produtoIdPorPar = new Map<string, string>()
    if (cnpjs.length > 0 && itemCodigos.length > 0) {
      const deparaRows = await fetchAllPaginado((from, to) =>
        db.from("produtos_depara")
          .select("fornecedor_cnpj,item_codigo,produto_id")
          .in("fornecedor_cnpj", cnpjs)
          .in("item_codigo", itemCodigos)
          .range(from, to)
      ) as Array<{ fornecedor_cnpj: string; item_codigo: string; produto_id: string | null }>
      for (const d of deparaRows) {
        if (d.produto_id) produtoIdPorPar.set(`${d.fornecedor_cnpj}|${d.item_codigo}`, d.produto_id)
      }
    }

    const planoContas = await fetchAllPaginado((from, to) =>
      db.from("plano_contas").select("codigo,ncm_capitulos").not("ncm_capitulos", "is", null).range(from, to)
    ) as Array<{ codigo: string; ncm_capitulos: string[] | null }>
    const capituloParaConta = new Map<string, string>()
    for (const p of planoContas) {
      for (const capitulo of p.ncm_capitulos ?? []) capituloParaConta.set(capitulo, p.codigo)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = validas.map(r => {
      const capitulo = r.tipo_item ? r.tipo_item.slice(0, 2) : null
      const contaCodigo = (capitulo && capituloParaConta.get(capitulo)) || "9.99"
      const par = r.fornecedor_codigo ? `${r.fornecedor_codigo}|${r.item_codigo}` : null
      return {
        unit_id: unitId,
        data: (r.dt_emissao ?? inicio).slice(0, 10),
        competencia: inicio,
        conta_codigo: contaCodigo,
        valor: Math.abs(Number(r.v_custo_total ?? 0)),
        origem: "nfe_entrada",
        origem_id: `${r.chave_nfe}:${r.item_codigo}`,
        descricao: null,
        fornecedor_cnpj: r.fornecedor_codigo,
        fornecedor_nome: r.fornecedor_nome,
        produto_id: par ? produtoIdPorPar.get(par) ?? null : null,
        reconciliado: false,
      }
    })

    await deleteEscopo(db, "nfe_entrada", unitId, inicio)
    await inserirLancamentos(db, rows)

    return { ok: true, inseridos: rows.length }
  } catch (e) {
    return { ok: false, inseridos: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

// Projeta receita_dias (+ receita_cancelamentos) em lançamentos de receita e
// dedução. Gorjeta é repasse, não receita — nenhum lançamento gerado pra ela.
// Taxa de cartão (2.02) fica de fora: receita_pagamentos só tem
// forma/valor_fechado/valor_recebido/diferenca, sem coluna de taxa — estimar
// seria inventar dado. As colunas custo/cmv_pct de receita_dias são
// ignoradas (inválidas: já vimos R$965 de custo pra R$441mil de receita) —
// a única fonte de CMV é a NF-e, via gerarLancamentosNfeEntrada.
export async function gerarLancamentosReceita(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  unitId: string,
  competencia: string
): Promise<GerarLancamentosResultado> {
  try {
    const contaReceita = CONTA_RECEITA_POR_UNIDADE[unitId]
    if (!contaReceita) {
      return { ok: false, inseridos: 0, error: `Unidade ${unitId} sem canal de receita mapeado (só Yoshimori/IKY)` }
    }

    const { inicio, fim } = competenciaRange(competencia)

    const dias = await fetchAllPaginado((from, to) =>
      db.from("receita_dias")
        .select("id,data,receita_bruta,desconto")
        .eq("unit_id", unitId)
        .gte("data", inicio)
        .lt("data", fim)
        .range(from, to)
    ) as Array<{ id: string; data: string; receita_bruta: number | null; desconto: number | null }>

    const diaIds = dias.map(d => d.id)
    const cancelamentoPorDia = new Map<string, number>()
    if (diaIds.length > 0) {
      const cancelamentos = await fetchAllPaginado((from, to) =>
        db.from("receita_cancelamentos")
          .select("workday_id_fk,consumo")
          .in("workday_id_fk", diaIds)
          .range(from, to)
      ) as Array<{ workday_id_fk: string; consumo: number | null }>
      for (const c of cancelamentos) {
        cancelamentoPorDia.set(c.workday_id_fk, (cancelamentoPorDia.get(c.workday_id_fk) ?? 0) + Number(c.consumo ?? 0))
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = []
    for (const d of dias) {
      rows.push({
        unit_id: unitId,
        data: d.data,
        competencia: inicio,
        conta_codigo: contaReceita,
        valor: Math.abs(Number(d.receita_bruta ?? 0)),
        origem: "receita",
        origem_id: `${unitId}:${d.id}:bruta`,
        descricao: "Receita bruta do dia",
        fornecedor_cnpj: null,
        fornecedor_nome: null,
        produto_id: null,
        reconciliado: false,
      })

      const deducao = Number(d.desconto ?? 0) + (cancelamentoPorDia.get(d.id) ?? 0)
      if (deducao > 0) {
        rows.push({
          unit_id: unitId,
          data: d.data,
          competencia: inicio,
          conta_codigo: "2.01",
          valor: deducao,
          origem: "receita",
          origem_id: `${unitId}:${d.id}:deducao`,
          descricao: "Descontos e cancelamentos do dia",
          fornecedor_cnpj: null,
          fornecedor_nome: null,
          produto_id: null,
          reconciliado: false,
        })
      }
    }

    await deleteEscopo(db, "receita", unitId, inicio)
    await inserirLancamentos(db, rows)

    return { ok: true, inseridos: rows.length }
  } catch (e) {
    return { ok: false, inseridos: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Similaridade de nome (bigramas) — mesmo princípio do catálogo de
// produtos (FASE 2), só pra sugerir, nunca pra decidir sozinha ────────────

function bigramas(s: string): Set<string> {
  const norm = normalizeDescricao(s)
  const set = new Set<string>()
  for (let i = 0; i < norm.length - 1; i++) set.add(norm.slice(i, i + 2))
  return set
}

function similaridadeNome(a: string, b: string): number {
  const setA = bigramas(a)
  const setB = bigramas(b)
  if (setA.size === 0 || setB.size === 0) return 0
  let intersecao = 0
  for (const bg of setA) if (setB.has(bg)) intersecao++
  return (2 * intersecao) / (setA.size + setB.size)
}

// Projeta titulos_a_pagar em lançamentos de despesa. NÃO faz dedup
// automático contra NF-e: titulos_a_pagar.cnpj_cpf_fornecedor está 100%
// nulo (confirmado nas 2.000 linhas), então uma correspondência por CNPJ
// exato — a única forma seguramente confiável — não existe aqui. Casar por
// nome livre é arriscado: falso positivo apaga uma despesa real e ninguém
// percebe. Em vez disso, toda candidata plausível (mesmo valor ±1%, mesma
// data ±5 dias) vai pra reconciliacoes_sugeridas como sugestão — um humano
// confirma na tela da Fase 7. Só título com sugestão status='confirmada'
// deixa de gerar lançamento aqui.
export async function gerarLancamentosTitulos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  unitId: string,
  competencia: string
): Promise<GerarLancamentosResultado> {
  try {
    const { inicio, fim } = competenciaRange(competencia)

    // FASE 7 PASSO 5: fonte é titulos_a_pagar origem in (nf_pedidos,
    // contas_pagar) — a origem antiga ('PLANILHA MAZA', ~2.000 linhas de
    // fonte desconhecida) é ignorada por design, não só por estar apagada.
    // Competência: usa d_competencia; se nula, cai no mês de d_vencimento.
    const titulos = await fetchAllPaginado((from, to) =>
      db.from("titulos_a_pagar")
        .select("id,fantasia_fornecedor,razao_fornecedor,cnpj_cpf_fornecedor,c_gerencial,descricao_c_gerencial,v_titulo,d_competencia,d_vencimento,d_lancamento,n_nota_fiscal,origem")
        .eq("unit_id", unitId)
        .in("origem", ["nf_pedidos", "contas_pagar"])
        .or(`d_competencia.eq.${inicio},and(d_competencia.is.null,d_vencimento.gte.${inicio},d_vencimento.lt.${fim})`)
        .range(from, to)
    ) as Array<{
      id: string; fantasia_fornecedor: string | null; razao_fornecedor: string | null
      cnpj_cpf_fornecedor: string | null; c_gerencial: string | null; descricao_c_gerencial: string | null
      v_titulo: number | null; d_competencia: string | null; d_vencimento: string | null; d_lancamento: string | null
      n_nota_fiscal: string | null; origem: string
    }>

    if (titulos.length === 0) {
      await deleteEscopo(db, "titulo", unitId, inicio)
      return { ok: true, inseridos: 0 }
    }

    // Regras: categoria_gerencial (match exato contra c_gerencial) tem
    // prioridade — é a classificação real das planilhas novas. Os tipos
    // fuzzy antigos (cnpj/nome/descrição) seguem como fallback pra título
    // sem categoria.
    const TIPO_RANK: Record<string, number> = { categoria_gerencial: -1, fornecedor_cnpj: 0, fornecedor_nome: 1, descricao_contem: 2 }
    const regras = (await fetchAllPaginado((from, to) =>
      db.from("regras_classificacao")
        .select("unit_id,tipo,padrao,conta_codigo,prioridade")
        .or(`unit_id.is.null,unit_id.eq.${unitId}`)
        .range(from, to)
    ) as Array<{ unit_id: string | null; tipo: string; padrao: string; conta_codigo: string; prioridade: number }>)
      .sort((a, b) => ((TIPO_RANK[a.tipo] ?? 99) - (TIPO_RANK[b.tipo] ?? 99)) || (a.prioridade - b.prioridade))

    function classificar(t: typeof titulos[number]): string {
      const nome = (t.fantasia_fornecedor ?? t.razao_fornecedor ?? "").toUpperCase()
      const categoria = (t.c_gerencial ?? "").toUpperCase()
      for (const r of regras) {
        const padrao = r.padrao.toUpperCase()
        if (r.tipo === "categoria_gerencial" && categoria && categoria === padrao) return r.conta_codigo
        if (r.tipo === "fornecedor_cnpj" && t.cnpj_cpf_fornecedor && t.cnpj_cpf_fornecedor === r.padrao) return r.conta_codigo
        if (r.tipo === "fornecedor_nome" && nome && nome.includes(padrao)) return r.conta_codigo
        if (r.tipo === "descricao_contem" && nome && nome.includes(padrao)) return r.conta_codigo
      }
      return "9.99"
    }

    // Candidatas a NF-e: nfe_documentos (nível de nota) da mesma unidade,
    // entrada, todo o histórico — o match é por NÚMERO exato, não por
    // proximidade de data, então não precisa de janela. nfe_documentos não
    // tem coluna de competência (só "emissao", a data real da nota); a
    // competência RECONHECIDA internamente é a de produtos_relatorio
    // (mes_lancamento/ano_lancamento, mesma fonte usada em
    // gerarLancamentosNfeEntrada). Sem esse cruzamento, duas notas com o
    // mesmo número em meses diferentes (ex. maio e junho) colidiam: o
    // título de maio casava com a nota de junho, sumindo do CMV de maio
    // sem culpa nenhuma da nota.
    const notasCandidatas = await fetchAllPaginado((from, to) =>
      db.from("nfe_documentos")
        .select("chave,numero,emitente_nome,valor_total")
        .eq("unit_id", unitId)
        .eq("direcao", "entrada")
        .eq("cancelada", false)
        .not("numero", "is", null)
        .range(from, to)
    ) as Array<{ chave: string; numero: string | null; emitente_nome: string | null; valor_total: number }>
    const notasPorNumero = new Map<string, typeof notasCandidatas>()
    for (const nota of notasCandidatas) {
      const arr = notasPorNumero.get(nota.numero!) ?? []
      arr.push(nota)
      notasPorNumero.set(nota.numero!, arr)
    }

    const produtosCompetencia = await fetchAllPaginado((from, to) =>
      db.from("produtos_relatorio")
        .select("chave_nfe,mes_lancamento,ano_lancamento")
        .eq("unit_id", unitId)
        .not("chave_nfe", "is", null)
        .range(from, to)
    ) as Array<{ chave_nfe: string; mes_lancamento: number; ano_lancamento: number }>
    const competenciaPorChave = new Map<string, string>()
    for (const p of produtosCompetencia) {
      competenciaPorChave.set(p.chave_nfe, `${p.ano_lancamento}-${String(p.mes_lancamento).padStart(2, "0")}-01`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lancamentosRows: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sugestoesRows: any[] = []

    for (const t of titulos) {
      const categoria = (t.c_gerencial ?? "").toUpperCase()
      // CONTAS_A_PAGAR duplica ALIMENTOS/BEBIDAS que já vêm por NF_PEDIDOS
      // (mesma compra, dois ângulos) — ignora pra não contar duas vezes.
      if (t.origem === "contas_pagar" && (categoria === "ALIMENTOS" || categoria === "BEBIDAS")) continue

      const nomeFornecedor = t.fantasia_fornecedor ?? t.razao_fornecedor ?? null
      const dataTitulo = t.d_vencimento ?? t.d_lancamento ?? t.d_competencia ?? inicio
      const valorTitulo = Math.abs(Number(t.v_titulo ?? 0))

      // Dedup: mesmo número de NF + fornecedor por similaridade + valor
      // ±2% + mesma competência → já foi gerado via XML (com detalhe por
      // item) — não duplica. Sem a competência bater, número igual em mês
      // diferente não é a mesma compra.
      let matchConfirmado: { chave: string; score: number; valorNfe: number } | null = null
      if (t.n_nota_fiscal) {
        const candidatas = notasPorNumero.get(t.n_nota_fiscal) ?? []
        for (const nota of candidatas) {
          if (competenciaPorChave.get(nota.chave) !== inicio) continue
          const diffValor = Math.abs(nota.valor_total - valorTitulo) / Math.max(valorTitulo, 0.01)
          if (diffValor > 0.02) continue
          const score = similaridadeNome(nomeFornecedor ?? "", nota.emitente_nome ?? "")
          if (!matchConfirmado || score > matchConfirmado.score) {
            matchConfirmado = { chave: nota.chave, score, valorNfe: nota.valor_total }
          }
        }
      }

      if (matchConfirmado) {
        sugestoesRows.push({
          unit_id: unitId, titulo_id: t.id, chave_nfe: matchConfirmado.chave,
          score: Math.round(matchConfirmado.score * 100) / 100,
          valor_titulo: valorTitulo, valor_nfe: matchConfirmado.valorNfe,
          dias_diferenca: 0, status: "confirmada",
        })
        continue // já coberto pela NF-e — não gera lançamento
      }

      lancamentosRows.push({
        unit_id: unitId,
        data: dataTitulo,
        competencia: inicio,
        conta_codigo: classificar(t),
        valor: valorTitulo,
        origem: "titulo",
        origem_id: t.id,
        descricao: t.descricao_c_gerencial,
        fornecedor_cnpj: t.cnpj_cpf_fornecedor,
        fornecedor_nome: nomeFornecedor,
        produto_id: null,
        reconciliado: false,
      })

      // Tinha número de nota mas não achou XML correspondente — a nota
      // existe, só falta importar o XML. Sinaliza pro Ike.
      if (t.n_nota_fiscal) {
        sugestoesRows.push({
          unit_id: unitId, titulo_id: t.id, chave_nfe: `SEM_XML:${t.n_nota_fiscal}`,
          score: 0, valor_titulo: valorTitulo, valor_nfe: 0, dias_diferenca: 0, status: "sem_xml",
        })
      }
    }

    await deleteEscopo(db, "titulo", unitId, inicio)
    await inserirLancamentos(db, lancamentosRows)

    for (let i = 0; i < sugestoesRows.length; i += 500) {
      const chunk = sugestoesRows.slice(i, i + 500)
      const { error } = await db.from("reconciliacoes_sugeridas")
        .upsert(chunk, { onConflict: "titulo_id,chave_nfe", ignoreDuplicates: true })
      if (error) throw new Error(error.message)
    }

    return { ok: true, inseridos: lancamentosRows.length }
  } catch (e) {
    return { ok: false, inseridos: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

// Classificação de rubrica PROVENTO → conta, dada pelo Ike a partir dos
// extratos reais Domínio (IKY Restaurantes e MZ Delivery, jun-ago/2026).
// Qualquer rubrica de provento fora desta lista cai em 9.99 (reportado, não
// bloqueia). Rubricas de DESCONTO nunca geram lançamento — são retenção
// sobre o bruto ou movimentação de líquido, não custo adicional — exceto a
// 843 (INSS EMPREGADOR: INSS patronal sobre pró-labore do diretor, é custo
// real da empresa apesar de aparecer como "D" no extrato).
const RUBRICA_PARA_CONTA: Record<number, string> = {
  // 4.01 Salários
  8781: "4.01", 9180: "4.01", 19: "4.01", 8870: "4.01", 200: "4.01",
  434: "4.01", 458: "4.01", 626: "4.01", 250: "4.01", 854: "4.01",
  8125: "4.01", 204: "4.01", 990: "4.01", 8130: "4.01", 9755: "4.01",
  // 4.06 Férias e 13º
  29: "4.06", 931: "4.06", 805: "4.06", 806: "4.06", 815: "4.06",
  816: "4.06", 8783: "4.06", 8169: "4.06", 940: "4.06", 8112: "4.06",
  8189: "4.06", 8550: "4.06", 8551: "4.06", 8552: "4.06",
  // 4.07 Pró-labore
  100: "4.07",
}
const RUBRICA_DESCONTO_ENCARGO = 843 // INSS EMPREGADOR — única DESCONTO que gera lançamento (4.02)

// Projeta payroll_extrato_dominio_linha (+ FGTS do rodapé de
// payroll_extrato_dominio_competencia) em lançamentos de mão de obra.
// Fonte EXCLUSIVA — nunca lê dre_folha (dado cross-wired entre unidades,
// substituído nesta fase). Classifica estritamente por código de rubrica.
export async function gerarLancamentosFolha(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  unitId: string,
  competencia: string
): Promise<GerarLancamentosResultado> {
  try {
    const comp = competencia.slice(0, 7) // payroll_extrato_dominio_* usa texto "YYYY-MM"
    const { inicio } = competenciaRange(competencia)

    const linhas = await fetchAllPaginado((from, to) =>
      db.from("payroll_extrato_dominio_linha")
        .select("cod_colaborador,rubrica_codigo,natureza,valor")
        .eq("unit_id", unitId)
        .eq("competencia", comp)
        .range(from, to)
    ) as Array<{ cod_colaborador: number; rubrica_codigo: number; natureza: string; valor: number }>

    const { data: competenciaRow, error: competenciaError } = await db
      .from("payroll_extrato_dominio_competencia")
      .select("valor_fgts,valor_fgts_rescisorio")
      .eq("unit_id", unitId)
      .eq("competencia", comp)
      .maybeSingle()
    if (competenciaError) throw new Error(competenciaError.message)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = []
    for (const l of linhas) {
      const valor = Math.abs(Number(l.valor ?? 0))
      if (valor === 0) continue

      const contaCodigo = l.natureza === "DESCONTO"
        ? (l.rubrica_codigo === RUBRICA_DESCONTO_ENCARGO ? "4.02" : null)
        : (RUBRICA_PARA_CONTA[l.rubrica_codigo] ?? "9.99")
      if (!contaCodigo) continue // desconto que não é 843: retenção/movimentação, não gera lançamento

      rows.push({
        unit_id: unitId,
        data: inicio,
        competencia: inicio,
        conta_codigo: contaCodigo,
        valor,
        origem: "folha",
        // origem_id precisa ser único por (origem, conta_codigo) globalmente —
        // cod_colaborador é um inteiro pequeno atribuído por empresa no
        // Domínio, colide entre unidades sem o prefixo unitId.
        origem_id: `${unitId}:${comp}:${l.cod_colaborador}:${l.rubrica_codigo}`,
        descricao: `Rubrica ${l.rubrica_codigo}`,
        fornecedor_cnpj: null,
        fornecedor_nome: null,
        produto_id: null,
        reconciliado: false,
      })
    }

    const valorFgts = Number(competenciaRow?.valor_fgts ?? 0)
    if (valorFgts > 0) {
      rows.push({
        unit_id: unitId, data: inicio, competencia: inicio, conta_codigo: "4.02",
        valor: valorFgts, origem: "folha", origem_id: `${unitId}:${comp}:FGTS`,
        descricao: "FGTS do mês", fornecedor_cnpj: null, fornecedor_nome: null,
        produto_id: null, reconciliado: false,
      })
    }
    const valorFgtsRescisorio = Number(competenciaRow?.valor_fgts_rescisorio ?? 0)
    if (valorFgtsRescisorio > 0) {
      rows.push({
        unit_id: unitId, data: inicio, competencia: inicio, conta_codigo: "4.02",
        valor: valorFgtsRescisorio, origem: "folha", origem_id: `${unitId}:${comp}:FGTS_RESC`,
        descricao: "FGTS rescisório", fornecedor_cnpj: null, fornecedor_nome: null,
        produto_id: null, reconciliado: false,
      })
    }

    await deleteEscopo(db, "folha", unitId, inicio)
    await inserirLancamentos(db, rows)

    return { ok: true, inseridos: rows.length }
  } catch (e) {
    return { ok: false, inseridos: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

const KPIS_COM_META_BASELINE = [
  "receita_liquida", "cmv_compras_pct", "mo_pct", "prime_cost_pct", "ebitda_pct", "clientes", "ticket_medio",
] as const

export type SnapshotResultado = { ok: boolean; error?: string }

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gravarMetasBaseline(db: any, unitId: string, competencia: string): Promise<void> {
  const [ano, mes] = competencia.split("-").map(Number)
  const competenciasAnteriores: string[] = []
  for (let i = 1; i <= 3; i++) {
    const m = mes! - i
    const anoAjustado = m <= 0 ? ano! - 1 : ano!
    const mesAjustado = ((m - 1 + 12) % 12) + 1
    competenciasAnteriores.push(`${anoAjustado}-${String(mesAjustado).padStart(2, "0")}-01`)
  }

  const anteriores = await fetchAllPaginado((from, to) =>
    db.from("kpi_snapshot")
      .select(KPIS_COM_META_BASELINE.join(","))
      .eq("unit_id", unitId)
      .in("competencia", competenciasAnteriores)
      .range(from, to)
  ) as Array<Record<string, number | null>>

  const metasExistentes = await fetchAllPaginado((from, to) =>
    db.from("metas").select("chave,origem")
      .eq("unit_id", unitId).eq("competencia", competencia)
      .range(from, to)
  ) as Array<{ chave: string; origem: string }>
  const jaTemMetaManual = new Set(metasExistentes.filter(m => m.origem === "manual").map(m => m.chave))

  const rows = KPIS_COM_META_BASELINE
    .filter(chave => !jaTemMetaManual.has(chave))
    .map(chave => {
      const valores = anteriores.map(a => a[chave]).filter((v): v is number => v != null)
      if (valores.length === 0) return null
      const media = valores.reduce((s, v) => s + v, 0) / valores.length
      return {
        unit_id: unitId, competencia, chave,
        valor: round2(media), tipo: "absoluto", origem: "baseline",
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (rows.length > 0) {
    const { error } = await db.from("metas").upsert(rows, { onConflict: "unit_id,competencia,chave" })
    if (error) throw new Error(error.message)
  }
}

// Agrega lancamentos → dre_snapshot (por conta) e kpi_snapshot (por unidade
// e competência). Sempre delete+insert do escopo — é projeção, não dado
// digitado, então rodar de novo depois de mudar uma regra de classificação
// (ou de reprocessar o razão) sempre reflete o estado atual.
export async function recalcularSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  unitId: string,
  competencia: string
): Promise<SnapshotResultado> {
  try {
    const { inicio, fim } = competenciaRange(competencia)

    const planoContas = await fetchAllPaginado((from, to) =>
      db.from("plano_contas").select("codigo,grupo").range(from, to)
    ) as Array<{ codigo: string; grupo: string }>
    const grupoPorConta = new Map(planoContas.map(p => [p.codigo, p.grupo]))

    const lancamentos = await fetchAllPaginado((from, to) =>
      db.from("lancamentos").select("conta_codigo,valor,origem,origem_id")
        .eq("unit_id", unitId).eq("competencia", inicio)
        .range(from, to)
    ) as Array<{ conta_codigo: string; valor: number; origem: string; origem_id: string }>

    // ── dre_snapshot: soma por conta ──────────────────────────────────────
    const porConta = new Map<string, { valor: number; qtd: number }>()
    for (const l of lancamentos) {
      const cur = porConta.get(l.conta_codigo) ?? { valor: 0, qtd: 0 }
      cur.valor += Number(l.valor)
      cur.qtd += 1
      porConta.set(l.conta_codigo, cur)
    }

    const { error: delDreError } = await db.from("dre_snapshot").delete().eq("unit_id", unitId).eq("competencia", inicio)
    if (delDreError) throw new Error(delDreError.message)
    if (porConta.size > 0) {
      const dreRows = [...porConta.entries()].map(([conta_codigo, v]) => ({
        unit_id: unitId, competencia: inicio, conta_codigo,
        valor: Math.round(v.valor * 100) / 100, qtd_lancamentos: v.qtd,
      }))
      const { error } = await db.from("dre_snapshot").insert(dreRows)
      if (error) throw new Error(error.message)
    }

    // ── KPIs ────────────────────────────────────────────────────────────
    let receitaBruta = 0, deducao = 0, cmv = 0, maoDeObra = 0, despesaOp = 0
    let financeiro = 0, impostoLucro = 0
    let valor999 = 0, valorTotal = 0
    for (const [conta, v] of porConta) {
      valorTotal += v.valor
      if (conta === "9.99") valor999 += v.valor
      switch (grupoPorConta.get(conta)) {
        case "receita": receitaBruta += v.valor; break
        case "deducao": deducao += v.valor; break
        case "cmv": cmv += v.valor; break
        case "mao_de_obra": maoDeObra += v.valor; break
        case "despesa_operacional": despesaOp += v.valor; break
        case "financeiro": financeiro += v.valor; break
        // imposto_lucro (IRPJ/CSLL) fica de fora do EBITDA e da receita
        // líquida — é imposto sobre o lucro, não dedução de venda. Some só
        // em resultado_liquido, abaixo do EBITDA.
        case "imposto_lucro": impostoLucro += v.valor; break
      }
    }
    const receitaLiquida = receitaBruta - deducao
    const ebitda = receitaLiquida - cmv - maoDeObra - despesaOp
    const resultadoLiquido = ebitda - financeiro - impostoLucro
    const pct = (v: number): number | null => (receitaLiquida > 0 ? v / receitaLiquida : null)
    const temNfe = lancamentos.some(l => l.origem === "nfe_entrada")
    const temFolha = lancamentos.some(l => l.origem === "folha")

    const dias = await fetchAllPaginado((from, to) =>
      db.from("receita_dias").select("clientes")
        .eq("unit_id", unitId).gte("data", inicio).lt("data", fim)
        .range(from, to)
    ) as Array<{ clientes: number | null }>
    const clientes = dias.length > 0 ? dias.reduce((s, d) => s + (d.clientes ?? 0), 0) : null
    // Ticket médio do mês = receita bruta total / clientes totais — evita
    // média de médias diárias, que distorce quando os dias têm volumes bem
    // diferentes.
    const ticketMedio = clientes && clientes > 0 ? receitaBruta / clientes : null
    const cmvPorCliente = clientes && clientes > 0 ? cmv / clientes : null

    const pctClassificado = valorTotal > 0 ? 1 - valor999 / valorTotal : null

    // v_fonte_saude não tem coluna de unidade — é uma leitura global de
    // saúde das fontes de dado, a mesma pras duas units até essa view
    // ganhar um recorte por unidade.
    const fontes = await fetchAllPaginado((from, to) =>
      db.from("v_fonte_saude").select("status_fonte").range(from, to)
    ) as Array<{ status_fonte: string }>
    const fontesTotal = fontes.length
    const fontesOk = fontes.filter(f => f.status_fonte === "viva").length
    const confiancaPct = pctClassificado != null && fontesTotal > 0
      ? 0.6 * pctClassificado + 0.4 * (fontesOk / fontesTotal)
      : null

    // possivel_dupla_contagem: Σ valor dos lançamentos de título desta
    // competência cuja sugestão de reconciliação ainda está pendente.
    const sugestoesPendentes = await fetchAllPaginado((from, to) =>
      db.from("reconciliacoes_sugeridas").select("titulo_id")
        .eq("unit_id", unitId).eq("status", "sugerida")
        .range(from, to)
    ) as Array<{ titulo_id: string }>
    const titulosPendentes = new Set(sugestoesPendentes.map(s => s.titulo_id))
    const possivelDuplaContagem = lancamentos
      .filter(l => l.origem === "titulo" && titulosPendentes.has(l.origem_id))
      .reduce((s, l) => s + Number(l.valor), 0)

    const kpiRow = {
      unit_id: unitId,
      competencia: inicio,
      receita_bruta: round2(receitaBruta),
      receita_liquida: round2(receitaLiquida),
      cmv_compras: round2(cmv),
      mao_de_obra: round2(maoDeObra),
      despesas_operacionais: round2(despesaOp),
      ebitda: round2(ebitda),
      resultado_liquido: round2(resultadoLiquido),
      cmv_compras_pct: pct(cmv),
      mo_pct: pct(maoDeObra),
      prime_cost_pct: pct(cmv + maoDeObra),
      ebitda_pct: pct(ebitda),
      clientes,
      ticket_medio: ticketMedio != null ? round2(ticketMedio) : null,
      cmv_por_cliente: cmvPorCliente != null ? round2(cmvPorCliente) : null,
      tem_nfe: temNfe,
      tem_folha: temFolha,
      pct_classificado: pctClassificado,
      fontes_ok: fontesOk,
      fontes_total: fontesTotal,
      confianca_pct: confiancaPct,
      possivel_dupla_contagem: round2(possivelDuplaContagem),
    }

    const { error: upsertError } = await db.from("kpi_snapshot")
      .upsert(kpiRow, { onConflict: "unit_id,competencia" })
    if (upsertError) throw new Error(upsertError.message)

    await gravarMetasBaseline(db, unitId, inicio)

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export type GerarRazaoResultado = {
  ok: boolean
  nfeEntrada: GerarLancamentosResultado
  titulos: GerarLancamentosResultado
  folha: GerarLancamentosResultado
  receita: GerarLancamentosResultado
  snapshot: SnapshotResultado
  error?: string
}

// Roda as quatro projeções pra uma unidade/competência, nessa ordem —
// títulos depois de NF-e não importa pra dedup (isso agora é sugestão, não
// exclusão automática), mas mantém a ordem estável do pedido original —
// depois recalcula o snapshot.
export async function gerarRazao(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  unitId: string,
  competencia: string
): Promise<GerarRazaoResultado> {
  const nfeEntrada = await gerarLancamentosNfeEntrada(db, unitId, competencia)
  const titulos = await gerarLancamentosTitulos(db, unitId, competencia)
  const folha = await gerarLancamentosFolha(db, unitId, competencia)
  const receita = await gerarLancamentosReceita(db, unitId, competencia)
  const snapshot = await recalcularSnapshot(db, unitId, competencia)
  const ok = nfeEntrada.ok && titulos.ok && folha.ok && receita.ok && snapshot.ok
  return { ok, nfeEntrada, titulos, folha, receita, snapshot }
}
