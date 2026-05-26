"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@kph/db/supabase/server";
import { requireUser } from "@kph/auth/server";
import type { ActionResult } from "@/lib/result";
import {
  createMenuItemSchema,
  createEntrySchema,
  createPeriodSchema,
  updateMenuItemSchema,
  type CreateMenuItemInput,
  type CreateEntryInput,
  type UpdateMenuItemInput,
} from "@/lib/financeiro/schema";
import { getCompetenciaAtual } from "@/lib/financeiro/utils";
import type {
  ApprovalRequestRow,
  AprovacaoPendenteRow,
  Brand,
  BrandFinancialConfigRow,
  CashFlowEntryRow,
  CmvDashboardRow,
  MenuItemRow,
  DreConsolidadoRow,
  FinancialPeriodRow,
  GapProjecaoRealizadoRow,
  LancamentoStatus,
  ApprovalStatus,
} from "@kph/db/types/database";
import type {
  CmvFilters,
  EntryFilters,
  FinanceiroResumoGrupo,
} from "@/lib/financeiro/types";

// ── Period ─────────────────────────────────────────────────────

/** Busca ou cria financial_period (idempotente via UNIQUE). */
export async function getOrCreatePeriod(
  brandId: string,
  competencia: string,
): Promise<ActionResult<FinancialPeriodRow>> {
  try {
    const parsed = createPeriodSchema.safeParse({ brand_id: brandId, competencia });
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos" };
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    // Tenta buscar primeiro.
    const { data: existing, error: fetchErr } = await supabase
      .from("financial_periods")
      .select("*")
      .eq("brand_id", brandId)
      .eq("competencia", competencia)
      .is("unit_id", null)
      .maybeSingle();
    if (fetchErr) {
      return { ok: false, error: fetchErr.message };
    }
    if (existing) {
      return { ok: true, data: existing as FinancialPeriodRow };
    }

    // Resolve group_id da brand.
    const { data: brandRaw, error: brandErr } = await supabase
      .from("brands")
      .select("id, group_id")
      .eq("id", brandId)
      .maybeSingle();
    const brand = brandRaw as { id: string; group_id: string | null } | null;
    if (brandErr || !brand?.group_id) {
      return { ok: false, error: "Marca inválida ou sem group_id" };
    }

    const { data: created, error: insertErr } = await supabase
      .from("financial_periods")
      .insert({
        group_id: brand.group_id,
        brand_id: brandId,
        unit_id: null,
        competencia,
      } as never)
      .select("*")
      .single();
    if (insertErr || !created) {
      return { ok: false, error: insertErr?.message ?? "Falha ao criar período" };
    }
    revalidatePath(`/financeiro`);
    return { ok: true, data: created as FinancialPeriodRow };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro inesperado",
    };
  }
}

export async function getPeriodsByBrand(
  brandId: string,
  limit: number = 12,
): Promise<FinancialPeriodRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("financial_periods")
      .select("*")
      .eq("brand_id", brandId)
      .order("competencia", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[getPeriodsByBrand] error:", error.message);
      return [];
    }
    return (data ?? []) as FinancialPeriodRow[];
  } catch (e) {
    console.error("[getPeriodsByBrand] exceção:", e);
    return [];
  }
}

// ── DRE ────────────────────────────────────────────────────────

export async function getDreConsolidado(
  brandId: string,
  competencia?: string | null,
): Promise<DreConsolidadoRow | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const comp = competencia ?? getCompetenciaAtual();
    const { data, error } = await supabase
      .from("v_dre_consolidado")
      .select("*")
      .eq("brand_id", brandId)
      .eq("competencia", comp)
      .maybeSingle();
    if (error) {
      console.error("[getDreConsolidado] error:", error.message);
      return null;
    }
    return (data as DreConsolidadoRow | null) ?? null;
  } catch (e) {
    console.error("[getDreConsolidado] exceção:", e);
    return null;
  }
}

