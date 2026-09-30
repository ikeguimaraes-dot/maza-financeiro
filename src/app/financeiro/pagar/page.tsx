import { SeletorCompetencia } from "@/components/financeiro/SeletorCompetencia";
import { ultimaCompetencia } from "@/lib/financeiro/competencia-atual";
import { competenciasDisponiveis } from "@/lib/financeiro/competencias";
import { PageHeading } from "@/components/ui/PageHeading";
import Link from "next/link";
import { requireUser } from "@maza/auth/server";
import { getCurrentUnitComOrigem } from "@maza/auth/unit";
import type { OrigemTitulo } from "@/lib/financeiro/pagar/calcularPagar";
import { getPagar } from "./actions";
import { ImportPagarButton } from "@/components/financeiro/ImportPagarButton";
import { PagarConteudo } from "@/components/financeiro/PagarConteudo";
import { AvisoUnidadeFallback } from "@/components/financeiro/AvisoUnidadeFallback";
import { competenciaLabel } from "@/lib/financeiro/utils";

export const dynamic = "force-dynamic";




const ORIGENS: Array<{ id: OrigemTitulo; nome: string }> = [
  { id: "contas_pagar", nome: "Contas a Pagar" },
  { id: "nf_pedidos", nome: "Compras da planilha" },
];

type SearchParams = Promise<{ competencia?: string; origem?: string; visao?: string }>;

export default async function ContasAPagarPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const sp = await searchParams;

  const COMPETENCIAS = competenciasDisponiveis(sp.competencia);

  // Unidade é contexto global (cookie do shell) — competência e origem
  // continuam sendo filtros legítimos desta tela.
  const { unit, cookiePresente } = await getCurrentUnitComOrigem();
  const unitId = unit?.id ?? null;
  const unitNome = unit?.name ?? "—";
  const comp = sp.competencia && (COMPETENCIAS as readonly string[]).includes(sp.competencia)
    ? sp.competencia
    : await ultimaCompetencia(unitId);
  const origem: OrigemTitulo = sp.origem === "nf_pedidos" ? "nf_pedidos" : "contas_pagar";

  const visao = sp.visao === "vencimento" ? "vencimento" : "competencia";
  const mes = parseInt(comp.slice(5, 7), 10);
  const ano = parseInt(comp.slice(0, 4), 10);

  const href = (competenciaVal: string, origemVal: OrigemTitulo) => {
    const params = new URLSearchParams();
    params.set("competencia", competenciaVal);
    params.set("origem", origemVal);
    params.set("visao", visao);
    return `/financeiro/pagar?${params.toString()}`;
  };
  const linkStyle = (ativo: boolean): React.CSSProperties => ({
    padding: "10px 16px", borderRadius: 999, fontSize: 12, fontWeight: ativo ? 700 : 500,
    textDecoration: "none", whiteSpace: "nowrap",
    background: ativo ? "var(--brand, #C4622D)" : "var(--surface-2)",
    color: ativo ? "var(--primary-foreground)" : "var(--text-3)",
    border: "1px solid var(--border)",
  });

  const dados = unitId ? await getPagar(unitId, comp, origem, visao) : null;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <PageHeading title="Contas a pagar" eyebrow={`Financeiro · ${unitNome}`} description={`${competenciaLabel(comp)} · Organize seus compromissos e acompanhe cada vencimento.`} actions={<div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><ImportPagarButton /><Link href="/financeiro/pagar/importar" className="maza-button">Importar planilha de compras</Link></div>} />
      <div style={{ marginBottom: 24 }}>
        <AvisoUnidadeFallback cookiePresente={cookiePresente} />

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <SeletorCompetencia valor={comp} opcoes={COMPETENCIAS} />
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <Link href={`/financeiro/pagar?competencia=${comp}&origem=${origem}&visao=competencia`} style={linkStyle(visao === "competencia")}>Por competência</Link>
          <Link href={`/financeiro/pagar?competencia=${comp}&origem=${origem}&visao=vencimento`} style={linkStyle(visao === "vencimento")}>Por vencimento</Link>
          <span style={{ fontSize: 11, color: "var(--text-3)", marginRight: 4 }}>Fonte:</span>
          {ORIGENS.map((o) => (
            <Link key={o.id} href={href(comp, o.id)} style={linkStyle(o.id === origem)}>{o.nome}</Link>
          ))}
          <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 8 }}>
            {origem === "contas_pagar"
              ? "obrigações de pagamento; as compras da planilha podem representar as mesmas notas"
              : "compras informadas em planilha; não são pagamentos nem novas dívidas"}
          </span>
        </div>
      </div>

      {!dados || !unitId ? (
        <div style={{ padding: 48, textAlign: "center", background: "var(--surface)",
          border: "1px dashed var(--border)", borderRadius: 14, color: "var(--text-3)", fontSize: 13 }}>
          {!unitId ? "Selecione uma unidade no menu para consultar os pagamentos." : "Não foi possível carregar os pagamentos. Tente atualizar a página."}
        </div>
      ) : (
        <PagarConteudo dados={dados} competenciaLabel={competenciaLabel(comp)} unitId={unitId} mes={mes} ano={ano} />
      )}
    </div>
  );
}
