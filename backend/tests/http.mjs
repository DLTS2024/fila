// Real HTTP/session tests, require a running LOCAL PHP server; no MySQL needed.
import assert from 'node:assert/strict';
const base = process.env.DLOOP_TEST_URL || 'http://127.0.0.1:8000';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Tests must target loopback.');
const origin = 'http://127.0.0.1:5173';
let cookie='dloop_session=attackerchosenid';
async function call(path, {method='GET', body, csrf, requestOrigin=origin}={}) {
  const response=await fetch(base+'/api/v1'+path, {method, headers:{...(cookie?{Cookie:cookie}:{}), ...(body===undefined?{}:{'Content-Type':'application/json',Origin:requestOrigin}), ...(csrf?{'X-CSRF-Token':csrf}:{})}, ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const setCookie=response.headers.get('set-cookie');
  if(setCookie) cookie=setCookie.split(';')[0];
  assert(response.headers.get('content-type').includes('application/json'));
  assert.equal(response.headers.get('cache-control'),'no-store');
  return {response,json:await response.json(),setCookie};
}
let result=await call('/auth/session');
assert.equal(result.response.status,200);
assert.equal(result.json.data.authenticated,false);
assert.match(result.json.data.csrfToken,/^[a-f0-9]{64}$/);
assert.match(result.setCookie,/HttpOnly/i);
assert.match(result.setCookie,/SameSite=Strict/i);
assert.notEqual(cookie,'dloop_session=attackerchosenid');
const csrf=result.json.data.csrfToken;
for(const path of ['/dashboard','/brands','/tare-profiles','/spools']){
  result=await call(path); assert.equal(result.response.status,401); assert.equal(result.json.code,'unauthenticated');
}
result=await call('/auth/login',{method:'POST',body:{email:'test@example.com',password:'test-password'}});
assert.equal(result.response.status,403);
result=await call('/auth/login',{method:'POST',csrf,requestOrigin:'https://untrusted.invalid',body:{email:'test@example.com',password:'test-password'}});
assert.equal(result.response.status,403);
result=await call('/auth/login',{method:'POST',csrf,body:{email:['invalid'],password:'test-password'}});
assert.equal(result.response.status,422);
result=await call('/auth/login',{method:'POST',csrf,body:{email:'test@example.com',password:'test-password',extra:'invalid'}});
assert.equal(result.response.status,422);
result=await call('/auth/logout',{method:'POST',csrf,body:{}});assert.equal(result.response.status,401);
result=await call('/setup');assert.equal(result.response.status,404);
result=await call('/auth/login');assert.equal(result.response.status,405);assert.equal(result.response.headers.get('allow'),'POST');
const raw=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{Cookie:cookie,Origin:origin,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:'{"broken":'});
assert.equal(raw.status,400);
const array=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{Cookie:cookie,Origin:origin,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:'[]'});
assert.equal(array.status,400);
const wrongType=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{Cookie:cookie,Origin:origin,'X-CSRF-Token':csrf,'Content-Type':'text/plain'},body:'{}'});
assert.equal(wrongType.status,415);
const big=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{Cookie:cookie,Origin:origin,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({email:'x'.repeat(9000)})});
assert.equal(big.status,413);
if(process.env.DLOOP_EXPECT_DATABASE_UNAVAILABLE==='yes') {
  result=await call('/auth/login',{method:'POST',csrf,body:{email:'test@example.invalid',password:'test-password'}});
  assert.equal(result.response.status,503);assert.equal(result.json.code,'service_unavailable');
  assert.match(result.json.requestId,/^[a-f0-9]{24}$/);assert.equal(result.json.error,'Service temporarily unavailable.');
  console.log('PASS: missing database fails safely with generic JSON 503 and request ID.');
}
console.log('PASS: real PHP HTTP anonymous session/cookie, unauthorized endpoints, CSRF, origin, strict JSON/types/size, closed setup and method handling. Database-backed login/read tests are separate.');
