import { createFinanceiroClient } from './db/client';
import { hojeSaoPaulo } from './dates';
export async function ultimaCompetencia(unitId: string | null): Promise<string> {
  if (unitId) {
    const db = await createFinanceiroClient();
    const { data, error } = await db.from('titulos_a_pagar').select('d_competencia').eq('unit_id', unitId).not('d_competencia', 'is', null).order('d_competencia', { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    if (data?.[0]?.d_competencia) return data[0].d_competencia;
  }
  return `${hojeSaoPaulo().slice(0, 7)}-01`;
}
