"use server"

import { createSupabaseServerClient } from "@kph/db/supabase/server"
import { getCurrentUnit } from "@kph/auth/unit"
import { requireUser } from "@kph/auth/server"
import { createServiceClient } from "@kph/db/supabase/server"

export type ProdutoInsert = {
  unit_id: string
  fornecedor_nome: string | null
  nr_danfe: string | null
  v_total_danfe: number | null
  dt_emissao: string | null
  item_codigo: string | null
  item_descricao: string | null
  unidade_medida: string | null
  tipo_item: string | null
  q_embalagem: number | null
  q_estoque: number | null
  v_embalagem: number | null
  v_total_embalagem: number | null
  v_custo_medio: number | null
  v_custo_compra: number | null
  v_custo_total: number | null
  perc_variacao: number | null
  calcula_cmv: boolean | null
  fornecedor_codigo: string | null
  codigo_gerencial: string | null
  desc_gerencial: string | null
  mes_lancamento: number
  ano_lancamento: number
}

export type NfeImportPayload = {
  arquivo: string
  direcao: "entrada" | "saida"
  notas: Array<{
    chave: string; numero: string | null; serie: string | null; emissao: string
    emitenteCnpj: string | null; emitenteNome: string | null
    destinatarioCnpj: string | null; destinatarioNome: string | null
    valorTotal: number; statusSefaz: string | null; cancelada: boolean
    itens: Array<{
      codigo: string | null; descricao: string | null; ncm: string | null
      cfop: string | null; unidade: string | null; quantidade: number | null
      valorUnitario: number | null; valorTotal: number | null
    }>
  }>
  rejeitadas: number
}

export type NfeImportResult = {
  ok: boolean
  importadas: number
  duplicadas: number
  canceladas: number
  itens: number
  error?: string
}

