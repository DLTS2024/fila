import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
assert.equal(process.env.DLOOP_DISPOSABLE_TEST,'yes');
const base=process.env.DLOOP_TEST_URL||'http://127.0.0.1:8000';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));
let cookie,csrf,stock,checks=0;
async function call(path,{body,key,token=csrf,expected=200}={}){
 const r=await fetch(base+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{Origin:'http://127.0.0.1:5173','Content-Type':'application/json','X-CSRF-Token':token||''}),...(key?{'Idempotency-Key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const json=await r.json();assert.equal(r.status,expected,JSON.stringify(json));checks++;return json;
}
csrf=(await call('/auth/session')).data.csrfToken;
csrf=(await call('/auth/login',{body:{email:'phase35-proxy@example.invalid',password:'Fixture-only-password-123!'}})).data.csrfToken;
stock=await call('/stock');const target=stock.state.spools.find(p=>p.id==='00000000-0000-4000-8000-000000000001');assert(target&&target.tareKnown);
const path='/spools/'+target.id+'/measurements',connectionId=crypto.randomUUID();
const reading=(seq,extra={})=>({v:1,deviceId:'DLOOP-SCALE-01',seq,grossG:900,stable:true,calibrated:true,receivedAt:new Date().toISOString(),connectionId,transport:'usb',...extra});
function body(r){const p=stock.state.spools.find(p=>p.id===target.id);return{revision:stock.revision,version:p.version,gross:'900.00',tare:p.tare.toFixed(2),confirmed:true,reading:r};}
for(const invalid of [{stable:false},{calibrated:false},{v:2},{deviceId:'OTHER'},{seq:-1},{grossG:'900'},{grossG:901},{receivedAt:new Date(Date.now()-6000).toISOString()},{receivedAt:new Date(Date.now()+6000).toISOString()},{fault:'HX711_TIMEOUT'},{connectionId:'bad'}])await call(path,{body:body(reading(2000000,invalid)),key:crypto.randomUUID(),expected:422});
await call(path,{body:body(reading(2000000)),key:crypto.randomUUID(),token:'bad',expected:403});
await call(path,{body:{...body(reading(2000000)),tare:'230.00'},key:crypto.randomUUID(),expected:422});
const before=structuredClone(stock);assert.deepEqual(await call('/stock'),before);
const key=crypto.randomUUID(),confirmed=body(reading(2000000));stock=await call(path,{body:confirmed,key});assert.equal(stock.state.spools.find(p=>p.id===target.id).remaining,680);
const after=structuredClone(stock);
await new Promise(resolve=>setTimeout(resolve,5100));
assert.deepEqual(await call(path,{body:confirmed,key}),after); // Cached retry is safe even after expiry.
await call(path,{body:body({...confirmed.reading,receivedAt:new Date().toISOString()}),key:crypto.randomUUID(),expected:409});
await call(path,{body:body(reading(2000001,{receivedAt:new Date(Date.now()-6000).toISOString()})),key:crypto.randomUUID(),expected:422});
stock=await call(path,{body:body(reading(2000001,{transport:'simulator'})),key:crypto.randomUUID()});
assert(stock.state.history[0].note.includes('simulator'));
const manual=body(reading(2000002));delete manual.reading;stock=await call(path,{body:manual,key:crypto.randomUUID()});
assert.equal(stock.state.spools.find(p=>p.id===target.id).tare,220);
mkdirSync('backend/var/phase5a',{recursive:true});writeFileSync('backend/var/phase5a/server-scale-results.json',JSON.stringify({checks,target:target.id,connectionId,physicalSequence:2000000,simulatorSequence:2000001,replayedAfterExpiry:true,confirmedWrites:3,verifiedAt:new Date().toISOString()},null,2));
await call('/auth/logout',{body:{}});
console.log(`PASS: ${checks} scale endpoint checks; unsafe/stale/fault/CSRF/tare mismatch rejected; safe metadata recorded; duplicate frame rejected; committed retry acknowledged after expiry; manual API remains compatible.`);
