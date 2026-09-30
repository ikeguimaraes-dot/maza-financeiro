"use server";
import { unitDisplayName } from "@maza/auth/unit-display";

import { fetchAllPaginado } from "@/lib/financeiro/razao/gerar";
import { createFinanceiroClient } from "@/lib/financeiro/db/client";


import { createSupabaseServerClient } from "@maza/db/supabase/server";
import type {
  VendaDiaria,
  MetaProjecao,
  TituloAPagar,
  WorkdayPagamento,
} from "@maza/db/types/operations-database";

/** TituloAPagar + nome da unidade (join com `units` via unit_id). */
export type TituloComUnidade = TituloAPagar & { unit_name: string | null };

// ── helpers ──────────────────────────────────────────────────────────────────

/** "2026-05-01" → mes_ano "2026-5" (formato do metas_projecoes) */
function competenciaToMesAno(competencia: string): string {
  const [y, m] = competencia.split("-");
  return `${y}-${parseInt(m ?? "1", 10)}`;
}

/** "2026-05-01" → { dateFrom: "2026-05-01", dateTo: "2026-05-31" } */
function competenciaToRange(competencia: string): {
  dateFrom: string;
  dateTo: string;
} {
  const [y, m] = competencia.split("-");
  const year = parseInt(y ?? "1970", 10);
  const month = parseInt(m ?? "1", 10);
  const lastDay = new Date(year, month, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dateFrom: `${year}-${pad(month)}-01`,
    dateTo: `${year}-${pad(month)}-${lastDay}`,
  };
}

/**
 * JS getDay() → índice em metas_diarias [seg=0, ter=1, qua=2, qui=3, sex=4, sab=5, dom=6]
 * JS: 0=dom, 1=seg, 2=ter, 3=qua, 4=qui, 5=sex, 6=sab
 */
function jsWeekdayToMetaIndex(jsDay: number): number {
  const map: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
  return map[jsDay] ?? 0;
}

// ── Tipos derivados expostos para as pages ────────────────────────────────────

/**
 * Linha de um dia no Fluxo de Caixa — independente da fonte.
 *
 * Campos nuláveis (custo, cmv_pct, lucro, pagamentos) ficam null quando a fonte
 * é vendas_diarias (que não carrega CMV nem mix de pagamentos).
 * Os formatters do UI já tratam null como "—".
 */
export type WorkdayDiaEnriquecido = {
  /** ID único usado como React key. */
  workday_id: number;
  /** Data ISO "YYYY-MM-DD". */
  data: string;
  bruto: number;
  desconto: number | null;
  gorjeta: number | null;
  /** CMV em R$. Null quando fonte = vendas_diarias. */
  custo: number | null;
  /** CMV em %. Null quando fonte = vendas_diarias. */
  cmv_pct: number | null;
  /** Lucro bruto. Null quando fonte = vendas_diarias. */
  lucro: number | null;
  acessos: number | null;
  ticket_medio: number | null;
  /** Mix de pagamentos. Null quando fonte = vendas_diarias. */
  pagamentos: WorkdayPagamento[] | null;
  // enriched
  meta_dia: number | null;
  atingimento_pct: number | null;
  dia_semana: string;
};

// ── vendas_diarias ────────────────────────────────────────────────────────────

/**
 * Lê vendas_diarias do mês e agrega por data (múltiplos turnos → 1 linha/dia).
 * Fonte: import automático ~8h diariamente — dados sempre atualizados.
 */
async function getVendasDiariasMes(competencia: string): Promise<VendaDiaria[]> {
  const ops = await createFinanceiroClient();
  if (!ops) return [];

  const { dateFrom, dateTo } = competenciaToRange(competencia);
  const { data, error } = await ops
    .from("vendas_diarias")
    .select(
      "id,data_venda,turno,qtd_clientes,faturamento_bruto,gorjetas,descontos_clientes,descontos_socios,descontos_internos,meta_faturamento",
    )
    .gte("data_venda", dateFrom)
    .lte("data_venda", dateTo)
    .order("data_venda", { ascending: true });

  if (error) {
    console.error("[getVendasDiariasMes]", error.message);
    return [];
  }
  return (data ?? []) as VendaDiaria[];
}

