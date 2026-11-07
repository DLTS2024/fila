// Offline only: shared diagnostic importer and unchanged firmware-formula mirror.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {importLog} from './scale-replay/import-log.mjs';
import {analyse,failures,Hold,current,provenance,replay} from './scale-replay/core.mjs';
const custom=process.argv.slice(2);
let output=custom.length?'docs/usb-aba-20261105/strict':'docs/new-usb-port-strict-analysis';
const outputIndex=custom.indexOf('--output-dir');
if(outputIndex>=0){assert(custom[outputIndex+1],'--output-dir needs a path');output=custom[outputIndex+1];custom.splice(outputIndex,2);}
fs.mkdirSync(output,{recursive:true});
const quant=(a,p)=>{const s=[...a].sort((a,b)=>a-b),z=(s.length-1)*p,k=Math.floor(z);return s[k]+(s[Math.ceil(z)]-s[k])*(z-k);};
const dist=a=>a.length?{n:a.length,min:Math.min(...a),median:quant(a,.5),p90:quant(a,.9),p95:quant(a,.95),p99:quant(a,.99),max:Math.max(...a)}:{n:0};
const fields=l=>Object.fromEntries([...l.matchAll(/(\w+)=(\[[^\]]*\]|\S+)/g)].map(m=>[m[1],m[2]]));
const results=[];
for(const [name,path] of custom.length?custom.map(p=>[p.split('/').at(-1).replace('.csv',''),p]):[['previous','captures/empty-continuous-5min-d5d86874a80e454bb4feb1b8408ae372.csv'],['new','captures/empty-new-usb-port-5min-20261105-151307.csv']]){
 const log=fs.readFileSync(path+'.log','utf8'),meta=JSON.parse(fs.readFileSync(path+'.json')),bytes=fs.readFileSync(path);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),meta.csvSha256);
 const all=importLog(log),lines=log.split(/\r?\n/),begin=fields(lines.find(l=>l.startsWith('#DIAG BEGIN '))),end=fields(lines.find(l=>l.startsWith('#DIAG END ')));
 assert(Number(begin.hold)>=0&&Number(begin.hold)<=4);
 const samples=all.samples.filter(s=>BigInt(s.id)>BigInt(begin.accepted));assert.equal(samples.length,meta.samples);
 const csv=bytes.toString().trim().split(/\r?\n/).slice(1);
 samples.forEach((s,i)=>{const r=csv[i].split(',');assert.deepEqual([r[1],+r[2],+r[3]],[s.id,s.ms,s.raw]);s.label='static';});
 let window=all.samples.filter(s=>BigInt(s.id)<=BigInt(begin.accepted)).slice(-16);assert.equal(window.length,16);
 const h=new Hold(),rows=[],runs=[];h.pending=Number(begin.pending);
 // BEGIN exposes count/pending but not old centre values. Preserve the known
 // count with explicitly unknown centres until the first observed reset. NaN
 // never fabricates a centre-span decision; reset parity below remains required.
 h.centres=Array(Number(begin.hold)).fill(NaN);
 let run=null;const masks={},resetCounts={},holdHistogram={},pendingHistogram={},centreSpans=[];
 for(const s of samples){
  for(const reset of s.resetBefore??[]){h.reset();window=[];resetCounts[reset]=(resetCounts[reset]??0)+1;}
  window.push(s);if(window.length>16)window.shift();assert.equal(window.length,16);
  const stats=analyse(window.map(v=>v.raw)),failed=failures(stats),before={hold:h.centres.length,pending:h.pending};
  const spanBefore=Math.max(stats.centre,...h.centres)-Math.min(stats.centre,...h.centres);
  const reset=h.observe(stats,true,current);if(reset)resetCounts[reset]=(resetCounts[reset]??0)+1;
  const spanAfter=reset?null:Math.max(stats.centre,...h.centres)-Math.min(stats.centre,...h.centres);
  if(!failed.length&&Number.isFinite(spanAfter??spanBefore))centreSpans.push(spanAfter??spanBefore);
  masks[failed.join('+')||'PASS']=(masks[failed.join('+')||'PASS']??0)+1;
  holdHistogram[h.centres.length]=(holdHistogram[h.centres.length]??0)+1;pendingHistogram[h.pending]=(pendingHistogram[h.pending]??0)+1;
  const row={id:s.id,ms:s.ms,stats,failed,reset,before,hold:h.centres.length,pending:h.pending,spanBefore,spanAfter,centres:[...h.centres]};rows.push(row);
  if(!reset){if(!run)run={firstId:s.id,firstMs:s.ms,observations:0};run.observations++;run.lastId=s.id;run.lastMs=s.ms;}
  else if(run){runs.push({...run,followingReset:{id:s.id,ms:s.ms,reason:reset,discardedHold:before.hold,discardedPending:before.pending+1,stats}});run=null;}
 }
 if(run)runs.push({...run,rightCensored:true});
 const logged=lines.filter(l=>l.startsWith('#DIAG RESET ')).map(fields);
 assert.equal(logged.length,Number(end.resetObserved));assert.equal(end.recordsLost,'0');assert.equal(end.protocolLost,'0');assert.equal(end.lostReset,'false');
 for(const e of logged){const row=rows.find(r=>r.id===e.accepted);assert(row);assert.equal(row.reset,e.reason);assert.equal(row.before.hold,+e.discardedHold);assert.equal(row.before.pending+1,+e.discardedPending);}
 assert.equal(rows.filter(r=>r.reset).length,logged.length);
 const gates=[['spread','FULL_RANGE'],['central','CENTRAL_RANGE'],['mad','MAD'],['half','HALF_SHIFT'],['slope','SLOPE'],['latest','LATEST']].map(([key,gate])=>({gate,limit:current[key],...dist(rows.map(r=>r.stats[key])),exceedances:rows.filter(r=>r.failed.includes(gate)).length,priorityResets:resetCounts[gate]??0}));
 const cold=replay({...all,samples},{...current});
 const result={name,path,sha256:meta.csvSha256,provenance,thresholds:current,samples:samples.length,duration_s:(samples.at(-1).ms-samples[0].ms)/1000,
  boundaryMethod:`BEGIN hold=${begin.hold}/pending=${begin.pending}, full raw ring reconstructed from 16 pre-BEGIN samples; inherited centre values unknown until first reset and omitted from span statistics; logged reset/discarded progress parity required`,gates,resetCounts,resetsPerMinute:logged.length/((samples.at(-1).ms-samples[0].ms)/60000),
  allGateMasks:masks,holdHistogram,pendingHistogram,centreSpanOnLocallyPassing:dist(centreSpans),passingRuns:dist(runs.map(r=>r.observations)),longestRuns:[...runs].sort((a,b)=>b.observations-a.observations).slice(0,12),
  holdTransitions:rows.filter(r=>r.hold!==r.before.hold),maxHold:Math.max(...rows.map(r=>r.hold)),
  coldStartCsvOnly:{windows:cold.fullWindows,resets:cold.resetCounts,maxHold:cold.maxHold,failures:cold.allGateFailures}};
 fs.writeFileSync(`${output}/${name}-observations.json`,JSON.stringify(rows,null,2)+'\n');results.push(result);
}
fs.writeFileSync(`${output}/comparison.json`,JSON.stringify(results,null,2)+'\n');
for(const r of results)console.log(JSON.stringify({...r,holdTransitions:r.holdTransitions.filter(t=>t.hold===2||t.before.hold===2)},null,2));