export async function getGapProjecaoRealizado(
  brandId: string,
  competencia?: string | null,
): Promise<GapProjecaoRealizadoRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const comp = competencia ?? getCompetenciaAtual();
    const { data, error } = await supabase
      .from("v_gap_projecao_realizado")
      .select("*")
      .eq("brand_id", brandId)
      .eq("competencia", comp);
    if (error) {
      console.error("[getGapProjecaoRealizado] error:", error.message);
      return [];
    }
    const rows = (data ?? []) as GapProjecaoRealizadoRow[];
    // Ordena por |gap_pct| DESC, nulls no fim.
    return rows.sort((a, b) => {
      const gA = a.gap_pct === null ? -Infinity : Math.abs(a.gap_pct);
      const gB = b.gap_pct === null ? -Infinity : Math.abs(b.gap_pct);
      return gB - gA;
    });
  } catch (e) {
    console.error("[getGapProjecaoRealizado] exceção:", e);
    return [];
  }
}

// ── Cash flow entries ──────────────────────────────────────────

export async function getCashFlowEntries(
  periodId: string,
  filters?: EntryFilters,
): Promise<CashFlowEntryRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    let query = supabase
      .from("cash_flow_entries")
      .select("*")
      .eq("period_id", periodId)
      .order("data_lancamento", { ascending: false });
    if (filters?.natureza) {
      query = query.eq("natureza", filters.natureza);
    }
    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    const { data, error } = await query;
    if (error) {
      console.error("[getCashFlowEntries] error:", error.message);
      return [];
    }
    return (data ?? []) as CashFlowEntryRow[];
  } catch (e) {
    console.error("[getCashFlowEntries] exceção:", e);
    return [];
  }
}

/**
 * Cria lançamento. Se valor > threshold da marca, automaticamente:
 *   1. Status do entry = 'pendente_aprovacao' (não 'rascunho')
 *   2. Cria approval_request vinculado
 *
 * Validação cruzada: justificativa obrigatória se acima do threshold.
 */
export async function createCashFlowEntry(
  input: CreateEntryInput,
): Promise<ActionResult<{ id: string; needsApproval: boolean }>> {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    // Resolve período + brand pra descobrir threshold antes de validar.
    const { data: periodRaw, error: pErr } = await supabase
      .from("financial_periods")
      .select("id, brand_id")
      .eq("id", input.period_id)
      .maybeSingle();
    const period = periodRaw as { id: string; brand_id: string } | null;
    if (pErr || !period) {
      return { ok: false, error: "Período inválido" };
    }

    const { data: configRaw } = await supabase
      .from("brand_financial_config")
      .select("*")
      .eq("brand_id", period.brand_id)
      .maybeSingle();
    const config = configRaw as BrandFinancialConfigRow | null;
    const threshold = Number(config?.threshold_aprovacao ?? 5000);

    // Valida com threshold conhecido.
    const parsed = createEntrySchema.safeParse({ ...input, threshold });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return {
        ok: false,
        error: first ? `${first.path.join(".")}: ${first.message}` : "Dados inválidos",
      };
    }
    const data = parsed.data;
    const valor = Number(data.valor);
    const needsApproval = valor > threshold;
    const status: LancamentoStatus = needsApproval ? "pendente_aprovacao" : "rascunho";

    const entryInsert = {
      period_id: data.period_id,
      natureza: data.natureza,
      categoria_receita: data.natureza === "receita" ? data.categoria_receita ?? null : null,
      categoria_despesa: data.natureza === "despesa" ? data.categoria_despesa ?? null : null,
      descricao: data.descricao,
      valor,
      data_lancamento: data.data_lancamento,
      data_vencimento: data.data_vencimento,
      data_pagamento: data.data_pagamento,
      regime: data.regime,
      fornecedor: data.fornecedor,
      numero_documento: data.numero_documento,
      centro_custo: data.centro_custo,
      event_id: data.event_id ?? null,
      status,
      criado_por: user.id,
    };

    const { data: entry, error: insErr } = await supabase
      .from("cash_flow_entries")
      .insert(entryInsert as never)
      .select("id")
      .single();
    if (insErr || !entry) {
      return { ok: false, error: insErr?.message ?? "Falha ao criar lançamento" };
    }
    const entryId = (entry as { id: string }).id;

    if (needsApproval) {
      const { error: arErr } = await supabase
        .from("approval_requests")
        .insert({
          entry_id: entryId,
          brand_id: period.brand_id,
          solicitante_id: user.id,
          valor,
          descricao: data.descricao,
          justificativa: data.justificativa,
        } as never);
      if (arErr) {
        console.error("[createCashFlowEntry] approval insert falhou:", arErr.message);
        // Não rollbacka o entry — fica pendente_aprovacao mas sem request;
        // founder/cfo ainda pode aprovar manualmente via updateEntryStatus.
      }
    }

    revalidatePath("/financeiro");
    return { ok: true, data: { id: entryId, needsApproval } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro inesperado",
    };
  }
}

