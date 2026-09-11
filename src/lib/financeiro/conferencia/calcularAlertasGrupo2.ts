// Lógica pura da tela de Conferência — GRUPO 2 (Cobertura): falta dado
// pra o número ser confiável. Mesmo princípio do GRUPO 1 — calculado na
// leitura, nunca grava nada.
import { fetchAllPaginado } from "@/lib/financeiro/razao/gerar"
import { type Alerta, type AlertaOcorrencia, montarAlerta, round2, competenciaFim } from "./calcularAlertas"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

async function getKpiSnapshot(db: Db, unitId: string, competencia: string) {
  const { data } = await db.from("kpi_snapshot")
    .select("receita_liquida,tem_nfe,tem_folha,confianca_pct")
    .eq("unit_id", unitId).eq("competencia", competencia).maybeSingle()
  return data as { receita_liquida: number | null; tem_nfe: boolean; tem_folha: boolean; confianca_pct: number | null } | null
}

// ── 2.1 · Competência com receita mas sem NF-e ──────────────────────────────
export async function calcularAlertaReceitaSemNfe(db: Db, unitId: string, competencia: string): Promise<Alerta | null> {
  const kpi = await getKpiSnapshot(db, unitId, competencia)
  const receitaLiquida = Number(kpi?.receita_liquida ?? 0)
  const ocorrencias: AlertaOcorrencia[] = []
  if (kpi && !kpi.tem_nfe && receitaLiquida > 0) {
    ocorrencias.push({
      chave: `${unitId}|${competencia}`,
      descricao: "Competência com receita líquida lançada, mas nenhuma NF-e de entrada importada.",
      valor: round2(receitaLiquida),
    })
  }
  return montarAlerta({
    alertaChave: "2.1_receita_sem_nfe",
    grupo: 2,
    titulo: "Competência com receita mas sem NF-e",
    motivo: "Há receita líquida lançada nesta competência, mas nenhuma NF-e de entrada foi importada para o período.",
    severidade: "critico",
    link: "/financeiro/dre/cmv",
    ocorrencias,
  })
}

// ── 2.2 · Competência com receita mas sem folha ─────────────────────────────
export async function calcularAlertaReceitaSemFolha(db: Db, unitId: string, competencia: string): Promise<Alerta | null> {
  const kpi = await getKpiSnapshot(db, unitId, competencia)
  const receitaLiquida = Number(kpi?.receita_liquida ?? 0)
  const ocorrencias: AlertaOcorrencia[] = []
  if (kpi && !kpi.tem_folha && receitaLiquida > 0) {
    ocorrencias.push({
      chave: `${unitId}|${competencia}`,
      descricao: "Competência com receita líquida lançada, mas nenhum extrato de folha importado.",
      valor: round2(receitaLiquida),
    })
  }
  return montarAlerta({
    alertaChave: "2.2_receita_sem_folha",
    grupo: 2,
    titulo: "Competência com receita mas sem folha",
    motivo: "Há receita líquida lançada nesta competência, mas nenhum extrato de folha (Domínio) foi importado.",
    severidade: "critico",
    link: "/financeiro/dre/folha",
    ocorrencias,
  })
}

// ── 2.3 · Títulos com número de nota mas XML não importado ─────────────────
export async function calcularAlertaTitulosSemXml(db: Db, unitId: string, competencia: string): Promise<Alerta | null> {
  const rows = await fetchAllPaginado((from, to) =>
    db.from("reconciliacoes_sugeridas")
      .select("id,titulo_id,valor_titulo")
      .eq("unit_id", unitId).eq("competencia", competencia).eq("status", "sem_xml")
      .range(from, to)
  ) as Array<{ id: string; titulo_id: string; valor_titulo: number | null }>

  const tituloIds = [...new Set(rows.map((r) => r.titulo_id))]
  const titulosInfo = tituloIds.length === 0 ? [] : await fetchAllPaginado((from, to) =>
    db.from("titulos_a_pagar").select("id,fantasia_fornecedor,razao_fornecedor,n_nota_fiscal").in("id", tituloIds).range(from, to)
  ) as Array<{ id: string; fantasia_fornecedor: string | null; razao_fornecedor: string | null; n_nota_fiscal: string | null }>
  const infoPorId = new Map(titulosInfo.map((t) => [t.id, t]))

  const ocorrencias: AlertaOcorrencia[] = rows.map((r) => {
    const info = infoPorId.get(r.titulo_id)
    return {
      chave: r.id,
      descricao: `${info?.fantasia_fornecedor ?? info?.razao_fornecedor ?? "Fornecedor não identificado"} · Nota ${info?.n_nota_fiscal ?? "?"}`,
      valor: Math.abs(Number(r.valor_titulo ?? 0)),
    }
  })

  return montarAlerta({
    alertaChave: "2.3_titulos_sem_xml",
    grupo: 2,
    titulo: "Títulos com número de nota mas XML não importado",
    motivo: "O título tem número de nota fiscal na planilha, mas nenhum XML correspondente foi importado ainda.",
    severidade: "atencao",
    link: "/financeiro/dre/divergencias",
    ocorrencias,
  })
}

