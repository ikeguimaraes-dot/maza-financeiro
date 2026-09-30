// Read-only by default; --aplicar publishes only the explicitly listed months.
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { loadTs } from '../tests/helpers/load-ts.mjs';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {gerarRazao,YOSHIMORI_UNIT_ID,IKY_UNIT_ID}=loadTs('src/lib/financeiro/razao/gerar.ts');
const apply=process.argv.includes('--aplicar');
const report=[];
for(const unit of [YOSHIMORI_UNIT_ID,IKY_UNIT_ID]) {
 for(const month of ['2026-05-01','2026-06-01','2026-07-01','2026-08-01']) {
  const before=await db.from('kpi_snapshot').select('*').eq('unit_id',unit).eq('competencia',month).maybeSingle();
  if(before.error)throw before.error;
  let operations=[];
  const client=apply?db:{from:db.from.bind(db),rpc:async(name,args)=>{if(name!=='financeiro_aplicar_lote')throw new Error(name);operations=args.p_operations;return {error:null}}};
  const result=await gerarRazao(client,unit,month);
  if(!result.ok)throw new Error(JSON.stringify(result));
  const after=apply?(await db.from('kpi_snapshot').select('*').eq('unit_id',unit).eq('competencia',month).single()).data:operations.find(o=>o.table==='kpi_snapshot')?.rows?.[0];
  const item={unit,month,before:before.data,after,result};report.push(item);
  console.log(JSON.stringify({unit,month,result,antes:before.data?.ebitda,depois:after?.ebitda,cmvAntes:before.data?.cmv_compras,cmvDepois:after?.cmv_compras}));
 }
}
const path=`/private/tmp/maza-reprocessamento-${apply?'aplicado':'previa'}-20260922.json`;
writeFileSync(path,JSON.stringify(report,null,2),{mode:0o600});console.log(path);
