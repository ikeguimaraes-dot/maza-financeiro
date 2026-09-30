import type { DiaFluxo } from './calcularFluxo';
export type PeriodoFluxo = DiaFluxo & { fim: string };
/** Semanas de segunda a domingo, limitadas ao mês consultado. Saldos não são somados. */
export function agruparSemanas(dias: DiaFluxo[]): PeriodoFluxo[] {
  const semanas = new Map<string, PeriodoFluxo>();
  for (const dia of [...dias].sort((a,b) => a.data.localeCompare(b.data))) {
    const data = new Date(`${dia.data}T12:00:00Z`);
    data.setUTCDate(data.getUTCDate() - (data.getUTCDay() + 6) % 7);
    const chave = data.toISOString().slice(0,10);
    const atual = semanas.get(chave);
    if (!atual) { semanas.set(chave, { ...dia, fim: dia.data }); continue; }
    for (const campo of ['entradasRealizadas','entradasPrevistas','saidasRealizadas','saidasPrevistas'] as const)
      atual[campo] = Math.round((atual[campo] + dia[campo]) * 100) / 100;
    atual.fim = dia.data; atual.saldoFinal = dia.saldoFinal;
    if (dia.status === 'previsto') atual.status = 'previsto';
  }
  return [...semanas.values()];
}