// ── Metas ─────────────────────────────────────────────────────────────────────

/** Metas do mês (meta total + array diário por dia da semana). */
export async function getMetasMes(
  competencia: string,
): Promise<MetaProjecao | null> {
  const ops = await createFinanceiroClient();
  if (!ops) return null;

  const mesAno = competenciaToMesAno(competencia);
  const { data, error } = await ops
    .from("metas_projecoes")
    .select("id,mes_ano,meta_faturamento,metas_diarias")
    .eq("mes_ano", mesAno)
    .maybeSingle();

  if (error) {
    console.error("[getMetasMes]", error.message);
    return null;
  }
  return data as MetaProjecao | null;
}

// ── Contas a Pagar ────────────────────────────────────────────────────────────

/**
 * Todos os títulos a pagar da competência informada. A competência vem de
 * ref_mes e, nas planilhas Maza, corresponde à aba mensal de origem.
 * O vencimento permanece preservado para classificar vencidos/a vencer.
 * Filtra também por unit_id, se
 * informada — mesma unidade selecionada na shell (padrão do resto do
 * módulo: unitId resolvido via getCurrentUnit() na page e passado pra cá,
 * aplicado como .eq("unit_id", unitId) igual DRE/CMV). Retorna com o nome
 * da unidade (join via unit_id → units.name). fantasia_empresa é só texto
 * de origem do ERP, não é usado pra separar unidade (empresas diferentes
 * podem cair na mesma unidade, ex: "TEEM GROUP LTDA" e "MEET & EAT" são a
 * mesma unidade).
 */
export async function getTitulosAPagar(
  competencia: string,
  unitId?: string | null,
): Promise<TituloComUnidade[]> {
  // Esta tabela possui RLS por unidade. A consulta deve carregar a sessão do
  // usuário para que kph_has_role_for_unit(unit_id) seja avaliada corretamente.
  const ops = await createSupabaseServerClient();
  if (!ops) return [];

  let query = ops
    .from("titulos_a_pagar")
    .select("*")
    .eq("ref_mes", competencia.slice(0, 7) + "-01");
  if (unitId) query = query.eq("unit_id", unitId);

  const { data, error } = await query.order("d_vencimento", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[getTitulosAPagar]", error.message);
    return [];
  }
  const titulos = (data ?? []) as TituloAPagar[];
  if (titulos.length === 0) return [];

  const unitIds = [...new Set(titulos.map((t) => t.unit_id).filter((id): id is string => !!id))];
  const unitNames = new Map<string, string>();
  if (unitIds.length > 0) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { data: unitsData, error: unitsError } = await supabase
        .from("units")
        .select("id, name")
        .in("id", unitIds);
      if (unitsError) {
        console.error("[getTitulosAPagar] units:", unitsError.message);
      } else {
        for (const u of (unitsData ?? []) as { id: string; name: string }[]) {
          unitNames.set(u.id, unitDisplayName(u));
        }
      }
    }
  }

  return titulos.map((t) => ({
    ...t,
    unit_name: t.unit_id ? (unitNames.get(t.unit_id) ?? null) : null,
  }));
}

// ── Fluxo de Caixa ────────────────────────────────────────────────────────────

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Combina vendas_diarias + metas_projecoes → array enriquecido pronto para render.
 *
 * Fonte: vendas_diarias — import automático diário às ~8h (sempre atualizado).
 * Campos custo/cmv_pct/lucro/pagamentos ficam null (não disponíveis nessa fonte).
 */
