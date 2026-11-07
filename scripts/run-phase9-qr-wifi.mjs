// Reuse existing disposable schema and labels; never prepare/migrate/generate fixtures.
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
assert.equal(process.env.DLOOP_DISPOSABLE_TEST,'yes','Explicit disposable opt-in required');
assert(process.env.DLOOP_CONFIG_FILE,'Existing disposable config required');
const php=process.env.DLOOP_PHP||'C:/xampp/php/php.exe';
function inspect(){const r=spawnSync(php,['backend/tests/phase9-fixture-inspect.php'],{env:process.env,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
const before=inspect();assert.equal(before.migrationCount,8);
await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(8122,'127.0.0.1',()=>probe.close(resolve));});
const server=spawn(php,['-S','127.0.0.1:8122','-t','backend/public','backend/router.php'],{env:process.env,stdio:'ignore',windowsHide:true});
try{
 let ready=false;
 for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,50));assert.equal(server.exitCode,null,'Temporary test server exited');try{const r=await fetch('http://127.0.0.1:8122/api/v1/auth/session');if(r.status===200){ready=true;break;}}catch{}}
 assert(ready,'Temporary server did not become ready');
 const child=spawn(process.execPath,['scripts/check-qr-wifi-inventory-e2e.mjs'],{env:{...process.env,DLOOP_TEST_URL:'http://127.0.0.1:8122',DLOOP_PHASE9_DB:before.database},stdio:'inherit',windowsHide:true});
 assert.equal(await new Promise(r=>child.on('exit',r)),0,'Combined Phase 9 verification failed');
 const after=inspect();for(const key of ['database','migrationCount','labelCount','measurementCount'])assert.equal(after[key],before[key],key+' changed');
 assert.equal(after.existingUnusedLabels,before.existingUnusedLabels-1,'Only one existing disposable QR should be assigned');
 console.log('PASS: fixture schema/label counts unchanged; no calibrated measurements created.');
}finally{server.kill();}
