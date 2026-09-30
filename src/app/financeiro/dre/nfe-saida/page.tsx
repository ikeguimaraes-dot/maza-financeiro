import { createFinanceiroClient } from '@/lib/financeiro/db/client'
import { getCurrentUnit } from '@maza/auth/unit'
import { fetchAllPaginado as fetchAll } from '@/lib/financeiro/razao/gerar'
import { NfeSaidaClient, type DocumentoSaida } from '@/components/financeiro/produtos/NfeSaidaClient'
export const dynamic='force-dynamic'
export default async function NfeSaidaPage({searchParams}:{searchParams:Promise<{mes?:string;ano?:string;pagina?:string;q?:string}>}) {
 const [sp,unit,db]=await Promise.all([searchParams,getCurrentUnit(),createFinanceiroClient()])
 if(!unit) return <p>Selecione uma unidade.</p>
 const base=()=>db.from('nfe_documentos').select('emissao').eq('unit_id',unit.id).eq('direcao','saida').eq('cancelada',false)
 // Histórico leve de datas, sem buscar nenhum item ou XML para montar o filtro.
 const datas=await fetchAll<{emissao:string}>((from,to)=>base().order('id').range(from,to))
 const meses=[...new Set(datas.map(d=>d.emissao.slice(0,7)))].sort()
 const ultimo=meses.at(-1)??new Date().toISOString().slice(0,7)
 const escolhido=sp.ano&&sp.mes?`${Number(sp.ano)}-${String(Number(sp.mes)).padStart(2,'0')}`:ultimo
 const periodo=/^20\d{2}-(0[1-9]|1[0-2])$/.test(escolhido)?escolhido:ultimo
 const [ano,mes]=periodo.split('-').map(Number) as [number,number]
 if(!meses.includes(periodo))meses.push(periodo)
 const q=(sp.q??'').trim().slice(0,100); const termo=q.replace(/[^\p{L}\p{N} ]/gu,' ').trim()
 function consulta<T extends string>(campos:T) {
  let query=db.from('nfe_documentos').select(campos).eq('unit_id',unit!.id).eq('direcao','saida').eq('cancelada',false).gte('emissao',`${periodo}-01T00:00:00Z`).lt('emissao',new Date(Date.UTC(ano,mes,1)).toISOString())
  if(termo)query=query.or(`numero.ilike.%${termo}%,emitente_nome.ilike.%${termo}%,destinatario_nome.ilike.%${termo}%`)
  return query
 }
 const valores=await fetchAll<{valor_total:number|null}>((from,to)=>consulta('valor_total').order('id').range(from,to))
 const pagina=Math.min(Math.max(1,Math.floor(Number(sp.pagina)||1)),Math.max(1,Math.ceil(valores.length/50)))
 const {data,error}=await consulta('chave,numero,emissao,valor_total,destinatario_nome,emitente_nome').order('emissao',{ascending:false}).order('id').range((pagina-1)*50,pagina*50-1)
 if(error)throw new Error(error.message)
 const total=valores.reduce((s,n)=>s+Math.round(Number(n.valor_total??0)*100),0)/100
 return <NfeSaidaClient key={`${unit.id}-${periodo}-${q}-${pagina}`} notas={(data??[]) as unknown as DocumentoSaida[]} meses={meses} mes={mes} ano={ano} pagina={pagina} quantidade={valores.length} total={total} q={q}/>
}
