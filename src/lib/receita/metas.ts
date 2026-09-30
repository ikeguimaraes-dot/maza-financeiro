export type MetaSemanal = { dia_semana: number; meta: number };
export const DIAS_META = [
  { dia: 1, nome: "Segunda-feira" }, { dia: 2, nome: "Terça-feira" },
  { dia: 3, nome: "Quarta-feira" }, { dia: 4, nome: "Quinta-feira" },
  { dia: 5, nome: "Sexta-feira" }, { dia: 6, nome: "Sábado" }, { dia: 0, nome: "Domingo" },
];

export function validarMetasSemanais(value: unknown): value is MetaSemanal[] {
  if (!Array.isArray(value) || value.length !== 7) return false;
  const dias = new Set<number>();
  for (const row of value) {
    if (!row || !Number.isInteger(row.dia_semana) || row.dia_semana < 0 || row.dia_semana > 6 ||
      typeof row.meta !== "number" || !Number.isFinite(row.meta) || row.meta < 0 || row.meta > 999999999.99 ||
      Math.abs(row.meta * 100 - Math.round(row.meta * 100)) > 0.00001) return false;
    dias.add(row.dia_semana);
  }
  return dias.size === 7;
}

export function metaMensalSemanal(ano: number, mes: number, metas: MetaSemanal[], overrides: { data: string; meta: number }[] = []): number | null {
  if (!validarMetasSemanais(metas)) return null;
  const porDia = new Map(metas.map(m => [m.dia_semana, m.meta]));
  const excecoes = new Map(overrides.map(m => [m.data, m.meta]));
  let centavos = 0;
  const fim = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  for (let dia = 1; dia <= fim; dia++) {
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    const meta = excecoes.get(data.toISOString().slice(0, 10)) ?? porDia.get(data.getUTCDay())!;
    centavos += Math.round(meta * 100);
  }
  return centavos / 100;
}

export function performanceMetas(ano: number, mes: number, metas: MetaSemanal[], realizados: { data: string; valor: number }[], hoje: string, overrides: { data: string; meta: number }[] = []) {
  const porDia = new Map(metas.filter(m => Number.isFinite(m.meta) && m.meta >= 0 && m.meta <= 999999999.99 && Math.abs(m.meta * 100 - Math.round(m.meta * 100)) <= 0.00001).map(m => [m.dia_semana, m.meta]));
  const excecoes = new Map(overrides.map(m => [m.data, m.meta]));
  const receitas = new Map<string, number>();
  realizados.forEach(r => receitas.set(r.data, (receitas.get(r.data) ?? 0) + Math.round(r.valor * 100)));
  const linhas = DIAS_META.map(({ dia, nome }) => ({ dia, nome, quantidade: 0, meta: porDia.get(dia) ?? null, periodo: 0, realizado: 0, restante: 0, acumulada: 0 }));
  for (let d = 1; d <= new Date(Date.UTC(ano, mes, 0)).getUTCDate(); d++) {
    const date = new Date(Date.UTC(ano, mes - 1, d));
    const data = date.toISOString().slice(0, 10);
    const linha = linhas.find(l => l.dia === date.getUTCDay())!;
    const meta = Math.round((excecoes.get(data) ?? linha.meta ?? 0) * 100);
    linha.quantidade++;
    linha.periodo += meta;
    if (data <= hoje) { linha.acumulada += meta; linha.realizado += receitas.get(data) ?? 0; }
    else linha.restante += meta;
  }
  return linhas.map(l => ({ ...l, periodo: l.periodo / 100, realizado: l.realizado / 100, acumulada: l.acumulada / 100, projecao: (l.realizado + l.restante) / 100 }));
}

export function resumirPerformanceMetas(linhas: ReturnType<typeof performanceMetas>) {
  return linhas.reduce((sum, l) => ({
    periodo: sum.periodo + l.periodo,
    realizado: sum.realizado + l.realizado,
    projecao: sum.projecao + l.projecao,
    acumulada: sum.acumulada + l.acumulada,
    quantidade: sum.quantidade + l.quantidade,
    diaria: sum.diaria + (l.meta ?? 0),
    diasDefinidos: sum.diasDefinidos + (l.meta !== null ? 1 : 0),
  }), { periodo: 0, realizado: 0, projecao: 0, acumulada: 0, quantidade: 0, diaria: 0, diasDefinidos: 0 });
}