/**
 * Aprova/rejeita/cancela/paga um lançamento. Aprovação/rejeição é
 * exclusiva de founder/cfo (RLS já bloqueia, mas double-check aqui).
 */
export async function updateEntryStatus(
  entryId: string,
  status: LancamentoStatus,
  motivo?: string | null,
): Promise<ActionResult<{ id: string; status: LancamentoStatus }>> {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const isApprovalAction = status === "aprovado" || status === "rejeitado";
    if (isApprovalAction) {
      const ok = user.roles.some(
        (r) => r.role === "founder" || r.role === "cfo",
      );
      if (!ok) {
        return { ok: false, error: "Apenas founder ou CFO podem aprovar/rejeitar" };
      }
    }

    const updatePayload: Record<string, unknown> = { status };
    if (status === "aprovado") {
      updatePayload.aprovado_por = user.id;
      updatePayload.aprovado_at = new Date().toISOString();
    }
    if (status === "rejeitado") {
      updatePayload.rejeitado_por = user.id;
      updatePayload.rejeitado_at = new Date().toISOString();
      updatePayload.motivo_rejeicao = motivo ?? null;
    }
    if (status === "pago") {
      updatePayload.data_pagamento = new Date().toISOString().slice(0, 10);
    }

    const { error: updErr } = await supabase
      .from("cash_flow_entries")
      .update(updatePayload as never)
      .eq("id", entryId);
    if (updErr) {
      return { ok: false, error: updErr.message };
    }

    revalidatePath("/financeiro");
    return { ok: true, data: { id: entryId, status } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro inesperado",
    };
  }
}

// ── Aprovações ─────────────────────────────────────────────────

export async function getAprovacoesPendentes(
  brandId?: string | null,
): Promise<AprovacaoPendenteRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    let query = supabase
      .from("v_aprovacoes_pendentes")
      .select("*")
      .order("created_at", { ascending: true });
    if (brandId) query = query.eq("brand_id", brandId);
    const { data, error } = await query;
    if (error) {
      console.error("[getAprovacoesPendentes] error:", error.message);
      return [];
    }
    return (data ?? []) as AprovacaoPendenteRow[];
  } catch (e) {
    console.error("[getAprovacoesPendentes] exceção:", e);
    return [];
  }
}

/**
 * Responde a uma approval_request: atualiza approval + entry status num
 * par de calls. RLS impede usuários sem founder/cfo (a action também valida).
 */
