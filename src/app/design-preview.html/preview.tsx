"use client";

import { SidebarPresentation } from "@maza/ui/sidebar";
import { WorkspaceTopbar } from "@/components/ui/WorkspaceTopbar";
import { CockpitPainel, CockpitEmpty } from "@/components/financeiro/cockpit/CockpitPainel";
import { CockpitHeader } from "@/components/financeiro/cockpit/CockpitHeader";
import { PREVIEW_MONTHS, previewData } from "@/components/financeiro/cockpit/preview-fixture";
import type { RemoteNavGroup } from "@maza/ui/nav/types";

const GROUPS: RemoteNavGroup[] = [
  { id: "overview", label: "Seu espaço", icon: "LayoutDashboard", defaultOpen: true, items: [{ label: "Visão geral", href: "/", icon: "LayoutDashboard" }] },
  { id: "financeiro", label: "Financeiro", icon: "Wallet", defaultOpen: true, items: [
    { label: "Cockpit", href: "/financeiro", icon: "Gauge" },
    { label: "Fluxo de caixa", href: "/financeiro/fluxo", icon: "ArrowLeftRight" },
    { label: "DRE", href: "/financeiro/dre", icon: "Sheet" },
    { label: "Contas a pagar", href: "/financeiro/pagar", icon: "CreditCard" },
    { label: "Contas a receber", href: "/financeiro/receber", icon: "Banknote" },
    { label: "Conciliação", href: "/financeiro/conciliacao", icon: "RefreshCw" },
  ] },
  { id: "mise", label: "Operação", icon: "ChefHat", defaultOpen: true, items: [{ label: "MISE · Visão geral", href: "/mise", icon: "ChefHat" }] },
];
export function DesignPreview({ state, competencia, consolidado }: { state?: string; competencia?: string; consolidado?: string }) {
  const data = previewData(state === "partial");
  if (competencia && PREVIEW_MONTHS.includes(competencia)) data.competencia = competencia;
  return <div className="maza-workspace">
    <a className="maza-skip-link" href="#conteudo">Pular para o conteúdo</a>
    <SidebarPresentation navGroups={GROUPS} shellUrl="" navOffline={false} user={null} unit={null} units={[]} hasRegisteredUnits={false} setUnit={() => {}} />
    <div className="maza-workspace-body">
      <WorkspaceTopbar links={GROUPS.flatMap((group) => group.items.map((item) => ({ href: item.href!, label: item.label, group: group.label! })))} />
      <main id="conteudo" tabIndex={-1} className="shell-main maza-page-main"><div style={{ maxWidth: 1440, margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 20, fontSize: 11, color: "var(--text-3)" }}><span className="maza-badge" data-tone="warning">Demonstração · dados fictícios</span><a href="/design-preview.html">Completo</a><a href="/design-preview.html?state=partial">Dados parciais</a><a href="/design-preview.html?state=empty">Sem dados</a></div>
        <CockpitHeader unidade={consolidado === "1" ? "Consolidado · demonstração" : "Restaurante · demonstração"} competencia={data.competencia} competencias={PREVIEW_MONTHS} consolidado={consolidado === "1"} preview />
        {state === "empty" ? <CockpitEmpty /> : <CockpitPainel {...data} />}
      </div></main>
    </div>
  </div>;
}
