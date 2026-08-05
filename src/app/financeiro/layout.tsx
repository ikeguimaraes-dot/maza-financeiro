import { AuthProvider } from "@kph/auth/context";
import { requireUser } from "@kph/auth/server";
import { createServiceClient, createSupabaseServerClient } from "@kph/db/supabase/server";
import type { Unit } from "@kph/db/types/database";
import { Sidebar } from "@kph/ui/sidebar";

export const dynamic = "force-dynamic";

export default async function FinanceiroLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const [units, hasRegisteredUnits] = await Promise.all([loadAccessibleUnits(), hasAnyActiveUnit()]);

  return (
    <AuthProvider user={user} units={units} hasRegisteredUnits={hasRegisteredUnits}>
      <div style={{ display: "flex", height: "100vh" }}>
        <Sidebar />
        <main className="shell-main maza-page-main" style={{ flex: 1, overflowY: "auto", padding: "32px 28px" }}>
          {children}
        </main>
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