export async function getFluxoCaixaMes(competencia: string): Promise<{
  dias: WorkdayDiaEnriquecido[];
  meta: MetaProjecao | null;
  totais: {
    bruto: number;
    desconto: number;
    gorjeta: number;
    custo: number;
    lucro: number;
    acessos: number;
    cmv_pct_medio: number | null;
    ticket_medio: number | null;
    meta_total: number;
    atingimento_pct: number | null;
  };
}> {
  const [rows, meta] = await Promise.all([
    getVendasDiariasMes(competencia),
    getMetasMes(competencia),
  ]);

  // Agrega turnos por data_venda → uma linha por dia
  const byDate = new Map<string, { firstId: number; rows: VendaDiaria[] }>();
  for (const row of rows) {
    const entry = byDate.get(row.data_venda);
    if (!entry) {
      byDate.set(row.data_venda, { firstId: row.id, rows: [row] });
    } else {
      entry.rows.push(row);
    }
  }

  // Constrói dias enriquecidos na mesma ordem (data ASC já garantida pelo ORDER BY)
  const dias: WorkdayDiaEnriquecido[] = [];
  for (const [dataVenda, { firstId, rows: turnos }] of byDate.entries()) {
    const bruto = turnos.reduce((s, r) => s + (r.faturamento_bruto ?? 0), 0);
    const desconto = turnos.reduce(
      (s, r) =>
        s +
        (r.descontos_clientes ?? 0) +
        (r.descontos_socios ?? 0) +
        (r.descontos_internos ?? 0),
      0,
    );
    const gorjeta = turnos.reduce((s, r) => s + (r.gorjetas ?? 0), 0);
    const acessos = turnos.reduce((s, r) => s + (r.qtd_clientes ?? 0), 0);
    const ticket_medio =
      acessos > 0 ? Math.round((bruto / acessos) * 100) / 100 : null;

    const date = new Date(`${dataVenda}T12:00:00`);
    const jsDay = date.getDay();
    const metaIdx = jsWeekdayToMetaIndex(jsDay);
    const metaDia = meta?.metas_diarias?.[metaIdx] ?? null;
    const atingimento_pct =
      metaDia && metaDia > 0 ? Math.round((bruto / metaDia) * 100) : null;

    dias.push({
      workday_id: firstId,
      data: dataVenda,
      bruto,
      desconto,
      gorjeta,
      custo: null,
      cmv_pct: null,
      lucro: null,
      acessos,
      ticket_medio,
      pagamentos: null,
      meta_dia: metaDia,
      atingimento_pct,
      dia_semana: DIAS_SEMANA[jsDay] ?? "—",
    });
  }

  // Totais do mês
  const bruto = dias.reduce((s, d) => s + d.bruto, 0);
  const desconto = dias.reduce((s, d) => s + (d.desconto ?? 0), 0);
  const gorjeta = dias.reduce((s, d) => s + (d.gorjeta ?? 0), 0);
  const acessos = dias.reduce((s, d) => s + (d.acessos ?? 0), 0);
  const ticket_medio =
    acessos > 0 ? Math.round((bruto / acessos) * 100) / 100 : null;
  const meta_total = meta?.meta_faturamento ?? 0;
  const atingimento_pct =
    meta_total > 0 ? Math.round((bruto / meta_total) * 100 * 10) / 10 : null;

  return {
    dias,
    meta,
    totais: {
      bruto,
      desconto,
      gorjeta,
      custo: 0,      // não disponível em vendas_diarias
      lucro: 0,      // não disponível em vendas_diarias
      acessos,
      cmv_pct_medio: null, // não disponível em vendas_diarias
      ticket_medio,
      meta_total,
      atingimento_pct,
    },
  };
}

// ── Contas a Pagar — KPIs ─────────────────────────────────────────────────────

/** KPIs para a página de contas a pagar. */
export type PagarKpis = {
  total_titulos: number;
  total_valor: number;
  total_saldo: number;
  vencidos_count: number;
  vencidos_valor: number;
  a_vencer_30d_valor: number;
  fluxo_caixa_valor: number;
};

export async function getPagarKpisETitulos(competencia: string, unitId?: string | null): Promise<{
  titulos: TituloComUnidade[];
  kpis: PagarKpis;
}> {
  const titulos = await getTitulosAPagar(competencia, unitId);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const em30d = new Date(hoje);
  em30d.setDate(em30d.getDate() + 30);

  let total_valor = 0;
  let total_saldo = 0;
  let vencidos_count = 0;
  let vencidos_valor = 0;
  let a_vencer_30d_valor = 0;
  let fluxo_caixa_valor = 0;

  for (const t of titulos) {
    const v = t.v_titulo ?? 0;
    const s = t.v_saldo_atual ?? 0;
    total_valor += v;
    total_saldo += s;

    if (t.fluxo_de_caixa) fluxo_caixa_valor += s;

    if (t.d_vencimento) {
      const venc = new Date(`${t.d_vencimento}T12:00:00`);
      if (venc < hoje) {
        vencidos_count += 1;
        vencidos_valor += s;
      } else if (venc <= em30d) {
        a_vencer_30d_valor += s;
      }
    }
  }

  return {
    titulos,
    kpis: {
      total_titulos: titulos.length,
      total_valor,
      total_saldo,
      vencidos_count,
      vencidos_valor,
      a_vencer_30d_valor,
      fluxo_caixa_valor,
    },
  };
}

