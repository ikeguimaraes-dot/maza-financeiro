import Link from 'next/link'
import { createFinanceiroClient } from '@/lib/financeiro/db/client'
import { getCurrentUnit } from '@maza/auth/unit'
import { fetchAllPaginado as fetchAll } from '@/lib/financeiro/razao/gerar'
import { categoriaOperacional, type TituloOperacional, type FolhaOperacional } from '@/lib/dre/regras-operacionais'
import { competenciasDisponiveis } from '@/lib/financeiro/competencias'
const fmt=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n)
export const dynamic='force-dynamic'
export default async function OperacaoPage({searchParams}:{searchParams:Promise<{mes?:string}>}) {
 const [sp,unit,db]=await Promise.all([searchParams,getCurrentUnit(),createFinanceiroClient()])
 if(!unit)return <p>Selecione uma unidade.</p>
 const {data:ultimo,error:ultimoErro}=await db.from('receita_dias').select('data').eq('unit_id',unit.id).order('data',{ascending:false}).limit(1)
 if(ultimoErro)throw new Error(ultimoErro.message)
 const mes=sp.mes&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(sp.mes)?sp.mes:ultimo?.[0]?.data?.slice(0,7)??new Date().toISOString().slice(0,7)
 const [ano,m]=mes.split('-').map(Number), fim=new Date(Date.UTC(ano,m,1)).toISOString().slice(0,10)
 const [receitas,titulos,folha,compras]=await Promise.all([
 fetchAll<{id:string;previsto:number|null;receita_bruta:number|null;desconto:number|null}>((from,to)=>db.from('receita_dias').select('id,previsto,receita_bruta,desconto').eq('unit_id',unit.id).gte('data',`${mes}-01`).lt('data',fim).order('id').range(from,to)),
 fetchAll<TituloOperacional>((from,to)=>db.from('titulos_a_pagar').select('id,descricao_c_gerencial,v_titulo,d_competencia,d_lancamento,d_vencimento,ref_mes').eq('unit_id',unit.id).eq('origem','contas_pagar').order('id').range(from,to)),
 fetchAll<FolhaOperacional>((from,to)=>db.from('folha_empresa').select('id,nome,competencia,etapa,pagamento,bonificacao').eq('unit_id',unit.id).eq('competencia',mes).order('id').range(from,to)),
 fetchAll<{v_custo_total:number|null}>((from,to)=>db.from('produtos_relatorio').select('id,v_custo_total').eq('unit_id',unit.id).eq('direcao_nfe','entrada').not('chave_nfe','is',null).eq('ano_lancamento',ano).eq('mes_lancamento',m).order('id').range(from,to)),
 ])
 let recebido=0
 for(let i=0;i<receitas.length;i+=100){const pagamentos=await fetchAll<{valor_recebido:number|null}>((from,to)=>db.from('receita_pagamentos').select('workday_id_fk,forma,valor_recebido').in('workday_id_fk',receitas.slice(i,i+100).map(r=>r.id)).order('workday_id_fk').order('forma').range(from,to));recebido+=pagamentos.reduce((s,p)=>s+Math.round(Number(p.valor_recebido??0)*100),0)}
 const bruto=receitas.reduce((s,r)=>s+Math.round(Number(r.previsto??r.receita_bruta??0)*100),0)/100
 const custo=compras.reduce((s,r)=>s+Math.round(Math.abs(Number(r.v_custo_total??0))*100),0)/100
 const despesas=new Map<string,number>()
 for(const t of titulos){if((t.d_competencia??t.ref_mes??t.d_lancamento??t.d_vencimento)?.slice(0,7)!==mes)continue; const conta=categoriaOperacional(t.descricao_c_gerencial??'')??t.descricao_c_gerencial??'Sem classificação';despesas.set(conta,(despesas.get(conta)??0)+Math.round(Number(t.v_titulo??0)*100))}
 const totalContas=[...despesas.values()].reduce((s,v)=>s+v,0)/100
 const totalFolha=folha.filter(f=>f.etapa==='mensal').reduce((s,f)=>s+(Math.round(Number(f.pagamento??0)*100)+Math.round(Number(f.bonificacao??0)*100)),0)/100
 const box={background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:18}
 return <div style={{maxWidth:1180,margin:'0 auto',color:'var(--text)'}}><Link href="/financeiro/dre">DRE</Link><h1 style={{fontSize:28,fontWeight:700,margin:"14px 0 4px"}}>Operação</h1><p>{unit.name} · visão geral de receitas, custos e despesas · {mes}</p>
 <form action="/financeiro/dre/operacao" style={{display:'flex',gap:12,marginBottom:20}}><select name="mes" aria-label="Competência" defaultValue={mes} style={box}>{competenciasDisponiveis(`${mes}-01`).reverse().map(c=><option key={c} value={c.slice(0,7)}>{c.slice(5,7)}/{c.slice(0,4)}</option>)}</select><button style={box}>Aplicar</button></form>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}>{[['Receita bruta',bruto],['Recebido',recebido/100],['Compras / CMV da casa (XML)',custo],['Contas a pagar + Folha Empresa',totalContas+totalFolha]].map(([label,v])=><div key={label} style={box}><div style={{fontSize:11,fontWeight:600,textTransform:"uppercase",color:"var(--text-3)"}}>{label}</div><div style={{fontSize:25,fontWeight:700,marginTop:8}}>{fmt(Number(v))}</div></div>)}</div>
 <p style={{color:'var(--text-3)',fontSize:13,lineHeight:1.6}}>Visão por fonte: recebido é parte da receita, e compras podem também constar em Contas a Pagar. Os blocos não são somados entre si para apurar lucro enquanto essas bases não estiverem conciliadas. Despesas incluem títulos pagos e em aberto por competência. Folha Empresa = pagamento + bonificação.</p>
 <div style={{...box,marginTop:20}}><h2 style={{fontSize:16,fontWeight:700,marginBottom:16}}>Custos e despesas em Contas a Pagar</h2><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th style={{textAlign:'left'}}>Conta</th><th style={{textAlign:'right'}}>Valor</th></tr></thead><tbody>{[...despesas.entries()].sort((a,b)=>b[1]-a[1]).map(([nome,v])=><tr key={nome} style={{borderTop:'1px solid var(--border)'}}><td style={{padding:10}}>{nome}</td><td style={{textAlign:'right'}}>{fmt(v/100)}</td></tr>)}</tbody><tfoot><tr><th style={{textAlign:'left'}}>Total Contas a Pagar</th><th style={{textAlign:'right'}}>{fmt(totalContas)}</th></tr><tr><td>Folha Empresa (inclui Cintia uma vez)</td><td style={{textAlign:'right'}}>{fmt(totalFolha)}</td></tr></tfoot></table></div>
 </div>
}
