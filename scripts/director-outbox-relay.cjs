/* eslint-disable @typescript-eslint/no-require-imports -- Native local relay using the existing TS sender. */
// Optional local relay against the existing backend. No new server or cloud service.
// Start ONLY after approving/applying the prepared outbox on the verified marketplace project.
require('@next/env').loadEnvConfig(process.cwd());
const watch = process.argv.includes('--watch');
const testMode=process.argv.includes('--test');
const secret = process.env.RELYDO_DIRECTOR_OUTBOX_DRAIN_SECRET;
if (!testMode&&(!secret || secret.length < 32)) throw Error('Configure server-only RELYDO_DIRECTOR_OUTBOX_DRAIN_SECRET (32+ characters).');
async function drainTest(){
  if(process.env.RELYDO_TEST_PROJECT_REF!=='aictsnrpbabdlakxmnxg'||process.env.RELYDO_TEST_URL!=='https://aictsnrpbabdlakxmnxg.supabase.co'||!process.env.RELYDO_TEST_SERVER_KEY)throw Error('TEST_PROJECT_BINDING_INVALID');
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),exports={};
  const admission=require('./director-test-relay-policy.cjs').createTestRelayAdmission({
    directory:process.env.RELYDO_TEST_OWNER_POLICY_DIRECTORY||path.resolve(__dirname,'../../relydo-ai-admin/.relydo-chat/test-continuous-real'),
  });
  admission.policy();
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../app/lib/commandCenterOutbox.ts'),'utf8'),{compilerOptions:{module:1,target:9}}).outputText,{exports,Buffer,process,URL,AbortSignal,fetch,Date,require});
  const rpc=async(name,args)=>{
    if(!['recover_director_events','claim_director_events','ack_director_event'].includes(name))throw Error('TEST_RPC_DENIED');
    // TEST relays only committed outbox events. State backfill can manufacture historical events
    // with a fresh timestamp and needs separate Owner review, never an automatic watch loop.
    if(name==='recover_director_events')return {data:{status:'skipped',recovered:0},error:null};
    const r=await fetch('https://aictsnrpbabdlakxmnxg.supabase.co/rest/v1/rpc/'+name,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:process.env.RELYDO_TEST_SERVER_KEY,Authorization:'Bearer '+process.env.RELYDO_TEST_SERVER_KEY,'Content-Type':'application/json'},body:JSON.stringify(args??{})});
    return {data:r.ok?await r.json():null,error:r.ok?null:'TEST_RPC_FAILED'};
  };
  return exports.drainOperationalOutbox(rpc,process.env,admission.guardedTransport(fetch),Date.now(),'test');
}
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
if(testMode)process.on('SIGTERM', () => { stopping = true; });
async function run() {
  do {
    let delay = 1000;
    try {
      if(testMode){const result=await drainTest();if(result.disabled)throw Error('TEST_EVENTS_DISABLED');if(result.delivered||result.pending)console.log('Director TEST outbox:',{delivered:result.delivered,pending:result.pending});}
      else {
      const response = await fetch('http://127.0.0.1:3000/api/internal/director-events/drain', {
        method:'POST', redirect:'error', signal:AbortSignal.timeout(40000), headers:{authorization:'Bearer '+secret}
      });
      if (!response.ok) { console.error('Director outbox: backend HTTP '+response.status); delay = 10000; }
      else {
        const result = await response.json();
        if (result.recovery?.status === 'failed') {
          console.error('Director outbox: recovery unavailable; existing queue delivery continues.'); delay = 10000;
        }
        if (result.delivered || result.pending || result.recovery?.recovered) console.log('Director outbox:', {
          delivered: result.delivered, pending: result.pending, recovered: result.recovery?.recovered
        });
      }}
    } catch(error) { console.error(testMode&&error?.message==='TEST_RELAY_POLICY_BLOCKED'?'Director TEST outbox: Owner policy blocked; committed events remain pending.':'Director outbox: backend unavailable; committed events remain pending.'); delay = 10000; }
    if (watch && !stopping) await new Promise(resolve => setTimeout(resolve,delay));
  } while (watch && !stopping);
}
run().catch(() => { console.error('Director outbox relay failed.'); process.exitCode=1; });
