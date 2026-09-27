/* eslint-disable @typescript-eslint/no-require-imports */
// Offline renderer only. Never connects to Stripe, Supabase or any database.
const fs=require('node:fs'),crypto=require('node:crypto');
const [first,second,output,mode,...extra]=process.argv.slice(2);
if(!first||!second||!output||extra.length||(mode&&mode!=='--commit')){
 throw Error('Usage: node scripts/render-historical-reconciliation.cjs evidence-540.json evidence-co-refund.json output.sql [--commit]');
}
const files=[first,second],ids=['d22970ec-9da5-4f11-b79b-e7acba81b28b','059532b3-2572-426a-a3d9-7c99a65193e9'];
const externalIds=['tr_3U4IGSIEn05DVPjv00L0GaMI','re_3UC5VNIEn05DVPjv1MUPgfdG'];
const rows=files.map((file,i)=>{
 const bytes=fs.readFileSync(file),e=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
 const externalId=i===0?e.transfers?.data?.[0]?.id:e.refund?.id;
 if(externalId!==externalIds[i]||!e.reviewed_by||!e.reference||!e.stripe_account_id||e.livemode!==false
   ||!Number.isSafeInteger(e.charge?.created)||!Number.isSafeInteger(i===0?e.transfers?.data?.[0]?.created:e.refund?.created)
   ||(i===1&&!e.refund_display_timezone)){
  throw Error('Real, reviewed Sandbox evidence is required. Synthetic or incomplete evidence refused.');
 }
 // SQL handles all exact case validation. Escape SQL string literals, including
 // apostrophes in operator notes; standard_conforming_strings is set below.
 const literal=JSON.stringify(e).replace(/'/g,"''");
 return `-- Input ${i+1} SHA256: ${crypto.createHash('sha256').update(bytes).digest('hex')}\nselect public.reconcile_historical_release_20260927('${ids[i]}','${literal}'::jsonb);`;
});
const sql=`-- REVIEWED MANUAL OPERATION ONLY. No external financial operations.\n\\set ON_ERROR_STOP on\nset standard_conforming_strings=on;\nbegin;\nset local lock_timeout='3s';\nset local statement_timeout='30s';\n${rows.join('\n')}\nselect request_id,outcome,recorded_at,recorded_by,before_state,after_state\nfrom public.historical_release_reconciliations\nwhere request_id in ('${ids[0]}','${ids[1]}') order by request_id;\n${mode==='--commit'?'commit':'rollback'};\n`;
fs.writeFileSync(output,sql,{flag:'wx'});
console.log(mode==='--commit'?'Commit SQL generated; NOT executed.':'Rollback review SQL generated; NOT executed.');
