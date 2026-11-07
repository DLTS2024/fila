// Run only against the disposable database initialized by database.php.
import assert from 'node:assert/strict';
assert.equal(process.env.DLOOP_DISPOSABLE_TEST,'yes','Explicit disposable-test opt-in required.');
const base=process.env.DLOOP_TEST_URL||'http://127.0.0.1:8000';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const email=process.env.DLOOP_TEST_EMAIL||'phase3-test@example.invalid';
assert(email.endsWith('@example.invalid'),'Only disposable fixture identities are allowed.');
let cookie, csrf;
async function call(path, body, token=csrf, origin='http://127.0.0.1:5173') {
  const r=await fetch(base+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json',Origin:origin,'X-CSRF-Token':token||''})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
  const json=await r.json();return {r,json};
}
let v=await call('/auth/session');csrf=v.json.data.csrfToken;
const anonymousCookie=cookie;
v=await call('/auth/login',{email,password:'wrong-password'});assert.equal(v.r.status,401);
v=await call('/auth/login',{email,password:'Fixture-only-password-123!'});assert.equal(v.r.status,200);assert(v.json.data.authenticated);assert.notEqual(cookie,anonymousCookie);
const oldCsrf=csrf;csrf=v.json.data.csrfToken;assert.notEqual(csrf,oldCsrf);
v=await call('/spool-selection');assert.equal(v.r.status,403);assert.equal(v.json.code,'secure_sync_required');
v=await call('/spool-selection',{spoolId:'unknown'},'');assert.equal(v.r.status,403);
v=await call('/spool-selection',{spoolId:'unknown'});assert.equal(v.r.status,403);assert.equal(v.json.code,'secure_sync_required');
v=await call('/auth/session');assert.equal(v.json.data.user.role,'admin');assert(!('password_hash' in v.json.data.user));
v=await call('/dashboard');assert.equal(v.r.status,200);assert.equal(v.json.data.totalSpools,1);assert.equal(Number(v.json.data.remainingG),680);
v=await call('/brands');assert.equal(v.r.status,200);assert.equal(v.json.data[0].name,'Fixture Brand');
v=await call('/tare-profiles');assert.equal(v.r.status,200);assert.equal(Number(v.json.data[0].empty_mass_g),220);
v=await call('/spools');assert.equal(v.r.status,200);assert.equal(v.json.meta.total,1);assert.equal(Number(v.json.data[0].effective_tare_g),220);
v=await call('/spools?q='+encodeURIComponent("' OR 1=1 --"));assert.equal(v.r.status,200);assert.equal(v.json.meta.total,0);
for(const path of ['/spools?limit=0','/spools?status=invalid','/spools?brand_id[]=1','/brands?unexpected=1']){v=await call(path);assert.equal(v.r.status,422);}
v=await call('/auth/logout',{},oldCsrf);assert.equal(v.r.status,403);
v=await call('/auth/logout',{},'');assert.equal(v.r.status,403);
v=await call('/auth/logout',{},csrf,'https://untrusted.invalid');assert.equal(v.r.status,403);
v=await call('/auth/session');assert.equal(v.json.data.authenticated,true);
const loggedCookie=cookie;
v=await call('/auth/logout',{});assert.equal(v.r.status,200);assert.notEqual(cookie,loggedCookie);csrf=v.json.data.csrfToken;
v=await call('/spools');assert.equal(v.r.status,401);
const replay=await fetch(base+'/api/v1/spools',{headers:{Cookie:loggedCookie}});assert.equal(replay.status,401);
let throttled=false;
for(let n=0;n<12;n++) {v=await call('/auth/login',{email,password:'wrong-password'});if(v.r.status===429){throttled=true;assert(v.r.headers.get('retry-after'));break;}assert.equal(v.r.status,401);}
assert(throttled);
console.log('PASS: database-backed login/logout, session and CSRF rotation, authenticated reads, pagination/validation, injection literal, unauthorized access and login throttle.');
