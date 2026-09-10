"use server"

import { requireUser } from "@maza/auth/server"
import { createServiceClient } from "@maza/db/supabase/server"
import { normalizeDescricao } from "@/lib/financeiro/normalizeDescricao"

// unit_id conhecidos — únicas duas units operacionais do grupo (ver
// sql/026_cmv_bootstrap.sql). Yoshimori é salão, IKY é delivery: a unidade
// já define o canal de receita, não precisa de outra coluna pra isso.
const YOSHIMORI_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909c"
const IKY_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909b"

const CONTA_RECEITA_POR_UNIDADE: Record<string, string> = {
  [YOSHIMORI_UNIT_ID]: "1.01",
  [IKY_UNIT_ID]: "1.02",
}

export type GerarLancamentosResultado = { ok: boolean; inseridos: number; error?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllPaginado(buildQuery: (from: number, to: number) => any): Promise<any[]> {
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
  unitId: string,
  competencia: string
): Promise<GerarLancamentosResultado> {
  try {
    await requireUser()
    const supabase = createServiceClient()
    if (!supabase) return { ok: false, inseridos: 0, error: "Sem conexão com banco" }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
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
  unitId: string,
  competencia: string
): Promise<GerarLancamentosResultado> {
  try {
    await requireUser()
    const contaReceita = CONTA_RECEITA_POR_UNIDADE[unitId]
    if (!contaReceita) {
      return { ok: false, inseridos: 0, error: `Unidade ${unitId} sem canal de receita mapeado (só Yoshimori/IKY)` }
    }

    const supabase = createServiceClient()
    if (!supabase) return { ok: false, inseridos: 0, error: "Sem conexão com banco" }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
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
  unitId: string,
  competencia: string
): Promise<GerarLancamentosResultado> {
  try {
    await requireUser()
    const supabase = createServiceClient()
    if (!supabase) return { ok: false, inseridos: 0, error: "Sem conexão com banco" }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { inicio, fim } = competenciaRange(competencia)

    const titulos = await fetchAllPaginado((from, to) =>
      db.from("titulos_a_pagar")
        .select("id,fantasia_fornecedor,razao_fornecedor,cnpj_cpf_fornecedor,descricao_c_gerencial,v_titulo,d_competencia,d_vencimento,d_lancamento")
        .eq("unit_id", unitId)
        .gte("d_competencia", inicio)
        .lt("d_competencia", fim)
        .range(from, to)
    ) as Array<{
      id: string; fantasia_fornecedor: string | null; razao_fornecedor: string | null
      cnpj_cpf_fornecedor: string | null; descricao_c_gerencial: string | null
      v_titulo: number | null; d_competencia: string | null; d_vencimento: string | null; d_lancamento: string | null
    }>

    if (titulos.length === 0) {
      await deleteEscopo(db, "titulo", unitId, inicio)
      return { ok: true, inseridos: 0 }
    }

    // Regras de classificação: cnpj exato > nome contém > descrição contém,
    // dentro de cada tipo respeita a prioridade escolhida na tela.
    const TIPO_RANK: Record<string, number> = { fornecedor_cnpj: 0, fornecedor_nome: 1, descricao_contem: 2 }
    const regras = (await fetchAllPaginado((from, to) =>
      db.from("regras_classificacao")
        .select("unit_id,tipo,padrao,conta_codigo,prioridade")
        .or(`unit_id.is.null,unit_id.eq.${unitId}`)
        .range(from, to)
    ) as Array<{ unit_id: string | null; tipo: string; padrao: string; conta_codigo: string; prioridade: number }>)
      .sort((a, b) => ((TIPO_RANK[a.tipo] ?? 99) - (TIPO_RANK[b.tipo] ?? 99)) || (a.prioridade - b.prioridade))

    function classificar(t: typeof titulos[number]): string {
      const nome = (t.fantasia_fornecedor ?? t.razao_fornecedor ?? "").toUpperCase()
      for (const r of regras) {
        const padrao = r.padrao.toUpperCase()
        if (r.tipo === "fornecedor_cnpj" && t.cnpj_cpf_fornecedor && t.cnpj_cpf_fornecedor === r.padrao) return r.conta_codigo
        if (r.tipo === "fornecedor_nome" && nome && nome.includes(padrao)) return r.conta_codigo
        // titulos_a_pagar não tem coluna de descrição livre além de
        // descricao_c_gerencial (100% nula) — "descricao_contem" cai no
        // mesmo campo de nome do fornecedor por falta de outro texto.
        if (r.tipo === "descricao_contem" && nome && nome.includes(padrao)) return r.conta_codigo
      }
      return "9.99"
    }

    // Candidatas a NF-e: nfe_documentos (nível de nota, não de item) da
    // mesma unidade, entrada, dentro de uma janela generosa de data — o
    // filtro real de ±5 dias e ±1% é aplicado por título abaixo.
    const janelaInicio = new Date(inicio); janelaInicio.setDate(janelaInicio.getDate() - 10)
    const janelaFim = new Date(fim); janelaFim.setDate(janelaFim.getDate() + 10)
    const notasCandidatas = await fetchAllPaginado((from, to) =>
      db.from("nfe_documentos")
        .select("chave,emitente_nome,valor_total,emissao")
        .eq("unit_id", unitId)
        .eq("direcao", "entrada")
        .eq("cancelada", false)
        .gte("emissao", janelaInicio.toISOString())
        .lt("emissao", janelaFim.toISOString())
        .range(from, to)
    ) as Array<{ chave: string; emitente_nome: string | null; valor_total: number; emissao: string }>

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lancamentosRows: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sugestoesRows: any[] = []

    for (const t of titulos) {
      const nomeFornecedor = t.fantasia_fornecedor ?? t.razao_fornecedor ?? null
      const dataTitulo = t.d_vencimento ?? t.d_lancamento ?? t.d_competencia ?? inicio
      const valorTitulo = Math.abs(Number(t.v_titulo ?? 0))

      lancamentosRows.push({
        unit_id: unitId,
        data: dataTitulo,
        competencia: inicio,
        conta_codigo: classificar(t),
        valor: valorTitulo,
        origem: "titulo",
        origem_id: t.id,
        descricao: null,
        fornecedor_cnpj: t.cnpj_cpf_fornecedor,
        fornecedor_nome: nomeFornecedor,
        produto_id: null,
        reconciliado: false,
      })

      if (!nomeFornecedor || valorTitulo === 0) continue
      const dataTituloMs = new Date(dataTitulo).getTime()

      let melhor: { chave: string; score: number; valorNfe: number; dias: number } | null = null
      for (const nota of notasCandidatas) {
        const diffValor = Math.abs(nota.valor_total - valorTitulo) / Math.max(valorTitulo, 0.01)
        if (diffValor > 0.01) continue
        const dias = Math.round(Math.abs(new Date(nota.emissao).getTime() - dataTituloMs) / 86_400_000)
        if (dias > 5) continue
        const score = similaridadeNome(nomeFornecedor, nota.emitente_nome ?? "")
        if (!melhor || score > melhor.score || (score === melhor.score && dias < melhor.dias)) {
          melhor = { chave: nota.chave, score, valorNfe: nota.valor_total, dias }
        }
      }

      if (melhor) {
        sugestoesRows.push({
          unit_id: unitId,
          titulo_id: t.id,
          chave_nfe: melhor.chave,
          score: Math.round(melhor.score * 100) / 100,
          valor_titulo: valorTitulo,
          valor_nfe: melhor.valorNfe,
          dias_diferenca: melhor.dias,
        })
      }
    }

    await deleteEscopo(db, "titulo", unitId, inicio)
    await inserirLancamentos(db, lancamentosRows)

    // Sugestões: upsert por (titulo_id, chave_nfe) — não sobrescreve
    // decisão humana (confirmada/rejeitada) já registrada.
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

// Projeta dre_folha em lançamentos de mão de obra. tipo INTERNO e CLT vão
// os dois pra 4.01 (custo_total é o total já fechado da linha — CLT é
// vínculo formal, não é "extra/freelancer", então NÃO vai pra 4.04, apesar
// do pedido original: essa conta ficaria com 37% da folha classificada como
// avulsa quando é folha normal). fgts_mes > 0 vai pra 4.02. 4.03/4.04/4.05
// ficam vazios por ora — abrir isso exigiria parsear as descrições dentro
// de verbas (jsonb), que têm grafia inconsistente.
export async function gerarLancamentosFolha(
  unitId: string,
  competencia: string
): Promise<GerarLancamentosResultado> {
  try {
    await requireUser()
    const supabase = createServiceClient()
    if (!supabase) return { ok: false, inseridos: 0, error: "Sem conexão com banco" }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const comp = competencia.slice(0, 7) // dre_folha.competencia é texto "YYYY-MM"
    const { inicio } = competenciaRange(competencia)

    const linhas = await fetchAllPaginado((from, to) =>
      db.from("dre_folha")
        .select("id,nome,tipo,custo_total,fgts_mes")
        .eq("unit_id", unitId)
        .eq("competencia", comp)
        .range(from, to)
    ) as Array<{ id: number; nome: string | null; tipo: string | null; custo_total: number | null; fgts_mes: number | null }>

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = []
    for (const l of linhas) {
      const salario = Math.abs(Number(l.custo_total ?? 0))
      if (salario > 0) {
        rows.push({
          unit_id: unitId,
          data: inicio,
          competencia: inicio,
          conta_codigo: "4.01",
          valor: salario,
          origem: "folha",
          origem_id: `${l.id}:salario`,
          descricao: l.nome ? `Folha — ${l.nome}` : null,
          fornecedor_cnpj: null,
          fornecedor_nome: null,
          produto_id: null,
          reconciliado: false,
        })
      }
      const fgts = Number(l.fgts_mes ?? 0)
      if (fgts > 0) {
        rows.push({
          unit_id: unitId,
          data: inicio,
          competencia: inicio,
          conta_codigo: "4.02",
          valor: fgts,
          origem: "folha",
          origem_id: `${l.id}:fgts`,
          descricao: l.nome ? `FGTS — ${l.nome}` : null,
          fornecedor_cnpj: null,
          fornecedor_nome: null,
          produto_id: null,
          reconciliado: false,
        })
      }
    }

    await deleteEscopo(db, "folha", unitId, inicio)
    await inserirLancamentos(db, rows)

    return { ok: true, inseridos: rows.length }
  } catch (e) {
    return { ok: false, inseridos: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

export type GerarRazaoResultado = {
  ok: boolean
  nfeEntrada: GerarLancamentosResultado
  titulos: GerarLancamentosResultado
  folha: GerarLancamentosResultado
  receita: GerarLancamentosResultado
  error?: string
}

// Roda as quatro projeções pra uma unidade/competência, nessa ordem —
// títulos depois de NF-e não importa pra dedup (isso agora é sugestão, não
// exclusão automática), mas mantém a ordem estável do pedido original.
export async function gerarRazao(unitId: string, competencia: string): Promise<GerarRazaoResultado> {
  const nfeEntrada = await gerarLancamentosNfeEntrada(unitId, competencia)
  const titulos = await gerarLancamentosTitulos(unitId, competencia)
  const folha = await gerarLancamentosFolha(unitId, competencia)
  const receita = await gerarLancamentosReceita(unitId, competencia)
  const ok = nfeEntrada.ok && titulos.ok && folha.ok && receita.ok
  return { ok, nfeEntrada, titulos, folha, receita }
}
