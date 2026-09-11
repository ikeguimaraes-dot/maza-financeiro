"use client";

import { formatBRL, formatBRLCompact, formatPct } from "@/lib/financeiro/utils";
import { agruparPorCompetencia } from "./consolidar";
import { ConfiancaEClassificar } from "./ConfiancaEClassificar";
import { DreResumida } from "./DreResumida";
import type { KpiSnapshotRow, DreSnapshotRow, PlanoContaRow, MetaRow, FonteSaudeRow } from "./types";

type Props = {
  unidade: string;
  competencia: string;
  janela: string[];
  kpiRows: KpiSnapshotRow[];
  metas: MetaRow[];
  dreRows: DreSnapshotRow[];
  planoContas: PlanoContaRow[];
  fontes: FonteSaudeRow[];
};

type CardDef = {
  chave: string;
  label: string;
  formatar: (v: number) => string;
};

const CARDS: CardDef[] = [
  { chave: "receita_liquida", label: "Receita líquida", formatar: formatBRLCompact },
  { chave: "cmv_compras_pct", label: "CMV %", formatar: (v) => formatPct(v * 100) },
  { chave: "mo_pct", label: "Mão de obra %", formatar: (v) => formatPct(v * 100) },
  { chave: "prime_cost_pct", label: "Prime cost %", formatar: (v) => formatPct(v * 100) },
  { chave: "ebitda_pct", label: "EBITDA %", formatar: (v) => formatPct(v * 100) },
  { chave: "resultado_liquido", label: "Resultado líquido", formatar: formatBRLCompact },
  { chave: "clientes", label: "Clientes", formatar: (v) => v.toLocaleString("pt-BR") },
  { chave: "ticket_medio", label: "Ticket médio", formatar: formatBRL },
];

// Nomeia o que falta pra um card, dado quais fontes a competência tem.
// prime_cost e ebitda dependem dos dois lados (CMV + folha); os outros
// cards dependem só da própria fonte.
function faltantes(faltaCmv: boolean, faltaFolha: boolean): string {
  return [faltaCmv && "CMV", faltaFolha && "folha"].filter(Boolean).join(" e ");
}

// Todo card de PERCENTUAL depende de receita como denominador — sem
// receita importada, "sem NF-e"/"sem folha" é verdade mas não é a causa
// raiz, e um "—" genérico esconde que o número seria inválido (dividir
// por zero), não apenas ausente.
const CARDS_PERCENTUAIS = new Set(["cmv_compras_pct", "mo_pct", "prime_cost_pct", "ebitda_pct"]);

// Total real da conta 9.99 (a classificar) na competência — direto do
// dre_snapshot, não uma estimativa. "unidade" pode ser um unit_id ou
// "consolidado" (soma as duas).
function valor999PorUnidade(dreRows: DreSnapshotRow[], unidade: string): number {
  return dreRows
    .filter((r) => r.conta_codigo === "9.99" && (unidade === "consolidado" || r.unit_id === unidade))
    .reduce((s, r) => s + Number(r.valor), 0);
}

