/* eslint-disable @typescript-eslint/no-require-imports -- Read-only local TEST policy admission; no credentials or RPC on import. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PROJECT='aictsnrpbabdlakxmnxg',UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function createTestRelayAdmission({directory,env=process.env,clock=Date.now}={}){
 function policy(){
  try{
  if(env.RELYDO_TEST_PROJECT_REF!==PROJECT||env.RELYDO_TEST_URL!=='https://'+PROJECT+'.supabase.co'||!env.RELYDO_TEST_SERVER_KEY||env.RELYDO_TEST_EVENTS_ENABLED!=='true'||!path.isAbsolute(directory||''))throw Error('TEST_RELAY_POLICY_BLOCKED');
  const state=JSON.parse(fs.readFileSync(path.join(directory,'state.json'),'utf8'));
  if(state.mode!=='active'||!UUID.test(state.policyId||''))throw Error('TEST_RELAY_POLICY_BLOCKED');
  const p=JSON.parse(fs.readFileSync(path.join(directory,state.policyId+'.policy.json'),'utf8'));
  const sha=crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex'),now=clock();
  if(state.policySha256!==sha||p.id!==state.policyId||p.project!==PROJECT||p.model!=='gpt-6-luna'||p.approved!=='OWNER_APPROVES_CONTINUOUS_REAL_TEST'||!Number.isSafeInteger(p.approvedAt)||!Number.isSafeInteger(p.expiresAt)||p.approvedAt>now||p.expiresAt<=now||!Number.isSafeInteger(p.pricingVerifiedAt)||p.pricingVerifiedAt>p.approvedAt||now-p.pricingVerifiedAt>=86400000)throw Error('TEST_RELAY_POLICY_BLOCKED');
  return p;
  }catch{throw Error('TEST_RELAY_POLICY_BLOCKED');}
 }
 function accepts(event){try{
  const p=policy(),at=Date.parse(event?.occurredAt);
  return event?.project===PROJECT&&UUID.test(event.eventId||'')&&UUID.test(event.requestId||'')&&event.eventId!==event.requestId&&Number.isFinite(at)&&at>=p.approvedAt&&at<=clock()+300000;
 }catch{return false;}}
 function guardedTransport(transport){return async(url,options)=>{
  const target=new URL(url);
  if(target.origin!=='http://127.0.0.1:3106'||target.pathname!=='/api/integrations/marketplace/events'||target.search||target.hash||target.username||target.password||options?.method!=='POST')throw Error('TEST_RELAY_TARGET_BLOCKED');
  let event;try{event=JSON.parse(options.body);}catch{throw Error('TEST_RELAY_EVENT_BLOCKED');}
  // Recheck for revocation/expiry between claim and send; no historical event reaches HTTP.
  if(!accepts(event))return Response.json({accepted:false},{status:409});
  return transport(url,options);
 };}
 return {policy,accepts,guardedTransport};
}
module.exports={createTestRelayAdmission};