export async function importNfe(payload: NfeImportPayload): Promise<NfeImportResult> {
  const empty = { ok: false, importadas: 0, duplicadas: 0, canceladas: 0, itens: 0 }
  try {
    await requireUser()
    const unit = await getCurrentUnit()
    if (!unit) return { ...empty, error: "Unidade não identificada." }
    if (!payload.notas.length) return { ...empty, error: "O ZIP não contém NF-e válida." }

    const db = createServiceClient()
    if (!db) return { ...empty, error: "Conexão administrativa com o banco não configurada." }
    // Tabelas novas ainda não constam nos tipos gerados.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = db as any
    // A unidade fiscal vem do CNPJ da própria empresa: emitente nas saídas e
    // destinatário nas entradas. Isso impede que um ZIP de outra unidade seja
    // gravado apenas porque ela estava selecionada no menu.
    const ownCnpjs = payload.notas
      .filter(note => !note.cancelada)
      .map(note => payload.direcao === "saida" ? note.emitenteCnpj : note.destinatarioCnpj)
      .filter((cnpj): cnpj is string => Boolean(cnpj))
    const counts = new Map<string, number>()
    for (const cnpj of ownCnpjs) counts.set(cnpj, (counts.get(cnpj) ?? 0) + 1)
    const dominantCnpj = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    let targetUnitId = unit.id
    if (dominantCnpj) {
      const { data: fiscalUnit, error: fiscalUnitError } = await raw
        .from("units").select("id,name").eq("cnpj", dominantCnpj).maybeSingle()
      if (fiscalUnitError) return { ...empty, error: fiscalUnitError.message }
      if (fiscalUnit?.id) targetUnitId = fiscalUnit.id
    }
    const keys = payload.notas.map(note => note.chave)
    const { data: existing, error: existingError } = await raw
      .from("nfe_documentos").select("chave").eq("unit_id", targetUnitId).in("chave", keys)
    if (existingError) return { ...empty, error: `Migração 025 pendente: ${existingError.message}` }
    const existingKeys = new Set((existing ?? []).map((row: { chave: string }) => row.chave))
    const novas = payload.notas.filter(note => !existingKeys.has(note.chave))
    const canceladas = novas.filter(note => note.cancelada).length
    const validas = novas.filter(note => !note.cancelada)

    const valorTotal = validas.reduce((sum, note) => sum + note.valorTotal, 0)
    const { data: batch, error: batchError } = await raw.from("nfe_importacoes").insert({
      unit_id: targetUnitId, arquivo: payload.arquivo, direcao: payload.direcao,
      total_xml: payload.notas.length + payload.rejeitadas,
      importadas: validas.length, duplicadas: existingKeys.size,
      canceladas, rejeitadas: payload.rejeitadas, valor_total: valorTotal,
    }).select("id").single()
    if (batchError) return { ...empty, error: batchError.message }

    // Uma nova importação com direção corrigida deve também corrigir os
    // documentos já conhecidos (ex.: pacote de entrada marcado como saída).
    if (existingKeys.size) {
      const { error } = await raw.from("nfe_documentos")
        .update({ direcao: payload.direcao })
        .eq("unit_id", targetUnitId)
        .in("chave", [...existingKeys])
      if (error) return { ...empty, error: error.message }
    }

    if (novas.length) {
      const { error } = await raw.from("nfe_documentos").insert(novas.map(note => ({
        unit_id: targetUnitId, importacao_id: batch.id, chave: note.chave, direcao: payload.direcao,
        numero: note.numero, serie: note.serie, emissao: note.emissao,
        emitente_cnpj: note.emitenteCnpj, emitente_nome: note.emitenteNome,
        destinatario_cnpj: note.destinatarioCnpj, destinatario_nome: note.destinatarioNome,
        valor_total: note.valorTotal, status_sefaz: note.statusSefaz, cancelada: note.cancelada,
      })))
      if (error) return { ...empty, error: error.message }
    }

    let itemCount = 0
    // Reprocessa também documentos já conhecidos: o upsert é idempotente e isto
    // permite reparar uma importação interrompida entre documento e itens.
    const notasParaProdutos = payload.notas.filter(note => !note.cancelada)
    if (notasParaProdutos.length) {
      const rows = notasParaProdutos.flatMap(note => note.itens.map((item, index) => {
        const date = new Date(note.emissao)
        return {
          unit_id: targetUnitId, chave_nfe: note.chave,
          fornecedor_nome: note.emitenteNome, nr_danfe: note.numero,
          v_total_danfe: note.valorTotal, dt_emissao: note.emissao,
          item_codigo: item.codigo ?? String(index + 1), item_descricao: item.descricao,
          unidade_medida: item.unidade, tipo_item: item.ncm,
          q_embalagem: item.quantidade, q_estoque: item.quantidade,
          v_embalagem: item.valorUnitario, v_total_embalagem: item.valorTotal,
          v_custo_medio: item.valorUnitario, v_custo_compra: item.valorUnitario,
          v_custo_total: item.valorTotal, perc_variacao: null, calcula_cmv: payload.direcao === "entrada",
          fornecedor_codigo: note.emitenteCnpj, codigo_gerencial: item.cfop,
          desc_gerencial: payload.direcao === "entrada" ? "NF-e sem classificação" : "NF-e saída",
          direcao_nfe: payload.direcao,
          mes_lancamento: date.getMonth() + 1, ano_lancamento: date.getFullYear(),
        }
      }))
      // O índice legado é parcial e não pode ser inferido pelo ON CONFLICT do
      // PostgREST. Filtrar antes da inserção mantém a operação idempotente sem
      // depender do formato desse índice.
      const noteKeys = [...new Set(rows.map(row => row.chave_nfe))]
      // Se o usuário reenviar o pacote na página correta, move também os itens
      // que já existiam para a direção escolhida.
      const { error: directionError } = await raw
        .from("produtos_relatorio")
        .update({
          direcao_nfe: payload.direcao,
          calcula_cmv: payload.direcao === "entrada",
        })
        .eq("unit_id", targetUnitId)
        .in("chave_nfe", noteKeys)
      if (directionError) return { ...empty, error: directionError.message }

      const { data: existingProducts, error: productsError } = await raw
        .from("produtos_relatorio")
        .select("chave_nfe,item_codigo")
        .eq("unit_id", targetUnitId)
        .in("chave_nfe", noteKeys)
      if (productsError) return { ...empty, error: productsError.message }

      const known = new Set((existingProducts ?? []).map((row: { chave_nfe: string; item_codigo: string }) =>
        `${row.chave_nfe}\u0000${row.item_codigo}`
      ))
      const pending = rows.filter(row => {
        const key = `${row.chave_nfe}\u0000${row.item_codigo}`
        if (known.has(key)) return false
        known.add(key)
        return true
      })

      for (let i = 0; i < pending.length; i += 500) {
        const chunk = pending.slice(i, i + 500)
        const { error } = await raw.from("produtos_relatorio").insert(chunk)
        if (error) return { ...empty, error: error.message }
        itemCount += chunk.length
      }
    }

    return { ok: true, importadas: validas.length, duplicadas: existingKeys.size, canceladas, itens: itemCount }
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function deleteProdutosMes(
  unitId: string,
  mes: number,
  ano: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) return { ok: false, error: "Sem conexão com banco" }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db
      .from("produtos_relatorio")
      .delete()
      .eq("unit_id", unitId)
      .eq("mes_lancamento", mes)
      .eq("ano_lancamento", ano)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function insertProdutos(
  rows: ProdutoInsert[]
): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) return { ok: false, count: 0, error: "Sem conexão com banco" }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error, count } = await db
      .from("produtos_relatorio")
      .insert(rows)
      .select("id", { count: "exact", head: true })

    if (error) return { ok: false, count: 0, error: error.message }
    return { ok: true, count: count ?? rows.length }
  } catch (e) {
    return { ok: false, count: 0, error: String(e) }
  }
}