export function CockpitPainel({ unidade, competencia, janela, kpiRows, metas, dreRows, planoContas, fontes }: Props) {
  const porCompetencia = agruparPorCompetencia(kpiRows, janela, unidade);
  const atual = porCompetencia.get(competencia) ?? null;
  const idxAtual = janela.indexOf(competencia);
  const anterior = idxAtual > 0 ? porCompetencia.get(janela[idxAtual - 1]!) ?? null : null;
  const metasPorChave = new Map(metas.map((m) => [m.chave, m]));

  if (!atual) {
    return (
      <div style={{ padding: 48, textAlign: "center", background: "var(--surface)",
        border: "1px dashed var(--border)", borderRadius: 14, color: "var(--text-3)", fontSize: 13 }}>
        Sem snapshot pra essa combinação de unidade e competência.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* ── Linha 1: 7 cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        {CARDS.map((card) => {
          const faltaCmv = !atual.tem_nfe;
          const faltaFolha = !atual.tem_folha;
          const semReceita = !atual.receita_bruta || atual.receita_bruta === 0;

          let semDado = false;
          let semDadoTexto: string | undefined;
          let avisoParcial: string | undefined;

          if (semReceita && CARDS_PERCENTUAIS.has(card.chave)) {
            semDado = true;
            semDadoTexto = "sem receita importada";
          } else if (card.chave === "cmv_compras_pct") {
            semDado = faltaCmv;
            if (semDado) semDadoTexto = "sem dado (sem NF-e no mês)";
          } else if (card.chave === "mo_pct") {
            semDado = faltaFolha;
            if (semDado) semDadoTexto = "sem dado (sem folha no mês)";
          } else if (card.chave === "prime_cost_pct") {
            semDado = faltaCmv || faltaFolha;
            if (semDado) semDadoTexto = `sem dado (falta ${faltantes(faltaCmv, faltaFolha)})`;
          } else if ((card.chave === "ebitda_pct" || card.chave === "resultado_liquido") && (faltaCmv || faltaFolha)) {
            // EBITDA e resultado líquido (derivado dele) nunca ficam "sem
            // dado" — mostra o valor parcial, mas avisa o que está
            // faltando pra não ser lido como definitivo.
            avisoParcial = `parcial — faltam ${faltantes(faltaCmv, faltaFolha)}`;
          }

          const valorAtual = (atual as unknown as Record<string, number | null>)[card.chave];
          const valorAnterior = anterior ? (anterior as unknown as Record<string, number | null>)[card.chave] : null;
          const serie = janela.map((c) => {
            const row = porCompetencia.get(c);
            if (!row) return null;
            const v = (row as unknown as Record<string, number | null>)[card.chave];
            return v;
          });
          const meta = metasPorChave.get(card.chave) ?? null;
          const destaque = card.chave === "prime_cost_pct" && valorAtual != null && valorAtual > 0.65;

          return (
            <KpiCard
              key={card.chave}
              label={card.label}
              valor={semDado ? null : valorAtual ?? null}
              valorAnterior={semDado ? null : valorAnterior ?? null}
              formatar={card.formatar}
              serie={serie.map((v) => v ?? null)}
              meta={meta}
              destaqueVermelho={destaque}
              badge={card.chave === "cmv_compras_pct" ? "de compras" : undefined}
              semDadoTexto={semDadoTexto}
              avisoParcial={avisoParcial}
            />
          );
        })}
      </div>

      <ConfiancaEClassificar
        unidade={unidade}
        atual={atual}
        fontes={fontes}
        competencia={competencia}
        valorNaoClassificado={valor999PorUnidade(dreRows, unidade)}
      />

      <DreResumida dreRows={dreRows} planoContas={planoContas} receitaLiquida={atual.receita_liquida ?? 0} />
    </div>
  );
}

function KpiCard({ label, valor, valorAnterior, formatar, serie, meta, destaqueVermelho, badge, semDadoTexto, avisoParcial }: {
  label: string;
  valor: number | null;
  valorAnterior: number | null;
  formatar: (v: number) => string;
  serie: Array<number | null>;
  meta: MetaRow | null;
  destaqueVermelho: boolean;
  badge?: string;
  semDadoTexto?: string;
  avisoParcial?: string;
}) {
  const delta = valor != null && valorAnterior != null && valorAnterior !== 0
    ? ((valor - valorAnterior) / Math.abs(valorAnterior)) * 100
    : null;

  return (
    <div style={{
      background: destaqueVermelho ? "rgba(239,68,68,0.08)" : "var(--surface)",
      border: `1px solid ${destaqueVermelho ? "#EF4444" : "var(--border)"}`,
      borderRadius: 12, padding: "14px 16px", display: "grid", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-3)" }}>
          {label}
        </span>
        {badge && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", background: "var(--surface-2)",
            padding: "1px 6px", borderRadius: 99, whiteSpace: "nowrap" }}>
            {badge}
          </span>
        )}
      </div>

      {semDadoTexto ? (
        <p style={{ fontSize: 13, color: "var(--text-3)", fontStyle: "italic", margin: "4px 0" }}>{semDadoTexto}</p>
      ) : (
        <>
          <p style={{ fontSize: 24, fontWeight: 800, color: destaqueVermelho ? "#EF4444" : "var(--text)", margin: 0, lineHeight: 1 }}>
            {valor != null ? formatar(valor) : "—"}
          </p>
          {avisoParcial && (
            <p style={{ fontSize: 10, color: "#F59E0B", fontWeight: 600, margin: 0 }}>{avisoParcial}</p>
          )}
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, color: delta == null ? "var(--text-3)" : delta > 0 ? "#EF4444" : "#22C55E" }}>
          {delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs mês ant.` : "—"}
        </span>
        <Sparkline valores={serie} />
      </div>

      <div style={{ fontSize: 10, color: "var(--text-3)" }}>
        Meta: {meta ? `${formatar(meta.valor)} (${meta.origem === "manual" ? "manual" : "baseline"})` : "—"}
      </div>
    </div>
  );
}

function Sparkline({ valores }: { valores: Array<number | null> }) {
  const validos = valores.filter((v): v is number => v != null);
  if (validos.length < 2) return <span style={{ fontSize: 10, color: "var(--text-3)" }}>—</span>;

  const w = 64, h = 22;
  const min = Math.min(...validos), max = Math.max(...validos);
  const range = max - min || 1;
  const step = w / (valores.length - 1);
  const pontos: string[] = [];
  valores.forEach((v, i) => {
    if (v != null) {
      const y = h - ((v - min) / range) * h;
      pontos.push(`${i * step},${y.toFixed(1)}`);
    }
  });
  if (pontos.length < 2) return <span style={{ fontSize: 10, color: "var(--text-3)" }}>—</span>;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <polyline points={pontos.join(" ")} fill="none" stroke="var(--brand, #C4622D)" strokeWidth={1.5} />
    </svg>
  );
}
