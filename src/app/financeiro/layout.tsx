import { AuthProvider } from "@maza/auth/context";
import { requireUser } from "@maza/auth/server";
import { getCurrentUnit } from "@maza/auth/unit";
import { createServiceClient, createSupabaseServerClient } from "@maza/db/supabase/server";
import type { Unit } from "@maza/db/types/database";
import { Sidebar } from "@maza/ui/sidebar";
import { fetchNavConfig } from "@maza/ui/nav/fetchNavConfig";

import { FinanceiroTopbar } from "@/components/ui/FinanceiroTopbar";

export const dynamic = "force-dynamic";

export default async function FinanceiroLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const [units, hasRegisteredUnits, navConfig, currentUnit] = await Promise.all([
    loadAccessibleUnits(),
    hasAnyActiveUnit(),
    fetchNavConfig(),
    getCurrentUnit(),
  ]);

  return (
    <AuthProvider user={user} units={units} hasRegisteredUnits={hasRegisteredUnits} initialUnitId={currentUnit?.id}>
      <div className="maza-workspace">
        <a className="maza-skip-link" href="#conteudo">Pular para o conteúdo</a>
        <Sidebar navGroups={navConfig.groups} shellUrl={navConfig.shellUrl} navOffline={navConfig.offline} />
        <div className="maza-workspace-body">
          <FinanceiroTopbar groups={navConfig.groups} shellUrl={navConfig.shellUrl} />
          <main id="conteudo" tabIndex={-1} className="shell-main maza-page-main">
          {children}
        </main>
        </div>
      </div>
    </AuthProvider>
  );
}

async function hasAnyActiveUnit(): Promise<boolean> {
  const service = createServiceClient();
  if (!service) return false;
  const { count, error } = await service.from("units").select("id", { count: "exact", head: true }).eq("active", true);
  return !error && (count ?? 0) > 0;
}

async function loadAccessibleUnits(): Promise<Unit[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("units")
      .select("*")
      .eq("active", true)
      .order("name");
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}