export async function getProdutosMeses(
  unitId: string
): Promise<{ mes: number; ano: number; total: number }[]> {
  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data } = await db
      .from("produtos_relatorio")
      .select("mes_lancamento, ano_lancamento")
      .eq("unit_id", unitId)
      .limit(10000)
    if (!data) return []
    const map = new Map<string, number>()
    for (const r of data) {
      const k = `${r.ano_lancamento}-${r.mes_lancamento}`
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([k, total]) => {
        const [ano, mes] = k.split("-").map(Number)
        return { mes: mes!, ano: ano!, total }
      })
      .sort((a, b) => a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes)
  } catch {
    return []
  }
}

export type RankingItem = {
  item_descricao: string | null
  item_codigo: string | null
  fornecedor_nome: string | null
  desc_gerencial: string | null
  unidade_medida: string | null
  custo_total: number
  quantidade_total: number
  custo_medio: number
  variacao_media: number | null
}

export type RankingResult = {
  porValor: RankingItem[]
  porQuantidade: RankingItem[]
  porVariacao: RankingItem[]
  totalCmv: number
}

export async function getRankingProdutos(
  unitId: string | null,
  mes: number,
  ano: number
): Promise<RankingResult> {
  const empty: RankingResult = { porValor: [], porQuantidade: [], porVariacao: [], totalCmv: 0 }
  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) return empty
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    let q = db
      .from("produtos_relatorio")
      .select("item_descricao,item_codigo,fornecedor_nome,desc_gerencial,unidade_medida,v_total_embalagem,v_custo_total,q_estoque,v_custo_medio,perc_variacao")
      .eq("mes_lancamento", mes)
      .eq("ano_lancamento", ano)
      .eq("calcula_cmv", true)
      .limit(10000)
    if (unitId) q = q.eq("unit_id", unitId)
    const { data } = await q
    if (!data || data.length === 0) return empty

    type Acc = {
      item_descricao: string | null
      item_codigo: string | null
      fornecedor_nome: string | null
      desc_gerencial: string | null
      unidade_medida: string | null
      custo_total: number
      quantidade_total: number
      custo_medio_sum: number
      custo_medio_n: number
      variacao_sum: number
      variacao_n: number
    }

    const map = new Map<string, Acc>()
    for (const r of data) {
      const key = `${r.item_descricao}||${r.fornecedor_nome}||${r.desc_gerencial}||${r.unidade_medida}`
      const a: Acc = map.get(key) ?? {
        item_descricao: r.item_descricao,
        item_codigo: r.item_codigo ?? null,
        fornecedor_nome: r.fornecedor_nome,
        desc_gerencial: r.desc_gerencial,
        unidade_medida: r.unidade_medida,
        custo_total: 0, quantidade_total: 0,
        custo_medio_sum: 0, custo_medio_n: 0,
        variacao_sum: 0, variacao_n: 0,
      }
      const ct = r.v_total_embalagem != null ? Number(r.v_total_embalagem) : 0
      const qt = r.q_estoque         != null ? Number(r.q_estoque)         : 0
      a.custo_total      += isFinite(ct) ? Math.abs(ct) : 0
      a.quantidade_total += isFinite(qt) ? qt           : 0
      if (r.v_custo_medio != null) {
        const n = Number(r.v_custo_medio)
        if (isFinite(n)) { a.custo_medio_sum += n; a.custo_medio_n++ }
      }
      if (r.perc_variacao != null) {
        const n = Number(r.perc_variacao)
        if (isFinite(n)) { a.variacao_sum += n; a.variacao_n++ }
      }
      if (!a.item_codigo && r.item_codigo) a.item_codigo = r.item_codigo
      map.set(key, a)
    }

    const items: RankingItem[] = [...map.values()].map(a => ({
      item_descricao:  a.item_descricao,
      item_codigo:     a.item_codigo,
      fornecedor_nome: a.fornecedor_nome,
      desc_gerencial:  a.desc_gerencial,
      unidade_medida:  a.unidade_medida,
      custo_total:     a.custo_total,
      quantidade_total: a.quantidade_total,
      custo_medio:     a.custo_medio_n > 0 ? a.custo_medio_sum / a.custo_medio_n : 0,
      variacao_media:  a.variacao_n > 0 ? a.variacao_sum / a.variacao_n : null,
    }))

    const totalCmv     = items.reduce((s, i) => s + i.custo_total, 0)
    const porValor     = [...items].sort((a, b) => b.custo_total - a.custo_total).slice(0, 20)
    const porQuantidade = [...items].sort((a, b) => b.quantidade_total - a.quantidade_total).slice(0, 20)
    const porVariacao  = items
      .filter(i => i.variacao_media != null && i.variacao_media > 0)
      .sort((a, b) => (b.variacao_media ?? 0) - (a.variacao_media ?? 0))
      .slice(0, 20)

    return { porValor, porQuantidade, porVariacao, totalCmv }
  } catch {
    return empty
  }
}