// ── Conciliação (CMV × boletos) ────────────────────────────────────────────────

export type BoletoConciliacao = {
  id: string;
  n_titulo: string | null;
  d_vencimento: string | null;
  v_titulo: number | null;
  /** Posição do boleto dentro do parcelamento do seu n_titulo (1-based). */
  parcelaPos: number;
  /** Total de boletos do mesmo n_titulo — "Parcela X de Y". */
  parcelaTotal: number;
};

export type NotaConciliacao = {
  chave: string;
  nr_danfe: string;
  fornecedor_nome: string | null;
  v_total_danfe: number | null;
  boletos: BoletoConciliacao[];
};

export type ConciliacaoData = {
  /** Notas de produtos_relatorio do mês/unidade — TODAS (sem filtro de
   * calcula_cmv, uma nota de material de limpeza não entra no custo do CMV
   * mas ainda é uma compra real com boleto), com os boletos vinculados por
   * n_nota_fiscal = nr_danfe. */
  notas: NotaConciliacao[];
  /** Títulos do mês (por d_vencimento, mesmo filtro da aba Títulos) sem nota
   * de produto correspondente: C1 = n_nota_fiscal null (aluguel,
   * pró-labore, serviços, impostos); C2 = n_nota_fiscal preenchido mas que
   * não bate com nenhum nr_danfe de produtos_relatorio da unidade. */
  boletosSemNota: TituloComUnidade[];
};

/** Reads incoming documents and persistent title links, including installments due in later months. */
export async function getConciliacao(unitId: string | null, mes: number, ano: number): Promise<ConciliacaoData> {
  if (!unitId) return { notas: [], boletosSemNota: [] };
  const db = await createFinanceiroClient();
  const comp = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = mes === 12 ? `${ano+1}-01-01` : `${ano}-${String(mes+1).padStart(2, "0")}-01`;
  const [docs, links, titulos] = await Promise.all([
    fetchAllPaginado((from,to) => db.from("nfe_documentos").select("chave,numero,emitente_nome,valor_total,emissao").eq("unit_id",unitId).eq("direcao","entrada").eq("cancelada",false).gte("emissao",`${comp}T00:00:00-03:00`).lt("emissao",`${fim}T00:00:00-03:00`).order("chave").range(from,to)),
    fetchAllPaginado((from,to) => db.from("reconciliacoes_sugeridas").select("titulo_id,chave_nfe").eq("unit_id",unitId).eq("status","confirmada").range(from,to)),
    fetchAllPaginado((from,to) => db.from("titulos_a_pagar").select("*").eq("unit_id",unitId).eq("origem","contas_pagar").range(from,to)),
  ]);
  const linked = new Map(links.map(r => [String(r.titulo_id), String(r.chave_nfe)]));
  const notas: NotaConciliacao[] = docs.map(n => {
    const parcelas = titulos.filter(t => linked.get(String(t.id)) === n.chave).sort((a,b) => String(a.d_vencimento).localeCompare(String(b.d_vencimento)));
    return { chave: String(n.chave), nr_danfe: String(n.numero ?? "—"), fornecedor_nome: n.emitente_nome as string|null, v_total_danfe: Number(n.valor_total),
      boletos: parcelas.map((t,i) => ({ id: String(t.id), n_titulo: t.n_titulo as string|null, d_vencimento: t.d_vencimento as string|null, v_titulo: Number(t.v_titulo), parcelaPos: i+1, parcelaTotal: parcelas.length })) };
  });
  const boletosSemNota = titulos.filter(t => !linked.has(String(t.id)) && String(t.d_vencimento ?? "") >= comp && String(t.d_vencimento ?? "") < fim).map(t => ({ ...t, unit_name: null })) as unknown as TituloComUnidade[];
  return { notas, boletosSemNota };
}
