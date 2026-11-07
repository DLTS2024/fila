import assert from 'node:assert/strict';
import './test-typescript-loader.mjs';
const {localRequestAllowed}=await import('../lib/local-loopback.ts');
const origins=['http://localhost:5173','http://127.0.0.1:5173'];
let checks=0;const ok=(v)=>{assert(v);checks++;};
for(const address of ['127.0.0.1','::1','::ffff:127.0.0.1'])ok(localRequestAllowed(address,{host:'localhost:5173'},origins));
for(const address of ['192.168.1.4','203.0.113.1',undefined])ok(!localRequestAllowed(address,{host:'localhost:5173'},origins));
for(const patch of [{host:'evil.invalid'},{host:'localhost.evil.invalid'},{host:'localhost:65536'},{origin:'null'},{origin:'http://localhost:9999'},{referer:'https://evil.invalid'},{'sec-fetch-site':'same-site'},{'sec-fetch-site':'cross-site'},...['forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-real-ip'].map(h=>({[h]:'127.0.0.1'}))])ok(!localRequestAllowed('127.0.0.1',{host:'localhost:5173',...patch},origins));
console.log(`PASS: ${checks} frontend loopback, rebinding, origin and forwarded-header policy checks.`);
