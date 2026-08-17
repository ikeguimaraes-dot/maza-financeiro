import Link from "next/link";
import { requireUser } from "@kph/auth/server";
import { getCurrentUnit } from "@kph/auth/unit";
import { getPagarKpisETitulos } from "../actions-operations";
import { ImportPagarButton } from "@/components/financeiro/ImportPagarButton";
import { FiltroCategoria } from "@/components/financeiro/FiltroCategoria";
import { PagarConteudo } from "@/components/financeiro/PagarConteudo";
import {
  competenciaLabel,
  competenciaShift,
  getCompetenciaAtual,
} from "@/lib/financeiro/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ competencia?: string; categoria?: string }>;

const compRegex = /^\d{4}-\d{2}-\d{2}$/;

export default async function ContasAPagarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireUser();
  const sp = await searchParams;
  const compRaw = sp.competencia ?? getCompetenciaAtual();
  const comp = compRegex.test(compRaw) ? compRaw : getCompetenciaAtual();
  const categoriaFiltro = sp.categoria ?? "";

  const compPrev = competenciaShift(comp, -1);
  const compNext = competenciaShift(comp, 1);

  // Aba Conciliação lê pelo mes_lancamento/ano_lancamento do CMV, não por
  // d_vencimento — mesmo seletor de mês da página, interpretação diferente.
  const mes = parseInt(comp.slice(5, 7), 10);
  const ano = parseInt(comp.slice(0, 4), 10);

  // Unidade vem da shell (cookie kph_unit_id), não de um filtro local —
  // mesmo padrão de DRE/CMV (getCurrentUnit() + .eq("unit_id", unitId)).
  const unit = await getCurrentUnit();
  const unitId = unit?.id ?? null;

  const { titulos: todosOsTitulos } = await getPagarKpisETitulos(comp, unitId);

  // categorias únicas ordenadas
  const categorias = [...new Set(
    todosOsTitulos.map((t) => t.descricao_c_gerencial).filter(Boolean) as string[]
  )].sort();

  // filtra por categoria se selecionada (server-side, via router.push — o
  // filtro de fornecedor é aplicado depois, client-side, dentro de
  // PagarConteudo)
  const titulos = categoriaFiltro
    ? todosOsTitulos.filter((t) => t.descricao_c_gerencial === categoriaFiltro)
    : todosOsTitulos;

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto" }}>
      <Link
        href="/financeiro"
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          textDecoration: "none",
          fontWeight: 600,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        ← Financeiro
      </Link>

      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          margin: "10px 0 22px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: -0.5,
              margin: "0 0 4px",
            }}
          >
            Contas a Pagar
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>
            {competenciaLabel(comp)}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <FiltroCategoria categorias={categorias} atual={categoriaFiltro} />
          <ImportPagarButton />
          <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NavMonth href={`?competencia=${compPrev}`} label="←" title="Mês anterior" />
            <span
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: "var(--text)",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
            >
              {competenciaLabel(comp)}
            </span>
            <NavMonth href={`?competencia=${compNext}`} label="→" title="Mês seguinte" />
          </nav>
        </div>
      </header>

      <PagarConteudo titulos={titulos} competenciaLabel={competenciaLabel(comp)} unitId={unitId} mes={mes} ano={ano} />
    </div>
  );
}
// ── Sub-componentes ───────────────────────────────────────────────────────────

function NavMonth({
  href,
  label,
  title,
}: {
  href: string;
  label: string;
  title: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-label={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: 8,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--text-2)",
        textDecoration: "none",
        fontSize: 14,
        fontWeight: 700,
      }}
    >
      {label}
    </Link>
  );
}
