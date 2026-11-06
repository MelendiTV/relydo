/* eslint-disable @typescript-eslint/no-require-imports -- Isolated CommonJS relay harness with injected RPC/HTTP, no live services. */
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {createTestRelayAdmission}=require('../scripts/director-test-relay-policy.cjs');
function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'relydo-relay-admission-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 let now=Date.parse('2032-04-01T12:00:00Z');
 const env={RELYDO_TEST_PROJECT_REF:'aictsnrpbabdlakxmnxg',RELYDO_TEST_URL:'https://aictsnrpbabdlakxmnxg.supabase.co',RELYDO_TEST_SERVER_KEY:'fixture-only',RELYDO_TEST_EVENTS_ENABLED:'true',RELYDO_TEST_EVENTS_SECRET:'a'.repeat(64),RELYDO_TEST_OWNER_POLICY_DIRECTORY:directory};
 const p={id:crypto.randomUUID(),project:env.RELYDO_TEST_PROJECT_REF,model:'gpt-6-luna',approved:'OWNER_APPROVES_CONTINUOUS_REAL_TEST',approvedAt:now-1000,expiresAt:now+86400000,pricingVerifiedAt:now-2000};
 const state={mode:'active',policyId:p.id,policySha256:crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex')};
 const save=()=>{fs.writeFileSync(path.join(directory,'state.json'),JSON.stringify(state));fs.writeFileSync(path.join(directory,p.id+'.policy.json'),JSON.stringify(p));};save();
 const admission=createTestRelayAdmission({directory,env,clock:()=>now});
 const event={version:2,project:p.project,eventId:crypto.randomUUID(),requestId:crypto.randomUUID(),event:'request.created',status:'quoted',occurredAt:new Date(now).toISOString(),sourceVersion:'1'};
 return {directory,env,p,state,save,admission,event,now:()=>now,advance:ms=>now+=ms};
}
test('read-only admission persists across restart and rejects historical, PROD, revoked, expired or changed policy',t=>{
 const f=fixture(t);a.equal(f.admission.accepts(f.event),true);a.equal(createTestRelayAdmission({directory:f.directory,env:f.env,clock:f.now}).accepts(f.event),true);
 a.equal(f.admission.accepts({...f.event,occurredAt:'2026-01-01T00:00:00Z'}),false);a.equal(f.admission.accepts({...f.event,project:'hnflxuqxsyzwfhdylzpp'}),false);
 f.state.mode='paused';f.save();a.equal(f.admission.accepts(f.event),false);f.state.mode='active';f.save();
 f.p.expiresAt+=1;fs.writeFileSync(path.join(f.directory,f.p.id+'.policy.json'),JSON.stringify(f.p));a.equal(f.admission.accepts(f.event),false);f.p.expiresAt-=1;f.save();f.advance(86400000);a.equal(f.admission.accepts(f.event),false);
});
test('transport never sends old events or after revocation and refuses another destination',async t=>{
 const f=fixture(t);let sends=0;const send=f.admission.guardedTransport(async()=>{sends++;return Response.json({accepted:true});}),url='http://127.0.0.1:3106/api/integrations/marketplace/events';
 a.equal((await send(url,{method:'POST',body:JSON.stringify({...f.event,occurredAt:'2026-01-01T00:00:00Z'})})).status,409);a.equal(sends,0);
 await a.rejects(send('http://127.0.0.1:3000/api/integrations/marketplace/events',{method:'POST',body:JSON.stringify(f.event)}),/TARGET_BLOCKED/);
 a.equal((await send(url,{method:'POST',body:JSON.stringify(f.event)})).status,200);a.equal(sends,1);
 f.state.mode='off';f.save();a.equal((await send(url,{method:'POST',body:JSON.stringify(f.event)})).status,409);a.equal(sends,1);
});
test('actual TEST relay skips state backfill, ACKs only the received event and installs graceful SIGTERM without network',async t=>{
 const f=fixture(t),old={...f.event,eventId:crypto.randomUUID(),occurredAt:'2026-01-01T00:00:00Z'},acks=[],signals=[],urls=[];
 const rows=[old,f.event].map((e,i)=>({event_id:e.eventId,request_id:e.requestId,event_type:e.event,status:e.status,occurred_at:e.occurredAt,source_version:String(i+1),lease_token:crypto.randomUUID()}));
 const fetch=async(url,options)=>{
  urls.push(url);
  if(url==='https://aictsnrpbabdlakxmnxg.supabase.co/rest/v1/rpc/claim_director_events')return Response.json(rows);
  if(url==='https://aictsnrpbabdlakxmnxg.supabase.co/rest/v1/rpc/ack_director_event'){acks.push(JSON.parse(options.body));return Response.json(true);}
  if(url==='http://127.0.0.1:3106/api/integrations/marketplace/events'){const e=JSON.parse(options.body);a.equal(e.eventId,f.event.eventId);return Response.json({accepted:true,eventId:e.eventId,caseId:e.eventId,modelCalls:0});}
  throw Error('UNEXPECTED_NETWORK');
 };
 class Clock extends Date {static now(){return f.now();}}
 const sandbox={process:{env:f.env,argv:['node','relay','--test'],cwd:()=>path.resolve('.'),on:(s)=>signals.push(s)},__dirname:path.resolve('scripts'),fetch,Date:Clock,Response,Buffer,URL,AbortSignal,console:{log(){},error(){}},require:n=>n==='@next/env'?{loadEnvConfig(){}}:n==='./director-test-relay-policy.cjs'?{createTestRelayAdmission:opts=>createTestRelayAdmission({...opts,clock:f.now,env:f.env})}:require(n)};
 const source=fs.readFileSync('scripts/director-outbox-relay.cjs','utf8').replace('run().catch(', 'globalThis.finished=run().catch(');
 vm.runInNewContext(source,sandbox);await sandbox.finished;
 a.equal(sandbox.process.exitCode,undefined);a.equal(urls.some(u=>u.includes('recover_director_events')),false);a.equal(urls.filter(u=>u.startsWith('http://127.0.0.1:3106/')).length,1);
 a.equal(acks.length,2);a.equal(acks[0].p_accepted,false);a.equal(acks[1].p_accepted,true);a.ok(signals.includes('SIGTERM'));
});
