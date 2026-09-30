import { unitDisplayName } from "./unit-display";
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { createSupabaseServerClient } from "@maza/db/supabase/server";
import type { Unit } from "@maza/db/types/database";

// Rename kph_unit_id → maza_unit_id em andamento (mesmo rename kph→maza do
// menu). O shell ainda grava o nome antigo — migração coordenada nos dois
// repos. Leitura tolerante aos dois nomes enquanto isso: maza_unit_id tem
// prioridade se presente, senão cai pro nome antigo. Nunca escreve o
// cookie aqui (Server Component não pode; e quem grava é o shell).
const COOKIE_KEY_NOVO = "maza_unit_id";
const COOKIE_KEY_ANTIGO = "kph_unit_id";

async function lerCookieUnidade(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_KEY_NOVO)?.value ?? cookieStore.get(COOKIE_KEY_ANTIGO)?.value;
}

/**
 * Resolve a unit selecionada (server-side) lendo o cookie escrito pelo
 * AuthProvider. Se cookie ausente, inválido (UUID que não existe) ou
 * apontando pra unit que o user não acessa, cai pra primeira unit acessível.
 *
 * Erros de consulta são propagados; indisponibilidade não vira uma unidade vazia.
 */
// Request-scoped memoization: shared by layout and page, never across users.
export const getAccessibleUnits = cache(async (): Promise<Unit[]> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Banco de dados indisponível");
  const { data, error } = await supabase.from("units").select("*").eq("active", true).order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Unit[]).map(unit => ({ ...unit, name: unitDisplayName(unit) }));
});

export const getCurrentUnit = cache(async (): Promise<Unit | null> => {
  const [units, cookieId] = await Promise.all([getAccessibleUnits(), lerCookieUnidade()]);
  return units.find(unit => unit.id === cookieId) ?? units[0] ?? null;
});

export type UnidadeAtual = { unit: Unit | null; cookiePresente: boolean };

/**
 * Mesma resolução de getCurrentUnit(), mas também informa se o cookie de
 * unidade existia — pra telas que precisam mostrar um aviso explícito
 * quando caem no fallback (nenhuma unidade selecionada no shell ainda).
 * Não substitui getCurrentUnit(): esta função é só para as telas que
 * removeram seletor local de unidade e precisam do aviso; os callers
 * existentes de getCurrentUnit() continuam intactos.
 */
export async function getCurrentUnitComOrigem(): Promise<UnidadeAtual> {
  const cookiePresente = !!(await lerCookieUnidade());
  const unit = await getCurrentUnit();
  return { unit, cookiePresente };
}