// ── 2.4 · Títulos sem data de vencimento ────────────────────────────────────
export async function calcularAlertaTitulosSemVencimento(db: Db, unitId: string, competencia: string): Promise<Alerta | null> {
  const titulos = await fetchAllPaginado((from, to) =>
    db.from("titulos_a_pagar")
      .select("id,fantasia_fornecedor,razao_fornecedor,v_titulo")
      .eq("unit_id", unitId)
      .in("origem", ["nf_pedidos", "contas_pagar"])
      .eq("d_competencia", competencia)
      .is("d_vencimento", null)
      .range(from, to)
  ) as Array<{ id: string; fantasia_fornecedor: string | null; razao_fornecedor: string | null; v_titulo: number | null }>

  const ocorrencias: AlertaOcorrencia[] = titulos.map((t) => ({
    chave: t.id,
    descricao: `${t.fantasia_fornecedor ?? t.razao_fornecedor ?? "Fornecedor não identificado"} · sem data de vencimento`,
    valor: Math.abs(Number(t.v_titulo ?? 0)),
  }))

  return montarAlerta({
    alertaChave: "2.4_titulos_sem_vencimento",
    grupo: 2,
    titulo: "Títulos sem data de vencimento",
    motivo: "O título não tem data de vencimento cadastrada, então não entra na projeção do fluxo de caixa.",
    severidade: "atencao",
    link: "/financeiro/fluxo",
    ocorrencias,
  })
}

// ── 2.5 · Títulos sem confirmação de liquidação ─────────────────────────────
export async function calcularAlertaTitulosSemLiquidacao(db: Db, unitId: string, competencia: string): Promise<Alerta | null> {
  const fim = competenciaFim(competencia)
  const titulos = await fetchAllPaginado((from, to) =>
    db.from("titulos_a_pagar")
      .select("id,fantasia_fornecedor,razao_fornecedor,v_titulo")
      .eq("unit_id", unitId)
      .in("origem", ["nf_pedidos", "contas_pagar"])
      .or(`d_competencia.eq.${competencia},and(d_competencia.is.null,d_vencimento.gte.${competencia},d_vencimento.lt.${fim})`)
      .is("liquidacao_origem", null)
      .range(from, to)
  ) as Array<{ id: string; fantasia_fornecedor: string | null; razao_fornecedor: string | null; v_titulo: number | null }>

  const ocorrencias: AlertaOcorrencia[] = titulos.map((t) => ({
    chave: t.id,
    descricao: `${t.fantasia_fornecedor ?? t.razao_fornecedor ?? "Fornecedor não identificado"} · sem confirmação de liquidação`,
    valor: Math.abs(Number(t.v_titulo ?? 0)),
  }))

  return montarAlerta({
    alertaChave: "2.5_titulos_sem_liquidacao",
    grupo: 2,
    titulo: "Títulos sem confirmação de liquidação",
    motivo: "Não há marcação de pagamento para este título — status indefinido entre pago e não pago.",
    severidade: "atencao",
    link: "/financeiro/pagar",
    ocorrencias,
  })
}

// ── 2.6 · Dias de receita sem detalhe por forma de pagamento ────────────────
const FORMA_RESUMO_SEM_DETALHE = "Relatório Geral de Vendas"

