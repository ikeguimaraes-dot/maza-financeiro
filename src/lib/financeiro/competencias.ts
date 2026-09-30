import { hojeSaoPaulo } from "./dates";

/** Historical filters stay navigable as the calendar advances. */
export function competenciasDisponiveis(selecionada?: string): string[] {
  const atual = hojeSaoPaulo().slice(0, 7);
  const result = new Set<string>();
  const end = Number(atual.slice(0, 4)) * 12 + Number(atual.slice(5, 7)) - 1 + 3;
  for (let n = 2026 * 12; n <= end; n++) result.add(`${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, "0")}-01`);
  if (selecionada && /^(20\d{2})-(0[1-9]|1[0-2])-01$/.test(selecionada)) result.add(selecionada);
  return [...result].sort();
}