export async function responderAprovacao(
  approvalId: string,
  decisao: "aprovado" | "rejeitado",
  motivo?: string | null,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const isAprovador = user.roles.some(
      (r) => r.role === "founder" || r.role === "cfo",
    );
    if (!isAprovador) {
      return { ok: false, error: "Apenas founder ou CFO podem aprovar/rejeitar" };
    }
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const { data: arRaw, error: fetchErr } = await supabase
      .from("approval_requests")
      .select("id, entry_id, status")
      .eq("id", approvalId)
      .maybeSingle();
    const ar = arRaw as Pick<ApprovalRequestRow, "id" | "entry_id" | "status"> | null;
    if (fetchErr || !ar) {
      return { ok: false, error: fetchErr?.message ?? "Solicitação não encontrada" };
    }
    if (ar.status !== "pendente") {
      return { ok: false, error: "Solicitação já foi respondida" };
    }

    const novoStatusApproval: ApprovalStatus = decisao;

    const { error: updArErr } = await supabase
      .from("approval_requests")
      .update({
        status: novoStatusApproval,
        aprovador_id: user.id,
        respondido_em: new Date().toISOString(),
      } as never)
      .eq("id", approvalId);
    if (updArErr) {
      return { ok: false, error: updArErr.message };
    }

    // Cascateia status do entry.
    const novoEntryStatus: LancamentoStatus =
      decisao === "aprovado" ? "aprovado" : "rejeitado";
    const result = await updateEntryStatus(ar.entry_id, novoEntryStatus, motivo);
    if (!result.ok) {
      console.error("[responderAprovacao] cascade entry falhou:", result.error);
      // Approval já foi marcado — UI mostra desconexão, mas não revertemos
      // (perda de auditoria seria pior). Founder pode forçar via updateEntryStatus.
    }

    revalidatePath("/financeiro");
    return { ok: true, data: { id: approvalId } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro inesperado",
    };
  }
}

// ── CMV ────────────────────────────────────────────────────────

export async function getCmvDashboard(
  brandId: string,
): Promise<CmvDashboardRow | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("v_cmv_dashboard")
      .select("*")
      .eq("brand_id", brandId)
      .maybeSingle();
    if (error) {
      console.error("[getCmvDashboard] error:", error.message);
      return null;
    }
    return (data as CmvDashboardRow | null) ?? null;
  } catch (e) {
    console.error("[getCmvDashboard] exceção:", e);
    return null;
  }
}

export async function getMenuItems(
  brandId: string,
  filters?: CmvFilters,
): Promise<MenuItemRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    let query = supabase
      .from("menu_items")
      .select("*")
      .eq("brand_id", brandId)
      .eq("ativo", true)
      .order("nome");
    if (filters?.semFicha) query = query.eq("tem_ficha_tecnica", false);
    if (filters?.criticos) query = query.gt("cmv_pct", 40);
    if (filters?.categoria) query = query.eq("categoria", filters.categoria);
    const { data, error } = await query;
    if (error) {
      console.error("[getMenuItems] error:", error.message);
      return [];
    }
    return (data ?? []) as MenuItemRow[];
  } catch (e) {
    console.error("[getMenuItems] exceção:", e);
    return [];
  }
}

export async function createMenuItem(
  input: CreateMenuItemInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const parsed = createMenuItemSchema.safeParse(input);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return {
        ok: false,
        error: first?.message ?? "Dados inválidos",
      };
    }
    const data = parsed.data;

    const { data: created, error } = await supabase
      .from("menu_items")
      .insert({
        ...data,
        criado_por: user.id,
      } as never)
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, error: error?.message ?? "Falha ao criar item" };
    }
    revalidatePath("/financeiro");
    return { ok: true, data: { id: (created as { id: string }).id } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro inesperado",
    };
  }
}

export async function updateMenuItem(
  id: string,
  input: UpdateMenuItemInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const parsed = updateMenuItemSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    }

    const { error } = await supabase
      .from("menu_items")
      .update(parsed.data as never)
      .eq("id", id);
    if (error) {
      return { ok: false, error: error.message };
    }
    revalidatePath("/financeiro");
    return { ok: true, data: { id } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro inesperado",
    };
  }
}

// ── Resumo do grupo (pro dashboard executivo) ──────────────────