export async function calcularAlertaReceitaSemDetalheForma(db: Db, unitId: string, competencia: string): Promise<Alerta | null> {
  const fim = competenciaFim(competencia)
  const dias = await fetchAllPaginado((from, to) =>
    db.from("receita_dias")
      .select("id,data,receita_liquida")
      .eq("unit_id", unitId).gte("data", competencia).lt("data", fim)
      .gt("receita_liquida", 0)
      .range(from, to)
  ) as Array<{ id: string; data: string; receita_liquida: number | null }>

  const ids = dias.map((d) => d.id)
  const pagamentos = ids.length === 0 ? [] : await fetchAllPaginado((from, to) =>
    db.from("receita_pagamentos").select("workday_id_fk,forma").in("workday_id_fk", ids).range(from, to)
  ) as Array<{ workday_id_fk: string; forma: string }>
  const temDetalhe = new Set(pagamentos.filter((p) => p.forma !== FORMA_RESUMO_SEM_DETALHE).map((p) => p.workday_id_fk))

  const ocorrencias: AlertaOcorrencia[] = dias
    .filter((d) => !temDetalhe.has(d.id))
    .map((d) => ({
      chave: d.id,
      descricao: `Dia ${d.data} · receita registrada só via "${FORMA_RESUMO_SEM_DETALHE}", sem quebra por forma de pagamento`,
      valor: Math.abs(Number(d.receita_liquida ?? 0)),
    }))

  return montarAlerta({
    alertaChave: "2.6_receita_sem_detalhe_forma",
    grupo: 2,
    titulo: "Dias de receita sem detalhe por forma de pagamento",
    motivo: "A receita do dia só tem o resumo geral de vendas, sem quebra por forma de pagamento — o prazo de recebimento é assumido como D+0.",
    severidade: "atencao",
    link: "/financeiro/dre/receita",
    ocorrencias,
  })
}

// ── 2.7 · Unidade sem conta bancária cadastrada ─────────────────────────────
export async function calcularAlertaUnidadeSemContaBancaria(db: Db, unitId: string, unitNome: string): Promise<Alerta | null> {
  const contas = await fetchAllPaginado((from, to) =>
    db.from("contas_bancarias").select("id").eq("unit_id", unitId).range(from, to)
  ) as Array<{ id: string }>

  const ocorrencias: AlertaOcorrencia[] = contas.length === 0
    ? [{ chave: unitId, descricao: `${unitNome} não tem nenhuma conta bancária cadastrada`, valor: 0 }]
    : []

  return montarAlerta({
    alertaChave: "2.7_unidade_sem_conta_bancaria",
    grupo: 2,
    titulo: "Unidade sem conta bancária cadastrada",
    motivo: "Sem conta bancária cadastrada, o fluxo de caixa não tem saldo inicial nem contraparte pra reconciliar.",
    severidade: "atencao",
    link: "/financeiro/fluxo",
    ocorrencias,
  })
}

// ── 2.8 · Índice de confiança abaixo de 70% ─────────────────────────────────
const PISO_CONFIANCA = 0.7

export async function calcularAlertaConfiancaBaixa(db: Db, unitId: string, competencia: string): Promise<Alerta | null> {
  const kpi = await getKpiSnapshot(db, unitId, competencia)
  const ocorrencias: AlertaOcorrencia[] = []
  if (kpi && kpi.confianca_pct != null && Number(kpi.confianca_pct) < PISO_CONFIANCA) {
    const pct = (Number(kpi.confianca_pct) * 100).toFixed(0)
    ocorrencias.push({
      chave: `${unitId}|${competencia}`,
      descricao: `Índice de confiança em ${pct}%, abaixo do piso de ${PISO_CONFIANCA * 100}%.`,
      valor: round2(Math.abs(Number(kpi.receita_liquida ?? 0))),
    })
  }
  return montarAlerta({
    alertaChave: "2.8_confianca_baixa",
    grupo: 2,
    titulo: "Índice de confiança abaixo de 70%",
    motivo: "O índice de confiança da competência (cobertura de classificação e das fontes) está abaixo do piso de 70%.",
    severidade: "atencao",
    link: "/financeiro",
    ocorrencias,
  })
}

export async function calcularAlertasGrupo2(
  db: Db,
  unitId: string,
  unitNome: string,
  competencia: string
): Promise<Alerta[]> {
  const alertas = await Promise.all([
    calcularAlertaReceitaSemNfe(db, unitId, competencia),
    calcularAlertaReceitaSemFolha(db, unitId, competencia),
    calcularAlertaTitulosSemXml(db, unitId, competencia),
    calcularAlertaTitulosSemVencimento(db, unitId, competencia),
    calcularAlertaTitulosSemLiquidacao(db, unitId, competencia),
    calcularAlertaReceitaSemDetalheForma(db, unitId, competencia),
    calcularAlertaUnidadeSemContaBancaria(db, unitId, unitNome),
    calcularAlertaConfiancaBaixa(db, unitId, competencia),
  ])
  return alertas.filter((a): a is Alerta => a !== null)
}
