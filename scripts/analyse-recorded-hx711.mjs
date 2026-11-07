// Offline only. Run from the repository root; writes only the requested report.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {importLog} from './scale-replay/import-log.mjs';
import {current,provenance,thresholdSets,replay} from './scale-replay/core.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
// RFC4180 fields, including the JSON reset array in an escaped CSV field.
function csv(text){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(field);field='';}
  else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
  else field+=c;
 }
 assert(!quoted);if(field||row.length){row.push(field);rows.push(row);}
 const head=rows.shift();assert.deepEqual(head,['device_id','sample_id','device_ms','raw','label','reset_before']);
 return rows.map(r=>{assert.equal(r.length,head.length);return Object.fromEntries(head.map((k,i)=>[k,r[i]]));});
}
const names=['empty-static','275g-static','loading','unloading'];
const expected=[601,599,300,299];
// Signal-derived descriptive annotations, frozen before candidate replay.
// 1-based capture rows. Unknown shoulders cover onset/settling ambiguity.
const intervals={loading:[[1,168,'static'],[169,173,'unknown'],[174,178,'loading'],[179,190,'unknown'],[191,300,'static']],
 unloading:[[1,78,'static'],[79,79,'unknown'],[80,82,'unloading'],[83,100,'unknown'],[101,299,'static']]};
const sets=thresholdSets(JSON.parse(fs.readFileSync('scripts/fixtures/scale-replay/candidates.json')));
const report={diagnosticOnly:true,current,provenance,method:'Existing candidates, no fit/selection; signal-inferred plateaus are provisional physical labels. All captures exploratory, no held-out validation.',captures:[]};
for(const [ni,name] of names.entries()){
 const path='captures/'+name,bytes=fs.readFileSync(path),meta=JSON.parse(fs.readFileSync(path+'.json'));
 assert.equal(hash(bytes),meta.csvSha256);assert.equal(meta.schemaVersion,1);assert.equal(meta.complete,true);
 assert.equal(meta.source,'recorded');assert.equal(meta.initialState,'unknown');assert(meta.labelEvidence.length);
 const records=csv(bytes.toString()),log=fs.readFileSync(path+'.log','utf8'),imported=importLog(log);
 const begin=log.match(/#DIAG BEGIN[^\n]*\baccepted=(\d+)/)[1];
 const samples=imported.samples.filter(s=>BigInt(s.id)>BigInt(begin));
 assert.equal(samples.length,expected[ni]);assert.equal(records.length,samples.length);assert.equal(meta.samples,samples.length);
 for(let i=0;i<samples.length;i++){
  const r=records[i],s=samples[i];assert.equal(r.device_id,meta.deviceId);assert.equal(r.label,meta.label);
  assert.deepEqual([r.sample_id,Number(r.device_ms),Number(r.raw),JSON.parse(r.reset_before)], [s.id,s.ms,s.raw,s.resetBefore??[]]);
  s.label=intervals[name]?.find(([a,b])=>i+1>=a&&i+1<=b)?.[2]??'static';
 }
 const d={...imported,name,labelEvidence:meta.labelEvidence+'; provisional signal change-point intervals in analysis script',samples};
 const dt=samples.slice(1).map((s,i)=>s.ms-samples[i].ms);
 const ranges=(intervals[name]??[[1,samples.length,'static']]).map(([a,b,label])=>({from:a,through:b,label,firstId:samples[a-1].id,lastId:samples[b-1].id,startSeconds:(samples[a-1].ms-samples[0].ms)/1000,endSeconds:(samples[b-1].ms-samples[0].ms)/1000}));
 const results=sets.map(t=>{
  const out=replay(d,t,{details:true}),rows=out.rows;delete out.rows;
  out.plateaus=ranges.filter(r=>r.label==='static').map(r=>{
   const chunk=rows.slice(r.from-1,r.through),first=chunk.find(x=>x.rawQualified);
   return {...r,firstQualifiedDelayMs:first?first.ms-chunk[0].ms:null,censoredObservationMs:chunk.at(-1).ms-chunk[0].ms};
  });
  out.transitions=ranges.filter(r=>['loading','unloading'].includes(r.label)).map(r=>{
   const i=r.from-1,j=r.through-1,qualified=rows.slice(i,j+1).filter(x=>x.rawQualified);
   const pre=rows[i-1].rawQualified,firstRejected=rows.slice(i,j+1).find(x=>!x.rawQualified);
   const wide=ranges.filter(x=>x.label==='unknown');const lo=wide[0].from-1,hi=wide.at(-1).through-1;
   return {...r,qualifiedBeforeOnset:pre,falseStableSamples:qualified.length,
    falseStableExposureMs:qualified.reduce((n,x)=>{const k=rows.indexOf(x);return n+(samples[k+1]?.ms-x.ms||0);},0),
    revocationLatencyMs:pre&&firstRejected?firstRejected.ms-rows[i].ms:null,
    latencyStatus:pre?'measurable':'not measurable: already unqualified',
    firstLocalRejectDelayMs:rows.slice(i,j+1).find(x=>x.failed.length)?.ms-rows[i].ms,
    broadBoundarySensitivity:{from:lo+1,through:hi+1,falseStableSamples:rows.slice(lo,hi+1).filter(x=>x.rawQualified).length}};
  });
  // Sensitivity only: logs include a real 16-sample pre-capture snapshot,
  // but still do not contain the earlier hold history.
  const withPrefix=replay({...d,samples:imported.samples.map(s=>({...s,label:'unknown'}))},t,{details:true});
  out.prefixSensitivityQualifiedSamples=withPrefix.rows.filter(r=>BigInt(r.id)>BigInt(begin)&&r.rawQualified).length;
  return out;
 });
 report.captures.push({name,integrity:'PASS: FULL log reconstruction, CSV exact equality, metadata hash/count/device/label',csvSha256:hash(bytes),logSha256:hash(log),samples:samples.length,preCaptureSamples:imported.samples.length-samples.length,firstId:samples[0].id,lastId:samples.at(-1).id,durationMs:samples.at(-1).ms-samples[0].ms,dtMin:Math.min(...dt),dtMax:Math.max(...dt),dtMean:dt.reduce((a,b)=>a+b)/dt.length,ranges,results});
}
const output=JSON.stringify(report,null,2)+'\n';
if(process.argv[2])fs.writeFileSync(process.argv[2],output);else process.stdout.write(output);
