import Link from "next/link";
import { requireUser } from "@maza/auth/server";
import { getCurrentUnitComOrigem } from "@maza/auth/unit";
import { createSupabaseServerClient } from "@maza/db/supabase/server";
import { competenciaLabel, competenciaShift } from "@/lib/financeiro/utils";
import { CockpitPainel } from "@/components/financeiro/cockpit/CockpitPainel";
import { AvisoUnidadeFallback } from "@/components/financeiro/AvisoUnidadeFallback";
import type {
  KpiSnapshotRow,
  DreSnapshotRow,
  PlanoContaRow,
  MetaRow,
  FonteSaudeRow,
} from "@/components/financeiro/cockpit/types";

export const dynamic = "force-dynamic";

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

type SearchParams = Promise<{ consolidado?: string; competencia?: string }>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(buildQuery: (from: number, to: number) => any) {
  const pageSize = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}

export default async function FinanceiroHubPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const sp = await searchParams;

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const unitIdsTodos: string[] = UNIDADES.map((u) => u.id);

  const todasCompetencias = (await fetchAll((from, to) =>
    db.from("kpi_snapshot").select("competencia").in("unit_id", unitIdsTodos).order("competencia").range(from, to),
  )) as Array<{ competencia: string }>;
  const competenciasDisponiveis = [...new Set(todasCompetencias.map((c) => c.competencia))].sort();

  const consolidado = sp.consolidado === "1";
  const { unit, cookiePresente } = await getCurrentUnitComOrigem();
  const unidadeParam = consolidado ? "consolidado" : (unit?.id ?? "consolidado");
  const unidadeNome = consolidado ? "Consolidado" : (unit?.name ?? "Consolidado");
  const competenciaParam = sp.competencia && competenciasDisponiveis.includes(sp.competencia)
    ? sp.competencia
    : (competenciasDisponiveis.at(-1) ?? null);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto" }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: "var(--text-3)" }}>
          Cockpit financeiro
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", letterSpacing: -0.5, margin: "8px 0 4px" }}>
          Financeiro · {unidadeNome}{competenciaParam ? ` · ${competenciaLabel(competenciaParam)}` : ""}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", maxWidth: 640, margin: "0 0 8px" }}>
          Lê só do razão (lançamentos → snapshot). Número incompleto aparece como incompleto, nunca como zero.
        </p>
        {!consolidado && <AvisoUnidadeFallback cookiePresente={cookiePresente} />}
        <Seletores consolidado={consolidado} competencia={competenciaParam} competencias={competenciasDisponiveis} />
      </header>

      {!competenciaParam ? (
        <div style={{ padding: 48, textAlign: "center", background: "var(--surface)",
          border: "1px dashed var(--border)", borderRadius: 14, color: "var(--text-3)", fontSize: 13 }}>
          Nenhum snapshot gerado ainda. Rode gerarRazao() pra alguma unidade/competência primeiro.
        </div>
      ) : (
        <PainelData
          db={db}
          unidadeParam={unidadeParam}
          competenciaParam={competenciaParam}
          unitIdsTodos={unitIdsTodos}
        />
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

  const kpiRows = (await fetchAll((from, to) =>
    db.from("kpi_snapshot").select("*").in("unit_id", unitIds).in("competencia", janela).range(from, to),
  )) as KpiSnapshotRow[];

  // Metas só fazem sentido pra uma unidade específica — combinar metas de
  // duas units num "Consolidado" exigiria uma regra que não foi definida.
  const metas = unidadeParam === "consolidado"
    ? []
    : ((await fetchAll((from, to) =>
        db.from("metas").select("chave,valor,tipo,origem").eq("unit_id", unidadeParam).eq("competencia", competenciaParam).range(from, to),
      )) as MetaRow[]);

  const dreRows = (await fetchAll((from, to) =>
    db.from("dre_snapshot").select("unit_id,conta_codigo,valor,qtd_lancamentos").in("unit_id", unitIds).eq("competencia", competenciaParam).range(from, to),
  )) as DreSnapshotRow[];

  const planoContas = (await fetchAll((from, to) =>
    db.from("plano_contas").select("codigo,nome,grupo,ordem").order("ordem").range(from, to),
  )) as PlanoContaRow[];

  const fontes = (await fetchAll((from, to) =>
    db.from("v_fonte_saude").select("fonte,ultima_escrita,dias_sem_atualizacao,status_fonte").range(from, to),
  )) as FonteSaudeRow[];

  return (
    <CockpitPainel
      unidade={unidadeParam}
      competencia={competenciaParam}
      janela={janela}
      kpiRows={kpiRows}
      metas={metas}
      dreRows={dreRows}
      planoContas={planoContas}
      fontes={fontes}
    />
  );
}

function Seletores({ consolidado, competencia, competencias }: {
  consolidado: boolean; competencia: string | null; competencias: string[];
}) {
  const linkStyle = (ativo: boolean): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: ativo ? 700 : 500,
    textDecoration: "none", whiteSpace: "nowrap",
    background: ativo ? "var(--brand, #C4622D)" : "var(--surface-2)",
    color: ativo ? "var(--primary-foreground)" : "var(--text-3)",
    border: "1px solid var(--border)",
  });
  const href = (consolidadoVal: boolean, competenciaVal: string | null) => {
    const params = new URLSearchParams();
    if (consolidadoVal) params.set("consolidado", "1");
    if (competenciaVal) params.set("competencia", competenciaVal);
    return `/financeiro?${params.toString()}`;
  };

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
      {/* Consolidado é um MODO de exibição (soma as duas unidades), não um
          seletor de unidade — a unidade única vem exclusivamente do cookie
          do shell. */}
      <Link href={href(!consolidado, competencia)} style={linkStyle(consolidado)}>
        {consolidado ? "✓ Consolidado" : "Ver consolidado"}
      </Link>
      {competencias.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {competencias.map((c) => (
            <Link key={c} href={href(consolidado, c)} style={linkStyle(c === competencia)}>
              {competenciaLabel(c)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
