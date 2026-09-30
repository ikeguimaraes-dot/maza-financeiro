import { cache } from "react";
import { getCurrentUser } from "@maza/auth/server";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@maza/db/supabase/server";

/** Requests always use the verified user's JWT and database RLS, never service role. */
export const createFinanceiroClient = cache(async (): Promise<SupabaseClient> => {
  const db = await createSupabaseServerClient();
  if (!db) throw new Error("Banco de dados indisponível");
  const user = await getCurrentUser();
  if (!user) throw new Error("Não autorizado");
  return db;
});
