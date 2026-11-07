import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hx711-capture-'));
try {
 const lines=['#DIAG BEGIN mode=FULL accepted=0 startResetId=0'];
 for(const last of [16,32,48,64])lines.push(`#DIAG WINDOW accepted=${last} count=16 firstId=${last-15} intervals=15 dtMin=100 dtMax=100 dtAvg=100.000 raw=${JSON.stringify(Array(16).fill(-29530))} times=${JSON.stringify(Array.from({length:16},(_,i)=>(last-15+i)*100))}`);
 lines.push('#DIAG END reason=USER accepted=64 resetObserved=0 resetQueued=0 recordsLost=0 protocolLost=0 lostReset=false');
 const complete=lines.join('\n')+'\n';
 const run=text=>{
  const log=path.join(directory,'capture.log');fs.writeFileSync(log,text);
  return spawnSync(process.execPath,['scripts/scale-replay/import-capture.mjs',log],{encoding:'utf8'});
 };
 const ok=run(complete);assert.equal(ok.status,0,ok.stderr);
 const data=JSON.parse(ok.stdout);assert.equal(data.samples.length,64);
 assert.equal(data.samples[0].id,'1');assert.equal(data.samples.at(-1).ms,6400);
 for(const bad of [
  complete.replace('recordsLost=0','recordsLost=1'),
  complete.replace('protocolLost=0','protocolLost=1'),
  complete.replace('reason=USER','reason=OUTPUT_OVERFLOW'),
  complete.replace('mode=FULL','mode=SUMMARY'),
  lines.slice(0,-1).join('\n'),
  lines.filter(l=>!l.includes('accepted=16 count')).join('\n'),
  lines.filter(l=>!l.includes('accepted=32 count')).join('\n'),
  complete.replace('END reason=USER accepted=64','END reason=USER accepted=65')
 ])assert.notEqual(run(bad).status,0,'incomplete capture must fail');
 console.log('PASS: complete 64-sample capture reconstructed; 8 loss, boundary, gap and mode failures rejected. Synthetic wire evidence only.');
} finally {fs.rmSync(directory,{recursive:true,force:true});}
