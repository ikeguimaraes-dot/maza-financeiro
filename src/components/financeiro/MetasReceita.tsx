"use client";
import { useEffect, useState } from "react";
import { DIAS_META, performanceMetas, resumirPerformanceMetas, validarMetasSemanais, type MetaSemanal } from "@/lib/receita/metas";
import styles from "./metas-receita.module.css";

type Props = { unitId: string; unitName: string; apiBase: string; ano: number; mes: number; onSaved: () => void; realizados: { data: string; valor: number }[]; overrides: { data: string; meta: number }[]; receitaLoading: boolean; receitaError: string | null };
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const percent = (v: number | null) => v === null ? "—" : `${v.toLocaleString("pt-BR", {minimumFractionDigits: 1, maximumFractionDigits: 1})}%`;
function Atingimento({ value }: { value: number | null }) {
  const tone = value === null ? "empty" : value >= 100 ? "good" : value >= 80 ? "warn" : "bad";
  return <div className={styles.atingimento} data-tone={tone}><div className={styles.smallTrack}><span style={{ width: `${Math.max(0, Math.min(value ?? 0, 100))}%` }} /></div><strong>{percent(value)}</strong></div>;
}
export function MetasReceita({ unitId, unitName, apiBase, ano, mes, onSaved, realizados, overrides, receitaLoading, receitaError }: Props) {
  const [values, setValues] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`${apiBase}/api/receita/metas/semanais?unit_id=${encodeURIComponent(unitId)}`, { signal: controller.signal });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error);
        if (!controller.signal.aborted) {
          setValues(Object.fromEntries((json.metas as MetaSemanal[]).map(m => [m.dia_semana, String(m.meta)])));
          setLoaded(true);
        }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Erro ao carregar metas"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [unitId, apiBase]);
  const rows = DIAS_META.map(({ dia }) => ({ dia_semana: dia, meta: values[dia]?.trim() ? Number(values[dia].replace(",", ".")) : NaN }));
  const valid = validarMetasSemanais(rows);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const linhas = performanceMetas(ano, mes, rows, realizados, hoje, overrides);
  const total = resumirPerformanceMetas(linhas);
  const temMeta = loaded && total.diasDefinidos > 0;
  const parcial = temMeta && !valid;
  const mesEncerrado = `${ano}-${String(mes).padStart(2, "0")}` < hoje.slice(0, 7);
  const receitaDisponivel = !receitaLoading && !receitaError && realizados.length > 0;
  const atingimento = temMeta && receitaDisponivel && total.periodo > 0 ? total.realizado / total.periodo * 100 : null;
  const desvio = temMeta && receitaDisponivel && total.acumulada > 0 ? (total.realizado / total.acumulada - 1) * 100 : null;
  const tituloMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(ano, mes - 1, 1)));
  const periodo = `${tituloMes.charAt(0).toUpperCase() + tituloMes.slice(1)}/${ano}`;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || saving || !loaded) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      const response = await fetch(`${apiBase}/api/receita/metas/semanais`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unit_id: unitId, metas: rows }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setSaved(true); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar metas"); }
    finally { setSaving(false); }
  }
  return <section aria-label={`Metas de receita de ${unitName}`} className={styles.root}>
    <div className={styles.performance}>
      <h2>Performance da meta — {periodo}</h2>
      <strong className={styles.percentage}>{percent(atingimento)}</strong>
      <p>{receitaDisponivel ? money(total.realizado) : "—"} de {temMeta ? money(total.periodo) : "meta ainda não definida"}{parcial ? " (parcial)" : ""}</p>
      <div className={styles.track} role="progressbar" aria-label="Atingimento da meta mensal" aria-valuenow={atingimento === null ? undefined : Math.max(0, Math.min(atingimento, 100))} aria-valuemin={0} aria-valuemax={100}><span style={{width: `${Math.max(0, Math.min(atingimento ?? 0, 100))}%`}} /></div>
    </div>
    <form onSubmit={save} className={styles.card}>
      <div className={styles.heading}><h3>Metas — {periodo}</h3><div>Projeção <strong>{(temMeta || mesEncerrado) && receitaDisponivel ? money(total.projecao) : temMeta || mesEncerrado ? "—" : "Defina as metas"}</strong><span>vs. meta acumulada <b className={desvio !== null && desvio >= 0 ? styles.positive : styles.negative}>{desvio !== null && desvio > 0 ? "+" : ""}{percent(desvio)}</b></span></div></div>
      {loaded && !valid && <p role="status" className={styles.notice}>{temMeta ? `Totais parciais: ${total.diasDefinidos} de 7 dias com meta. A projeção inclui somente as metas preenchidas para os dias restantes; o atingimento usa a meta parcial.` : "Preencha as metas diárias para calcular a meta do período e o atingimento."} Use zero nos dias sem meta.</p>}
      {loading && <p role="status" className={styles.notice}>Carregando metas…</p>}
      <div className={styles.scroll}><table className={styles.table}>
        <thead><tr>{["Período", "Meta diária", "Qtd no mês", "Meta do período", "Realizado", "Projeção", "Atingimento"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{linhas.map(l => <tr key={l.dia}>
          <th scope="row">{l.nome.replace("-feira", "")}</th>
          <td><div className={styles.input}><span>R$</span><input aria-label={`Meta de ${l.nome}`} type="number" min="0" max="999999999.99" step="0.01" required disabled={saving || !loaded} value={values[l.dia] ?? ""} placeholder="0,00" onChange={e => {setValues(v => ({...v, [l.dia]: e.target.value})); setSaved(false);}} /></div></td>
          <td>{l.quantidade}</td><td><strong>{l.meta !== null ? money(l.periodo) : "—"}</strong></td>
          <td>{receitaDisponivel ? money(l.realizado) : "—"}</td><td>{(l.meta !== null || mesEncerrado) && receitaDisponivel ? money(l.projecao) : "—"}</td>
          <td><Atingimento value={l.meta !== null && receitaDisponivel && l.periodo > 0 ? l.realizado / l.periodo * 100 : null} /></td>
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">{parcial ? "Total parcial" : "Total"}</th><td>{temMeta ? money(total.diaria) : "Defina as metas"}</td><td>{total.quantidade}</td><td>{temMeta ? money(total.periodo) : "Defina as metas"}</td><td>{receitaDisponivel ? money(total.realizado) : "—"}</td><td>{(temMeta || mesEncerrado) && receitaDisponivel ? money(total.projecao) : temMeta || mesEncerrado ? "—" : "Defina as metas"}</td><td><Atingimento value={atingimento} /></td></tr></tfoot>
      </table></div>
      <div className={styles.footer}><p>Meta do período = meta diária × quantidade do dia no mês{overrides.length ? ", com exceções por data" : ""}.</p><button type="submit" disabled={!valid || saving || !loaded}>{saving ? "Salvando…" : "Salvar no Banco"}</button></div>
      {saved && <p role="status" className={styles.notice}>Metas salvas para esta unidade.</p>}
      {error && <p role="alert" className={styles.notice}>{error}</p>}
    </form>
    <p className={styles.explanation}>Projeção = realizado até hoje + metas dos dias restantes. Meta acumulada = metas até hoje. O padrão semanal vale para todos os meses; exceções por data têm prioridade. Use zero nos dias sem meta.</p>
    {(receitaLoading || receitaError || !realizados.length) && <p role="status" className={styles.explanation}>{receitaLoading ? "Carregando o realizado…" : receitaError ? "Não foi possível carregar o realizado. As metas continuam disponíveis para edição." : "Sem receita importada neste mês. O realizado e a projeção ficam pendentes."}</p>}
  </section>;
}
