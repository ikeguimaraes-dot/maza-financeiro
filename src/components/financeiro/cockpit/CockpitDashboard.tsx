import { fetchCockpitRows as fetchAll, snapshotsAreStale } from "./data";
import { calcularDespesa, type FolhaDespesa, type TituloDespesa } from "./despesa";
import "server-only";
import { Suspense } from "react";
import Loading from "@/app/financeiro/loading";
import { requireUser } from "@maza/auth/server";
import { getCurrentUnitComOrigem } from "@maza/auth/unit";
import { createSupabaseServerClient } from "@maza/db/supabase/server";
import { competenciaShift } from "@/lib/financeiro/utils";
import { CockpitHeader } from "@/components/financeiro/cockpit/CockpitHeader";
import { CockpitEmpty } from "@/components/financeiro/cockpit/CockpitPainel";
import { CockpitPainel } from "@/components/financeiro/cockpit/CockpitPainel";
import { AvisoUnidadeFallback } from "@/components/financeiro/AvisoUnidadeFallback";
import type {
  KpiSnapshotRow,
  DreSnapshotRow,
  PlanoContaRow,
  MetaRow,
} from "@/components/financeiro/cockpit/types";

// Únicas duas units operacionais do grupo (sql/026_cmv_bootstrap.sql) — só
// usadas pra montar a visão Consolidado (soma das duas). A unidade ÚNICA
// vem do cookie do shell (getCurrentUnitComOrigem), nunca de um seletor
// local — evita a tela mostrar uma unidade diferente da selecionada no menu.
const YOSHIMORI_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909c";
const IKY_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909b";
export const UNIDADES = [
  { id: YOSHIMORI_UNIT_ID, nome: "Yoshimori" },
  { id: IKY_UNIT_ID, nome: "IKY" },
] as const;

const JANELA_MESES = 6;

export type CockpitSearchParams = Promise<{ consolidado?: string; competencia?: string }>;

export async function CockpitDashboard({ searchParams, basePath = "/financeiro" }: { searchParams: CockpitSearchParams; basePath?: "/financeiro" | "/dashboard" }) {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const unitIdsTodos: string[] = UNIDADES.map((u) => u.id);

  if (!db) throw new Error("Banco de dados indisponível");
  // Rendering is read-only. Imports refresh snapshots through applyBatch;
  // scanning and rebuilding the whole ledger here blocks both entry pages.
  // Independent reads run together using the user's RLS-protected client.
  // Authentication must still finish before any content is returned.
  const [sp, , contexto, todasCompetencias] = await Promise.all([
    searchParams,
    requireUser(),
    getCurrentUnitComOrigem(),
    fetchAll<{ competencia: string }>((from, to) =>
      db.from("kpi_snapshot").select("competencia").in("unit_id", unitIdsTodos)
        .order("competencia").order("unit_id").range(from, to)),
  ]);
  const competenciasDisponiveis = [...new Set(todasCompetencias.map((c) => c.competencia))].sort();

  const consolidado = sp.consolidado === "1";
  const { unit, cookiePresente } = contexto;
  const unidadeParam = consolidado ? "consolidado" : (unit?.id ?? "consolidado");
  const unidadeNome = consolidado ? "Consolidado" : (unit?.name ?? "Consolidado");
  const competenciaParam = sp.competencia && competenciasDisponiveis.includes(sp.competencia)
    ? sp.competencia
    : (competenciasDisponiveis.at(-1) ?? null);

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto" }}>
      <CockpitHeader unidade={unidadeNome} competencia={competenciaParam} competencias={competenciasDisponiveis} consolidado={consolidado} basePath={basePath} />
      {!consolidado && <AvisoUnidadeFallback cookiePresente={cookiePresente} />}

      {!competenciaParam ? (
        <CockpitEmpty />
      ) : (
        <Suspense key={`${unidadeParam}:${competenciaParam}`} fallback={<Loading />}><PainelData
          db={db}
          unidadeParam={unidadeParam}
          competenciaParam={competenciaParam}
          unitIdsTodos={unitIdsTodos}
        /></Suspense>
      )}
    </div>
  );
}

