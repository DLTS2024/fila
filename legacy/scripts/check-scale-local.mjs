import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

// Only explicitly supported local destinations may receive the development token.
const base=process.argv.includes('--lan')?'http://192.168.1.5:5173':'http://127.0.0.1:5173';
const vars=readFileSync(new URL('../.dev.vars',import.meta.url),'utf8');
const match=vars.match(/^\s*SCALE_DEVICE_TOKEN\s*=\s*(.+?)\s*$/m);
assert.ok(match,'Local device token is missing');
const token=match[1].replace(/^(["'])(.*)\1$/,'$2');
assert.ok(token.length>=24,'Local device token is too short');
const stockBefore=await (await fetch(base+'/api/stock')).json();
const payload={deviceId:'DLOOP-SCALE-01',grossG:984.6,stable:true};
async function post(label,credential,expected,body=payload){
 const r=await fetch(base+'/api/scale-reading',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},body:JSON.stringify(body)});
 const value=await r.json();
 // Print only fixed result fields, never headers or credentials.
 console.log(label,JSON.stringify({status:r.status,...value}));
 assert.equal(r.status,expected,label);
 return value;
}
await post('Missing token',null,401);
await post('Invalid token','invalid-local-test-token',401);
await post('Authenticated invalid device',token,400,{...payload,deviceId:'unknown-device'});
await post('Authenticated reading',token,200);
const r=await fetch(base+'/api/scale-reading',{redirect:'error'});
const result=await r.json();
assert.equal(r.status,200);
assert.equal(result.reading.device_id,payload.deviceId);
assert.equal(result.reading.gross_g,payload.grossG);
assert.equal(result.reading.stable,1);
assert.ok(Date.now()-Date.parse(result.reading.recorded_at)<30000);
console.log('GET stored reading',JSON.stringify({status:r.status,...result}));
const stockAfter=await (await fetch(base+'/api/stock')).json();
assert.deepEqual(stockAfter,stockBefore);
console.log('PASS: stock state and revision unchanged');
