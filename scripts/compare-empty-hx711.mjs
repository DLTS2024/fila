// Diagnostic-only, no device/network/production writes. Run from repo root.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {importLog} from './scale-replay/import-log.mjs';
import {analyse,failures,replay,current,provenance} from './scale-replay/core.mjs';
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const sd=a=>Math.sqrt(mean(a.map(v=>(v-mean(a))**2)));
const quant=(a,p)=>{const b=[...a].sort((x,y)=>x-y),i=(b.length-1)*p;return b[Math.floor(i)]+(b[Math.ceil(i)]-b[Math.floor(i)])*(i%1);};
const summary=a=>({min:Math.min(...a),p01:quant(a,.01),p05:quant(a,.05),p25:quant(a,.25),median:quant(a,.5),p75:quant(a,.75),p95:quant(a,.95),p99:quant(a,.99),max:Math.max(...a),mean:mean(a),sd:sd(a)});
const corr=(a,b)=>mean(a.map((x,i)=>(x-mean(a))*(b[i]-mean(b))))/(sd(a)*sd(b));
function detrend(a,t=a.map((_,i)=>i)){const slope=mean(a.map((v,i)=>(v-mean(a))*(t[i]-mean(t))))/mean(t.map(v=>(v-mean(t))**2));return {slope,residual:a.map((v,i)=>v-mean(a)-slope*(t[i]-mean(t)))};}
const acf=(a,max=100)=>Array.from({length:max},(_,i)=>{const k=i+1,m=mean(a);return {lag:k,r:a.slice(k).reduce((s,v,j)=>s+(v-m)*(a[j]-m),0)/a.reduce((s,v)=>s+(v-m)**2,0)};});
function spectrum(a,fsHz){
 const x=detrend(a).residual.map((v,i)=>v*(.5-.5*Math.cos(2*Math.PI*i/(a.length-1))));
 const bins=Array.from({length:Math.floor(a.length/2)},(_,j)=>{const k=j+1;let re=0,im=0;for(let i=0;i<x.length;i++){re+=x[i]*Math.cos(2*Math.PI*k*i/x.length);im-=x[i]*Math.sin(2*Math.PI*k*i/x.length);}return {hz:k*fsHz/x.length,power:re*re+im*im};});
 const total=bins.reduce((s,b)=>s+b.power,0);
 return {resolutionHz:fsHz/a.length,topBins:[...bins].sort((a,b)=>b.power-a.power).slice(0,8).map(b=>({...b,fraction:b.power/total})),bands:[[0,.2],[.2,.5],[.5,1],[1,2],[2,fsHz/2]].map(([lo,hi],i)=>({lo,hi,fraction:bins.filter(b=>b.hz>=lo&&(i===4?b.hz<=hi:b.hz<hi)).reduce((s,b)=>s+b.power,0)/total}))};
}
// Deterministic numerical checks, independent of recorded data.
assert(Math.abs(detrend([1,3,5,7]).slope-2)<1e-12);
assert(sd(detrend([1,3,5,7]).residual)<1e-12);
assert.equal(quant([0,10],.5),5);
const sine=Array.from({length:600},(_,i)=>Math.sin(2*Math.PI*i/20));
assert(Math.abs(spectrum(sine,10).topBins[0].hz-.5)<1e-12);
assert(acf(sine)[19].r>.95);
const output={diagnosticOnly:true,current,provenance,numericalChecks:5,captures:[]};
const names=process.argv.slice(3);
for(const name of names.length?names:['empty-static','empty-static-02']){
 const path='captures/'+name,bytes=fs.readFileSync(path),meta=JSON.parse(fs.readFileSync(path+'.json'));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),meta.csvSha256);
 assert.equal(meta.complete,true);assert.equal(meta.label,'EMPTY_STATIC');assert.equal(meta.initialState,'unknown');assert.equal(meta.source,'recorded');assert.equal(meta.schemaVersion,1);assert(meta.labelEvidence.length);
 const parsed=spawnSync('python',['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1],newline="")))))',path],{encoding:'utf8'});assert.equal(parsed.status,0,parsed.stderr);
 const csv=JSON.parse(parsed.stdout),log=fs.readFileSync(path+'.log','utf8'),d=importLog(log);
 const begin=BigInt(log.match(/#DIAG BEGIN[^\n]*\baccepted=(\d+)/)[1]);
 d.samples=d.samples.filter(s=>BigInt(s.id)>begin);assert.equal(csv.length,meta.samples);assert.equal(csv.length,d.samples.length);
 d.name=name;d.samples.forEach((s,i)=>{const r=csv[i];assert.equal(r.device_id,meta.deviceId);assert.equal(r.label,meta.label);assert.deepEqual([r.sample_id,+r.device_ms,+r.raw,JSON.parse(r.reset_before)],[s.id,s.ms,s.raw,s.resetBefore??[]]);s.label='static';});
 const raw=d.samples.map(s=>s.raw),t=d.samples.map(s=>(s.ms-d.samples[0].ms)/1000),dt=t.slice(1).map((v,i)=>(v-t[i])*1000),fsHz=(raw.length-1)/t.at(-1),trend=detrend(raw,t);
 const windows=raw.slice(15).map((_,i)=>{const w=raw.slice(i,i+16),m=analyse(w);return {row:i+16,...m,failed:failures(m)};});
 const centre=windows.map(w=>w.centre),diff=raw.slice(1).map((v,i)=>v-raw[i]);
 const med=quant(raw,.5),mad=quant(raw.map(v=>Math.abs(v-med)),.5),outlier=raw.map((v,i)=>Math.abs(v-med)>3*1.4826*mad?i+1:null).filter(Boolean);
 const blocks=Array.from({length:Math.ceil(raw.length/50)},(_,i)=>{const a=raw.slice(i*50,(i+1)*50);return {firstRow:i*50+1,n:a.length,mean:mean(a),sd:sd(a),slopePerSecond:detrend(a,t.slice(i*50,(i+1)*50)).slope};});
 const failRatesByCentreMovement=[0,.25,.5,.75].map(p=>{const activity=windows.map(w=>w.half),lo=quant(activity,p),hi=p===.75?Infinity:quant(activity,p+.25),group=windows.filter(w=>w.half>=lo&&w.half<hi);return {halfLo:lo,halfHi:Number.isFinite(hi)?hi:null,n:group.length,rejected:group.filter(w=>w.failed.length).length};});
 const replayed=replay(d,current,{details:true}), qualified=replayed.rows.filter(r=>r.rawQualified).length;delete replayed.rows;
 const gapRows=dt.flatMap((v,i)=>v>150?[i+2]:[]);
 const excluded=[...gapRows,...outlier];const clean=windows.filter(w=>!excluded.some(r=>r<=w.row&&r>w.row-16));
 let longestPass=0,longestFail=0,pass=0,fail=0;
 windows.forEach(w=>{if(w.failed.length){fail++;pass=0;}else{pass++;fail=0;}longestPass=Math.max(pass,longestPass);longestFail=Math.max(fail,longestFail);});
 const localResidual=raw.map((v,i)=>v-mean(raw.slice(Math.max(0,i-25),Math.min(raw.length,i+26))));
 const attribution={withoutGlobalOutliersOrGapWindows:{windows:clean.length,rejected:clean.filter(w=>w.failed.length).length},
  longestPassingWindows:longestPass,longestRejectingWindows:longestFail,
  gateCombinations:{trendOnly:windows.filter(w=>w.failed.length&&w.failed.every(f=>['SLOPE','HALF_SHIFT'].includes(f))).length,anyNonTrend:windows.filter(w=>w.failed.some(f=>!['SLOPE','HALF_SHIFT'].includes(f))).length},
  linearDetrendLocalRejects:raw.slice(15).filter((_,i)=>failures(analyse(trend.residual.slice(i,i+16))).length).length,
  fiveSecondBaselineRemoved:{sd:sd(localResidual),acf:acf(localResidual,30)},
  differenceAcf:acf(diff,20)};
 output.captures.push({name,integrity:'PASS full log importer, CSV exact comparison and metadata hash/count/device/label',csvSha256:meta.csvSha256,logSha256:crypto.createHash('sha256').update(log).digest('hex'),n:raw.length,durationSeconds:t.at(-1),sampleHz:fsHz,dt:summary(dt),gaps:dt.flatMap((v,i)=>v>150?[{row:i+2,dtMs:v,rawDelta:diff[i]}]:[]),raw:summary(raw),rawMad:mad,globalRobustOutlierRows:outlier,difference:summary(diff),linearSlopeCountsPerSecond:trend.slope,detrendedSd:sd(trend.residual),acfRaw:acf(raw),acfDetrended:acf(trend.residual),spectrum:spectrum(raw,fsHz),halfSpectra:[spectrum(raw.slice(0,300),fsHz),spectrum(raw.slice(300),fsHz)],rollingCentre:summary(centre),rollingHalf:summary(windows.map(w=>w.half)),rollingSlope:summary(windows.map(w=>w.slope)),halfSlopeCorrelation:corr(windows.map(w=>w.half),windows.map(w=>w.slope)),blocks,failRatesByCentreMovement,replay:replayed,qualifiedSamples:qualified,windows:windows.map(w=>({row:w.row,centre:w.centre,half:w.half,slope:w.slope,spread:w.spread,failed:w.failed})),outlierIntersectingWindows:windows.filter(w=>outlier.some(r=>r<=w.row&&r>w.row-16)).length});
 output.captures.at(-1).attribution=attribution;
}
fs.writeFileSync(process.argv[2]??'docs/HX711-EMPTY-COMPARISON-RESULTS.json',JSON.stringify(output,null,2)+'\n');
console.log(`PASS: 5 numerical checks and ${output.captures.length} capture integrity validations; offline report written.`);