async function PainelData({ db, unidadeParam, competenciaParam, unitIdsTodos }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any; unidadeParam: string; competenciaParam: string; unitIdsTodos: string[];
}) {
  const unitIds = unidadeParam === "consolidado" ? unitIdsTodos : [unidadeParam];

  const janela: string[] = [];
  for (let i = JANELA_MESES - 1; i >= 0; i--) janela.push(competenciaShift(competenciaParam, -i));

  const proximoMes = competenciaShift(competenciaParam, 1);
  const [kpiRows, metas, dreRows, planoContas, revisoes, folhaEmpresa, contasPagar] = await Promise.all([
    fetchAll<KpiSnapshotRow & { revisao_fonte: number | null }>((from, to) =>
      db.from("kpi_snapshot").select("*").in("unit_id", unitIds).in("competencia", janela).order("unit_id").order("competencia").range(from, to)),
    // Metas de unidades diferentes não possuem uma regra de consolidação.
    unidadeParam === "consolidado" ? Promise.resolve([] as MetaRow[]) : fetchAll<MetaRow>((from, to) =>
      db.from("metas").select("chave,valor,tipo,origem").eq("unit_id", unidadeParam).eq("competencia", competenciaParam).order("chave").range(from, to)),
    fetchAll<DreSnapshotRow>((from, to) =>
      db.from("dre_snapshot").select("unit_id,conta_codigo,valor,qtd_lancamentos").in("unit_id", unitIds).eq("competencia", competenciaParam).order("unit_id").order("conta_codigo").range(from, to)),
    fetchAll<PlanoContaRow>((from, to) =>
      db.from("plano_contas").select("codigo,nome,grupo,ordem").order("ordem").order("codigo").range(from, to)),
    fetchAll<{ unit_id: string; revisao: number }>((from, to) =>
      db.from("financeiro_revisoes").select("unit_id,revisao").in("unit_id", unitIds).order("unit_id").range(from, to)),
    fetchAll<FolhaDespesa>((from, to) =>
      db.from("folha_empresa").select("unit_id,competencia,etapa,pagamento,bonificacao").in("unit_id", unitIds)
        .eq("competencia", competenciaParam.slice(0, 7)).order("id").range(from, to)),
    fetchAll<TituloDespesa>((from, to) =>
      db.from("titulos_a_pagar").select("unit_id,origem,v_titulo,d_competencia,d_lancamento,d_vencimento")
        .in("unit_id", unitIds).eq("origem", "contas_pagar")
        .or(`and(d_competencia.gte.${competenciaParam},d_competencia.lt.${proximoMes}),and(d_competencia.is.null,d_lancamento.gte.${competenciaParam},d_lancamento.lt.${proximoMes}),and(d_competencia.is.null,d_lancamento.is.null,d_vencimento.gte.${competenciaParam},d_vencimento.lt.${proximoMes})`)
        .order("id").range(from, to)),
  ]);
  const desatualizado = snapshotsAreStale(kpiRows, revisoes);

  return (
    <>
    {desatualizado && <div role="status" className="maza-panel" style={{ padding: 16, marginBottom: 16 }}>Há alterações aguardando recálculo. Os valores abaixo são os últimos resultados calculados e podem estar desatualizados.</div>}
    {kpiRows.some(r => r.competencia === competenciaParam && Number(r.possivel_dupla_contagem) > 0) && <div role="status" className="maza-panel" style={{ padding: 16, marginBottom: 16 }}>Fechamento pendente: há despesas sem correspondência documental confirmada. Os totais podem conter compras repetidas. Confira as divergências e os títulos antes de validar o resultado do mês.</div>}
    <CockpitPainel
      unidade={unidadeParam}
      competencia={competenciaParam}
      janela={janela}
      kpiRows={kpiRows}
      metas={metas}
      dreRows={dreRows}
      planoContas={planoContas}
      despesa={calcularDespesa(unitIds, competenciaParam, folhaEmpresa, contasPagar)}
    />
    </>
  );
}
