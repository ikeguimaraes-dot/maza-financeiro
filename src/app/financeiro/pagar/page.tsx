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

// Mesmo range com dado real carregado nesta fase.
const COMPETENCIAS = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"] as const;

const ORIGENS: Array<{ id: OrigemTitulo; nome: string }> = [
  { id: "contas_pagar", nome: "Contas a Pagar" },
  { id: "nf_pedidos", nome: "NF_PEDIDOS" },
];

type SearchParams = Promise<{ competencia?: string; origem?: string }>;

export default async function ContasAPagarPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const sp = await searchParams;

  // Unidade é contexto global (cookie do shell) — competência e origem
  // continuam sendo filtros legítimos desta tela.
  const { unit, cookiePresente } = await getCurrentUnitComOrigem();
  const unitId = unit?.id ?? null;
  const unitNome = unit?.name ?? "—";
  const comp = sp.competencia && (COMPETENCIAS as readonly string[]).includes(sp.competencia)
    ? sp.competencia
    : COMPETENCIAS[COMPETENCIAS.length - 1]!;
  const origem: OrigemTitulo = sp.origem === "nf_pedidos" ? "nf_pedidos" : "contas_pagar";

  const mes = parseInt(comp.slice(5, 7), 10);
  const ano = parseInt(comp.slice(0, 4), 10);

  const href = (competenciaVal: string, origemVal: OrigemTitulo) => {
    const params = new URLSearchParams();
    params.set("competencia", competenciaVal);
    params.set("origem", origemVal);
    return `/financeiro/pagar?${params.toString()}`;
  };
  const linkStyle = (ativo: boolean): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: ativo ? 700 : 500,
    textDecoration: "none", whiteSpace: "nowrap",
    background: ativo ? "var(--brand, #C4622D)" : "var(--surface-2)",
    color: ativo ? "var(--primary-foreground)" : "var(--text-3)",
    border: "1px solid var(--border)",
  });

  const dados = unitId ? await getPagar(unitId, comp, origem) : null;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <Link
        href="/financeiro"
        style={{ fontSize: 11, color: "var(--text-3)", textDecoration: "none", fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" }}
      >
        ← Financeiro
      </Link>

      <header style={{ margin: "10px 0 22px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", letterSpacing: -0.5, margin: "0 0 4px" }}>
              Contas a Pagar · {unitNome}
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>
              {competenciaLabel(comp)} · {origem === "contas_pagar" ? "Contas a Pagar" : "NF_PEDIDOS"}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <ImportPagarButton />
            <Link
              href="/financeiro/pagar/importar"
              style={{
                padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: "1px solid var(--border)", background: "var(--surface-2)",
                color: "var(--text-2)", textDecoration: "none", whiteSpace: "nowrap",
              }}
            >
              Importar NF_PEDIDOS / Contas a Pagar
            </Link>
          </div>
        </div>

        <AvisoUnidadeFallback cookiePresente={cookiePresente} />

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {COMPETENCIAS.map((c) => (
              <Link key={c} href={href(c, origem)} style={linkStyle(c === comp)}>
                {competenciaLabel(c)}
              </Link>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--text-3)", marginRight: 4 }}>Fonte:</span>
          {ORIGENS.map((o) => (
            <Link key={o.id} href={href(comp, o.id)} style={linkStyle(o.id === origem)}>{o.nome}</Link>
          ))}
          <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 8 }}>
            {origem === "contas_pagar"
              ? "o que se paga — não some com NF_PEDIDOS, que descreve a mesma compra por outro ângulo"
              : "planilha de pedidos — não some com Contas a Pagar, é a mesma compra por outro ângulo"}
          </span>
        </div>
      </header>

      {!dados || !unitId ? (
        <div style={{ padding: 48, textAlign: "center", background: "var(--surface)",
          border: "1px dashed var(--border)", borderRadius: 14, color: "var(--text-3)", fontSize: 13 }}>
          Erro ao carregar contas a pagar — sem conexão com o banco.
        </div>
      ) : (
        <PagarConteudo dados={dados} competenciaLabel={competenciaLabel(comp)} unitId={unitId} mes={mes} ano={ano} />
      )}
    </div>
  );
}