export type HistoricoRow = {
  mes_lancamento: number
  ano_lancamento: number
  fornecedor_nome: string | null
  q_estoque: number | null
  v_custo_medio: number | null
  v_custo_total: number | null
  perc_variacao: number | null
  desc_gerencial: string | null
  item_descricao: string | null
}

export async function getHistoricoProduto(
  unitId: string | null,
  itemCodigo: string
): Promise<HistoricoRow[]> {
  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    let q = db
      .from("produtos_relatorio")
      .select("mes_lancamento,ano_lancamento,fornecedor_nome,q_estoque,v_custo_medio,v_custo_total,perc_variacao,desc_gerencial,item_descricao")
      .eq("item_codigo", itemCodigo)
      .order("ano_lancamento", { ascending: true })
      .order("mes_lancamento", { ascending: true })
      .limit(120)
    if (unitId) q = q.eq("unit_id", unitId)
    const { data } = await q
    return (data ?? []) as HistoricoRow[]
  } catch {
    return []
  }
}

export async function getCurrentUnitId(): Promise<string | null> {
  const unit = await getCurrentUnit()
  return unit?.id ?? null
}

// ── Análise: evolução de preço unitário por produto ─────────────────────────────
// Preço unitário do mês = AVG(v_custo_compra) — preço de compra JÁ normalizado pelo
// sistema na unidade base do produto (R$/kg, R$/L, R$/un). Não usamos
// Σv_total_embalagem ÷ Σq_embalagem porque a embalagem muda entre meses (caixa 10kg
// vs pacote 1kg dá preço unitário diferente com custo igual). Só entram produtos em
// >= 2 meses. preco_unit = null quando nenhum registro do mês tem v_custo_compra
// válido (null/zero são ignorados, nunca viram zero).

