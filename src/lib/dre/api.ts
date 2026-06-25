// Helpers das rotas /api/dre/* — service role do projeto principal
// (iqgrvptrtphvbmvrqntm, onde vive titulos_a_pagar) + CORS para o shell kph-os.
import { createClient } from "@supabase/supabase-js";

export const CORS = {
  "Access-Control-Allow-Origin":  "https://kph-os.vercel.app",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function corsOptions() {
  return new Response(null, { headers: CORS });
}
export function jsonOk(body: unknown, status = 200) {
  return Response.json(body, { status, headers: CORS });
}
export function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status, headers: CORS });
}

export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

// Unidades: empresa do Everest ↔ unit_id. Só Meet & Eat ("1") por enquanto.
export const EMPRESA_POR_UNIT: Record<string, string> = {
  "674eac8c-5a38-4a42-aa60-0a666387909b": "1", // Meet & Eat
};
// Normaliza o param de unidade (aceita o código "1" ou o uuid da unidade).
export function resolveEmpresa(unidade: string | null): string | null {
  if (!unidade) return null;
  return EMPRESA_POR_UNIT[unidade] ?? unidade;
}

export const LINHAS_DRE = [
  "Ocupação", "Utilidades", "Operação", "Manutenção", "Administrativo", "CMV",
  "Pessoal", "Impostos", "Despesas Financeiras", "Marketing", "Taxas Cartão",
] as const;
