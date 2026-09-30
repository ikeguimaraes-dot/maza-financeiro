"use server";

import { requireUser } from "@maza/auth/server";
import { createSupabaseServerClient } from "@maza/db/supabase/server";
import { fetchCockpitRows } from "./data";
import type { FonteSaudeRow } from "./types";

/** Secondary detail: queried only when the user expands the sources. */
export async function carregarFontesSaude(): Promise<FonteSaudeRow[]> {
  await requireUser();
  const db = await createSupabaseServerClient();
  if (!db) throw new Error("Banco de dados indisponível");
  return fetchCockpitRows<FonteSaudeRow>((from, to) =>
    db.from("v_fonte_saude")
      .select("fonte,ultima_escrita,dias_sem_atualizacao,status_fonte")
      .order("fonte").range(from, to));
}
