// Isolated database only. Never changes a running studio or its access config.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import http from 'node:http';
const dir=path.resolve('work/local-single-user-test');
const settings=JSON.parse(fs.readFileSync(path.join(dir,'test-settings.json')));
assert(settings.database.startsWith('dloop_test_local_mode_'));
const php=process.env.DLOOP_PHP||'C:/xampp/php/php.exe';
const children=[];let checks=0;
const check=(ok,label)=>{assert(ok,label);checks++;};
async function server(port,config){
 const child=spawn(php,['-S',`127.0.0.1:${port}`,'-t','backend/public','backend/router.php'],{env:{...process.env,DLOOP_CONFIG_FILE:path.join(dir,config)},stdio:'ignore'});children.push(child);
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error('Isolated PHP test server failed');try{await fetch(`http://127.0.0.1:${port}/api/v1/auth/session`);return;}catch{await new Promise(r=>setTimeout(r,50));}}
 throw Error('Isolated server timeout');
}
try{
 await server(8110,'auth.config.local.php');await server(8111,'local.config.local.php');
 for(const file of process.argv.includes('--local-only')?[]:['backend/tests/http.mjs','backend/tests/auth-database.mjs','backend/tests/inventory-http.mjs','backend/tests/scale-http.mjs']){
  const r=spawnSync(process.execPath,[file],{env:{...process.env,DLOOP_TEST_URL:'http://127.0.0.1:8110',DLOOP_DISPOSABLE_TEST:'yes'},encoding:'utf8'});
  process.stdout.write(r.stdout);if(r.status!==0){process.stderr.write(r.stderr);throw Error('Authenticated-mode HTTP regression failed');}
 }
 const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5174','--strictPort'],{env:{...process.env,DLOOP_ACCESS_MODE:'LOCAL_SINGLE_USER',DLOOP_LOCAL_BRIDGE_TOKEN:settings.bridge,DLOOP_API_PROXY:'http://127.0.0.1:8111'},stdio:'ignore'});children.push(vite);
 let proxyReady=false;for(let i=0;i<100;i++){if(vite.exitCode!==null)throw Error('Isolated frontend failed');try{const r=await fetch('http://127.0.0.1:5174/api/v1/auth/session');if(r.status===200){proxyReady=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}
 check(proxyReady,'Real Vite proxy supplies private bridge to local PHP');
 const originDenied=await fetch('http://127.0.0.1:5174/api/v1/auth/session',{headers:{Origin:'https://evil.invalid'}});check(originDenied.status===403,'Real frontend rejects foreign origin');
 const forwardedDenied=await fetch('http://127.0.0.1:5174/api/v1/auth/session',{headers:{'X-Forwarded-For':'127.0.0.1'}});check(forwardedDenied.status===403,'Real frontend rejects proxy forwarding');
 for(const route of ['/','/@vite/env']){const body=await (await fetch('http://127.0.0.1:5174'+route)).text();check(!body.includes(settings.bridge),'Private bridge never appears in served HTML/environment');}
 const privateFile=await fetch('http://127.0.0.1:5174/@fs/'+path.join(dir,'test-settings.json').replaceAll('\\','/'));check(privateFile.status===403,'Private work files inaccessible through dev server');
 const base='http://127.0.0.1:8111/api/v1';let cookie='',csrf='';
 async function call(route,{method='GET',body,headers={},bridge=true,session=true}={}){
  const r=await fetch(base+route,{method,headers:{...(bridge?{'X-DLoop-Local-Bridge':settings.bridge}:{}),...(session&&cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json',Origin:'http://127.0.0.1:5173','X-CSRF-Token':csrf}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json(),headers:r.headers};
 }
 const routes=[['/spool-selection','GET'],['/spool-selection','POST'],['/auth/session','GET'],['/auth/login','POST'],['/auth/logout','POST'],['/auth/local-bootstrap','POST'],['/dashboard','GET'],['/brands','GET'],['/brands','POST'],['/brands/1','PATCH'],['/tare-profiles','GET'],['/tare-profiles','POST'],['/tare-profiles/1','PATCH'],['/spools','GET'],['/spools','POST'],['/spools/00000000-0000-4000-8000-000000000001','PATCH'],['/spools/00000000-0000-4000-8000-000000000001/measurements','POST'],['/stock','GET'],['/stock','POST'],['/catalogue','GET'],['/catalogue','POST'],['/activity','GET'],['/activity/1/undo','POST'],['/printers','GET'],['/printer-slots/kobra-1','PUT'],['/print-jobs','POST'],['/scale-reading','GET'],['/nfc-tags/link','POST']];
 for(const [route,method] of routes)check((await call(route,{method,bridge:false,session:false,...(method==='GET'?{}:{body:{}})})).status===403,'Every API rejects missing private bridge');
 let v=await call('/auth/session');check(v.status===200&&!v.data.data.authenticated&&v.data.data.accessMode==='LOCAL_SINGLE_USER','GET session remains anonymous');csrf=v.data.data.csrfToken;
 check(/HttpOnly/i.test(v.headers.get('set-cookie'))&&/SameSite=Strict/i.test(v.headers.get('set-cookie')),'Secure session cookie attributes');
 for(const [route,method] of routes.filter(([r])=>!r.startsWith('/auth/'))){check((await call(route,{method,...(method==='GET'?{}:{body:{}})})).status===401,'Local endpoints still require a session');}
 check((await call('/auth/local-bootstrap',{method:'POST',body:{},headers:{'X-CSRF-Token':''}})).status===403,'Bootstrap needs CSRF');
 check((await call('/auth/local-bootstrap',{method:'POST',body:{},headers:{Origin:'https://evil.invalid'}})).status===403,'Bootstrap rejects foreign origin');
 check((await call('/auth/local-bootstrap',{method:'POST',body:{userId:'2'}})).status===422,'Caller cannot select a local actor');
 const hostileHostStatus=await new Promise((resolve,reject)=>{const q=http.request({host:'127.0.0.1',port:8111,path:'/api/v1/stock',headers:{Host:'evil.invalid','X-DLoop-Local-Bridge':settings.bridge}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));});q.on('error',reject);q.end();});
 check(hostileHostStatus===403,'Raw HTTP hostile Host rejected (fetch normalizes Host)');
 for(const headers of [{'X-Forwarded-For':'127.0.0.1'},{Forwarded:'for=127.0.0.1'},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'same-site'},{Referer:'https://evil.invalid/'}]){const denied=await call('/stock',{headers});check(denied.status===403,`Ingress policy ${Object.keys(headers).join(',')} returned ${denied.status}`);}
 const priorCookie=cookie,priorCsrf=csrf;v=await call('/auth/local-bootstrap',{method:'POST',body:{}});
 check(v.status===200&&v.data.data.authenticated&&v.data.data.user.id==='1','Explicit configured actor receives a local session');
 check(cookie!==priorCookie&&v.data.data.csrfToken!==priorCsrf,'Bootstrap rotates session and CSRF');csrf=v.data.data.csrfToken;
 const activeCookie=cookie;
 check((await call('/stock',{headers:{Cookie:priorCookie}})).status===401,'Pre-bootstrap session cannot access data');cookie=activeCookie;
 for(const route of ['/stock','/dashboard','/brands','/tare-profiles','/spools','/catalogue','/activity','/printers','/scale-reading'])check((await call(route)).status===200,'All read endpoints work under a protected local session');
 check((await call('/auth/login',{method:'POST',body:{email:'ignored@example.invalid',password:'ignored'}})).status===409,'No password login in local mode');
 for(const [route,method] of routes.filter(([r,m])=>m!=='GET'&&!r.startsWith('/auth/'))){check((await call(route,{method,body:{},headers:{'X-CSRF-Token':''}})).status===403,'Every local mutation retains CSRF');}
 const stock=(await call('/stock')).data;
 const target=stock.state.spools.find(s=>s.status!=='archived');assert(target);
 const unsafe=await call(`/spools/${target.id}/measurements`,{method:'POST',body:{revision:stock.revision,version:target.version,gross:'900',tare:target.tare.toFixed(2),confirmed:true,reading:{v:1,deviceId:'DLOOP-SCALE-01',seq:1,grossG:900,stable:false,calibrated:false,connectionId:crypto.randomUUID(),transport:'usb',receivedAt:new Date().toISOString()}},headers:{'Idempotency-Key':crypto.randomUUID()}});
 check(unsafe.status===422&&unsafe.data.code==='invalid_scale_reading','Local bootstrap retains stable/calibrated measurement safety');
 const beforeWrite=(await call('/stock')).data;
 const brandName='Local bootstrap fixture '+crypto.randomUUID();
 const added=await call('/brands',{method:'POST',body:{revision:beforeWrite.revision,brand:{name:brandName,active:true}},headers:{'Idempotency-Key':crypto.randomUUID()}});
 check(added.status===200&&added.data.state.brands.some(b=>b.name===brandName),'Protected local session can perform a normal inventory mutation');
 check(added.data.revision===beforeWrite.revision+1,'Local mutations retain revision control');
 const localCookie=cookie;v=await call('/auth/logout',{method:'POST',body:{}});check(v.status===200&&!v.data.data.authenticated,'Local logout invalidates session');
 check((await call('/stock',{headers:{Cookie:localCookie}})).status===401,'Revoked local session cannot be replayed');
 const normal=await fetch('http://127.0.0.1:8110/api/v1/stock',{headers:{Cookie:localCookie}});check(normal.status===401,'Local session not accepted by authenticated mode');
 console.log(`PASS: ${checks} local session/bootstrap and full endpoint access/CSRF checks on a new isolated test database. Existing studio untouched.`);
}finally{for(const c of children)c.kill();}
