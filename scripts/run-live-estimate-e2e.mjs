// Only explicitly opted-in disposable fixtures; never starts/restarts studio services.
import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
assert.equal(process.env.DLOOP_DISPOSABLE_TEST,'yes','Explicit disposable-test opt-in required.');
assert(process.env.DLOOP_CONFIG_FILE,'Supply a fresh disposable fixture configuration.');
const php=process.env.DLOOP_PHP||'C:/xampp/php/php.exe';
function check(args){const r=spawnSync(php,args,{env:process.env,stdio:'inherit',windowsHide:true});assert.equal(r.status,0,'Disposable fixture setup/verification failed.');}
check(['backend/tests/live-estimate-e2e.php','--prepare']); // Guard checks target DB before any write.
const server=spawn(php,['-S','127.0.0.1:8120','-t','backend/public','backend/router.php'],{env:process.env,stdio:'ignore',windowsHide:true});
try{
 let ready=false;
 for(let n=0;n<50;n++){await new Promise(r=>setTimeout(r,50));assert.equal(server.exitCode,null,'Dedicated test port unavailable.');try{if((await fetch('http://127.0.0.1:8120/api/v1/auth/session')).status===200){ready=true;break}}catch{}}
 assert(ready,'Dedicated test server did not become ready.');
 const child=spawn(process.execPath,['scripts/check-live-estimate-e2e.mjs'],{env:{...process.env,DLOOP_TEST_URL:'http://127.0.0.1:8120'},stdio:'inherit',windowsHide:true});
 assert.equal(await new Promise(r=>child.on('exit',r)),0,'End-to-end frontend verification failed.');
 check(['backend/tests/live-estimate-e2e.php','--verify']);
}finally{server.kill();}
