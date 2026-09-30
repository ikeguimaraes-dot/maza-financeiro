import { AuthProvider } from "@maza/auth/context";
import { requireUser } from "@maza/auth/server";
import { getAccessibleUnits, getCurrentUnit } from "@maza/auth/unit";
import { Sidebar } from "@maza/ui/sidebar";
import { fetchNavConfig } from "@maza/ui/nav/fetchNavConfig";

import { FinanceiroTopbar } from "@/components/ui/FinanceiroTopbar";

export const dynamic = "force-dynamic";

export default async function FinanceiroLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [user, units, navConfig, currentUnit] = await Promise.all([
    requireUser(),
    getAccessibleUnits(),
    fetchNavConfig(),
    getCurrentUnit(),
  ]);

  return (
    <AuthProvider user={user} units={units} hasRegisteredUnits={units.length > 0} initialUnitId={currentUnit?.id}>
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