export async function getFinanceiroResumoGrupo(): Promise<FinanceiroResumoGrupo> {
  const empty: FinanceiroResumoGrupo = {
    aprovacoes_pendentes: 0,
    receita_mes_atual: 0,
    despesa_mes_atual: 0,
    ebitda_mes_atual: 0,
    ebitda_pct_medio: null,
    cmv_pct_medio: null,
    itens_cmv_criticos: 0,
  };
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return empty;
    const comp = getCompetenciaAtual();

    const [aprovRes, dreRes, cmvRes] = await Promise.all([
      supabase
        .from("v_aprovacoes_pendentes")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("v_dre_consolidado")
        .select("*")
        .eq("competencia", comp),
      supabase.from("v_cmv_dashboard").select("*"),
    ]);

    const dreRows = (dreRes.data ?? []) as DreConsolidadoRow[];
    const cmvRows = (cmvRes.data ?? []) as CmvDashboardRow[];

    const receita = dreRows.reduce((s, r) => s + Number(r.receita_bruta ?? 0), 0);
    const despesa = dreRows.reduce((s, r) => s + Number(r.despesa_total ?? 0), 0);
    const ebitda = dreRows.reduce((s, r) => s + Number(r.ebitda ?? 0), 0);

    const ebitda_pct_medio = receita > 0 ? (ebitda / receita) * 100 : null;
    const cmvSomatorio = dreRows.reduce(
      (s, r) =>
        s +
        (r.cmv_pct !== null && r.receita_bruta > 0
          ? Number(r.cmv_pct) * Number(r.receita_bruta)
          : 0),
      0,
    );
    const cmv_pct_medio = receita > 0 ? cmvSomatorio / receita : null;

    const itens_cmv_criticos = cmvRows.reduce(
      (s, c) => s + Number(c.itens_criticos_acima_40 ?? 0),
      0,
    );

    return {
      aprovacoes_pendentes: aprovRes.count ?? 0,
      receita_mes_atual: receita,
      despesa_mes_atual: despesa,
      ebitda_mes_atual: ebitda,
      ebitda_pct_medio,
      cmv_pct_medio,
      itens_cmv_criticos,
    };
  } catch (e) {
    console.error("[getFinanceiroResumoGrupo] exceção:", e);
    return empty;
  }
}

// ── Helpers de página ──────────────────────────────────────────

export async function getBrandBySlug(slug: string): Promise<Brand | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("brands")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return null;
    return (data as Brand | null) ?? null;
  } catch (e) {
    console.error("[getBrandBySlug] exceção:", e);
    return null;
  }
}

export async function getBrandFinancialConfig(
  brandId: string,
): Promise<BrandFinancialConfigRow | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from("brand_financial_config")
      .select("*")
      .eq("brand_id", brandId)
      .maybeSingle();
    return (data as BrandFinancialConfigRow | null) ?? null;
  } catch (e) {
    console.error("[getBrandFinancialConfig] exceção:", e);
    return null;
  }
}

/** Brands operacionais (com pelo menos 1 financial_period). Listagem do hub. */
export async function getBrandsOperacionais(): Promise<
  Array<Brand & { has_period: boolean }>
> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const { data: brands, error } = await supabase
      .from("brands")
      .select("*")
      .eq("active", true)
      .order("name");
    if (error || !brands) return [];

    const { data: periods } = await supabase
      .from("financial_periods")
      .select("brand_id");
    const withPeriod = new Set(
      ((periods ?? []) as Array<{ brand_id: string }>).map((p) => p.brand_id),
    );

    return (brands as Brand[]).map((b) => ({
      ...b,
      has_period: withPeriod.has(b.id),
    }));
  } catch (e) {
    console.error("[getBrandsOperacionais] exceção:", e);
    return [];
  }
}

/** Eventos da marca pra autocomplete no form de lançamento. */
export async function getEventOptionsForBrand(brandId: string): Promise<
  Array<{ id: string; nome: string; data_inicio: string }>
> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("events")
      .select("id, nome, data_inicio")
      .eq("brand_id", brandId)
      .order("data_inicio", { ascending: false })
      .limit(50);
    if (error) return [];
    return (data ?? []) as Array<{ id: string; nome: string; data_inicio: string }>;
  } catch (e) {
    console.error("[getEventOptionsForBrand] exceção:", e);
    return [];
  }
}