export type AnaliseMesPonto = {
  mes: number
  ano: number
  qtd: number
  valor: number
  preco_unit: number | null
}

export type AnaliseProduto = {
  item_codigo: string
  item_descricao: string | null
  unidade_medida: string | null
  desc_gerencial: string | null
  gasto_total: number
  meses: AnaliseMesPonto[]
}

export async function getAnaliseProdutos(
  unitId: string | null
): Promise<AnaliseProduto[]> {
  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    let q = db
      .from("produtos_relatorio")
      .select("item_codigo,item_descricao,unidade_medida,desc_gerencial,q_embalagem,v_total_embalagem,v_custo_compra,mes_lancamento,ano_lancamento")
      .eq("calcula_cmv", true)
      .limit(100000)
    if (unitId) q = q.eq("unit_id", unitId)
    const { data } = await q
    if (!data || data.length === 0) return []

    // custoSum/custoN = base do AVG(v_custo_compra) do mês; qtd/valor só p/ exibição.
    type MesAcc = { mes: number; ano: number; qtd: number; valor: number; custoSum: number; custoN: number }
    type Acc = {
      item_codigo: string
      item_descricao: string | null
      unidade_medida: string | null
      desc_gerencial: string | null
      meses: Map<string, MesAcc>
    }

    const map = new Map<string, Acc>()
    for (const r of data) {
      const cod = r.item_codigo
      if (!cod) continue // sem código não dá para rastrear entre meses
      let a = map.get(cod)
      if (!a) {
        a = {
          item_codigo: cod,
          item_descricao: r.item_descricao ?? null,
          unidade_medida: r.unidade_medida ?? null,
          desc_gerencial: r.desc_gerencial ?? null,
          meses: new Map(),
        }
        map.set(cod, a)
      }
      if (!a.item_descricao && r.item_descricao) a.item_descricao = r.item_descricao
      if (!a.unidade_medida && r.unidade_medida) a.unidade_medida = r.unidade_medida
      if (!a.desc_gerencial && r.desc_gerencial) a.desc_gerencial = r.desc_gerencial

      const mk = `${r.ano_lancamento}-${r.mes_lancamento}`
      let m = a.meses.get(mk)
      if (!m) {
        m = { mes: Number(r.mes_lancamento), ano: Number(r.ano_lancamento), qtd: 0, valor: 0, custoSum: 0, custoN: 0 }
        a.meses.set(mk, m)
      }
      const qtd = r.q_embalagem != null ? Number(r.q_embalagem) : 0
      const val = r.v_total_embalagem != null ? Number(r.v_total_embalagem) : 0
      m.qtd   += isFinite(qtd) ? qtd : 0
      m.valor += isFinite(val) ? Math.abs(val) : 0
      // AVG(v_custo_compra): ignora null e zero (não entram na média do mês).
      if (r.v_custo_compra != null) {
        const cc = Number(r.v_custo_compra)
        if (isFinite(cc) && cc !== 0) { m.custoSum += cc; m.custoN++ }
      }
    }

    const produtos: AnaliseProduto[] = []
    for (const a of map.values()) {
      if (a.meses.size < 2) continue // >1 mês para haver evolução
      const meses: AnaliseMesPonto[] = [...a.meses.values()]
        .sort((x, y) => (x.ano !== y.ano ? x.ano - y.ano : x.mes - y.mes))
        .map(m => ({
          mes: m.mes,
          ano: m.ano,
          qtd: m.qtd,
          valor: m.valor,
          preco_unit: m.custoN > 0 ? m.custoSum / m.custoN : null,
        }))
      produtos.push({
        item_codigo: a.item_codigo,
        item_descricao: a.item_descricao,
        unidade_medida: a.unidade_medida,
        desc_gerencial: a.desc_gerencial,
        gasto_total: meses.reduce((s, m) => s + m.valor, 0),
        meses,
      })
    }
    return produtos
  } catch {
    return []
  }
}
