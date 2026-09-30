"use client";
import { useState } from 'react';
import type { DiaFluxo } from '@/lib/financeiro/fluxo/calcularFluxo';
import { agruparSemanas } from '@/lib/financeiro/fluxo/periodos';
import { formatBRL } from '@/lib/financeiro/utils';
const dataCurta = (data: string) => `${data.slice(8,10)}/${data.slice(5,7)}`;
export function FluxoPeriodos({ dias, saldoDisponivel }: { dias: DiaFluxo[]; saldoDisponivel: boolean }) {
  const [visao, setVisao] = useState<'dia'|'semana'>('dia');
  const periodos = visao === 'dia' ? dias.map(d => ({...d, fim:d.data})) : agruparSemanas(dias);
  const totais = dias.reduce((s,d) => ({
    entradasRealizadas: s.entradasRealizadas + Math.round(d.entradasRealizadas * 100),
    entradasPrevistas: s.entradasPrevistas + Math.round(d.entradasPrevistas * 100),
    saidasRealizadas: s.saidasRealizadas + Math.round(d.saidasRealizadas * 100),
    saidasPrevistas: s.saidasPrevistas + Math.round(d.saidasPrevistas * 100),
  }), {entradasRealizadas:0,entradasPrevistas:0,saidasRealizadas:0,saidasPrevistas:0});
  return <section className="maza-panel" style={{ padding: 20, marginBottom: 24 }}>
    <div className="maza-panel-heading"><div><h2>Fluxo do mês</h2><p>Realizado e previsto separados. Semanas de segunda a domingo, dentro do mês selecionado. Saldo final projetado = entradas previstas − saídas previstas.</p></div>
      <div style={{display:'flex',gap:8}}>{(['dia','semana'] as const).map(v => <button key={v} aria-pressed={visao === v} className={`maza-button ${visao === v ? 'maza-button-primary' : ''}`} onClick={()=>setVisao(v)}>{v === 'dia' ? 'Por dia' : 'Por semana'}</button>)}</div>
    </div>
    <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
      <thead><tr>{['Período','Saldo inicial','Entradas realizadas','Entradas previstas','Saídas realizadas','Saídas previstas','Saldo final projetado'].map((t,i)=><th key={t} style={{padding:12,textAlign:i?'right':'left',color:'var(--text-3)',borderBottom:'1px solid var(--border)'}}>{t}</th>)}</tr></thead>
      <tbody>{periodos.map(p=><tr key={p.data}><td style={{padding:12,whiteSpace:'nowrap'}}>{dataCurta(p.data)}{p.fim !== p.data ? ` a ${dataCurta(p.fim)}` : ''}</td>{[p.saldoInicial,p.entradasRealizadas,p.entradasPrevistas,p.saidasRealizadas,p.saidasPrevistas,Math.round((p.entradasPrevistas-p.saidasPrevistas)*100)/100].map((valor,i)=><td key={i} style={{padding:12,textAlign:'right',whiteSpace:'nowrap',borderBottom:'1px solid var(--border-soft)',color:valor < 0?'var(--color-danger)':'var(--text)'}}>{!saldoDisponivel && i === 0 ? "—" : formatBRL(valor)}</td>)}</tr>)}</tbody>
      <tfoot><tr style={{background:'var(--surface-2)',fontWeight:700,borderTop:'2px solid var(--border)'}}>
        <td style={{padding:12}}>Total do mês</td><td style={{padding:12,textAlign:'right'}}>—</td>
        {[totais.entradasRealizadas,totais.entradasPrevistas,totais.saidasRealizadas,totais.saidasPrevistas,totais.entradasPrevistas-totais.saidasPrevistas].map((valor,i)=><td key={i} style={{padding:12,textAlign:'right',whiteSpace:'nowrap',color:valor<0?'var(--color-danger)':'var(--text)'}}>{formatBRL(valor/100)}</td>)}
      </tr></tfoot>
    </table></div>
    <p style={{color:'var(--text-3)',fontSize:12,marginTop:12}}>Saldo inicial é uma posição e não é somado. A previsão da folha contábil usa o dia 5 do mês seguinte como data estimada; não confirma pagamento.</p>
  </section>;
}
