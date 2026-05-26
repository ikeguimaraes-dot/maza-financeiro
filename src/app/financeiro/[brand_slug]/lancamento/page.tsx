import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@kph/auth/server";
import {
  getBrandBySlug,
  getBrandFinancialConfig,
  getEventOptionsForBrand,
  getOrCreatePeriod,
} from "../../actions";
import { LancamentoForm } from "@/components/financeiro/LancamentoForm";
import {
  competenciaLabel,
  getCompetenciaAtual,
} from "@/lib/financeiro/utils";

export const dynamic = "force-dynamic";

type Params = Promise<{ brand_slug: string }>;
type SearchParams = Promise<{ competencia?: string }>;

const compRegex = /^\d{4}-\d{2}-\d{2}$/;

export default async function NovoLancamentoPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await requireUser();
  const { brand_slug } = await params;
  const sp = await searchParams;
  const compRaw = sp.competencia ?? getCompetenciaAtual();
  const comp = compRegex.test(compRaw) ? compRaw : getCompetenciaAtual();

  const brand = await getBrandBySlug(brand_slug);
  if (!brand) notFound();

  const periodResult = await getOrCreatePeriod(brand.id, comp);
  if (!periodResult.ok) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p style={{ color: "#EF4444", fontSize: 13 }}>
          Erro: {periodResult.error}
        </p>
      </div>
    );
  }
  const period = periodResult.data;

  const [config, events] = await Promise.all([
    getBrandFinancialConfig(brand.id),
    getEventOptionsForBrand(brand.id),
  ]);
  const threshold = Number(config?.threshold_aprovacao ?? 5000);

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <Link
        href={`/financeiro/${brand_slug}`}
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          textDecoration: "none",
          fontWeight: 600,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        ← {brand.name}
      </Link>

      <header style={{ margin: "10px 0 22px" }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "var(--text)",
            letterSpacing: -0.5,
            margin: 0,
          }}
        >
          Novo lançamento
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 6 }}>
          {brand.name} · {competenciaLabel(comp)}
        </p>
      </header>

      <LancamentoForm
        brandSlug={brand_slug}
        periodId={period.id}
        threshold={threshold}
        events={events}
        competenciaLabel={competenciaLabel(comp)}
      />
    </div>
  );
}
