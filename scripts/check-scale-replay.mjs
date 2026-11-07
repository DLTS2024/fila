import fs from 'node:fs';
import assert from 'node:assert/strict';
import {analyse,current,failures,Hold,thresholdSets,validateDataset,replay} from './scale-replay/core.mjs';
import {importLog} from './scale-replay/import-log.mjs';
let checks=0;
const check=(ok,label)=>{assert(ok,label);++checks;};
const throws=(fn,label)=>{assert.throws(fn,label);++checks;};
const candidates=JSON.parse(fs.readFileSync('scripts/fixtures/scale-replay/candidates.json','utf8'));
const sets=thresholdSets(candidates);
const recorded=JSON.parse(fs.readFileSync('scripts/fixtures/scale-replay/recorded-snapshot.json','utf8'));
const m=analyse(recorded.samples.map(s=>s.raw));
check(m.spread===155&&m.mad===30&&m.half===22&&m.central===131,'recorded exact noise metrics');
check(Math.abs(m.slope-5.010294117647059)<1e-12&&failures(m)[0]==='SLOPE','recorded exact clipped slope');
const real=replay(recorded,current,{details:true});
check(real.maxHold===0&&real.static.localFalseRejectionRate===null&&real.movement.rawFalseStableRate===null,'unknown real snapshot cannot establish false rejection or safety');
check(replay(recorded,sets.at(-1)).maxHold===1,'snapshot passes wider candidate local gate but cannot complete hold');
check(real.rows.at(-1).reset==='SLOPE'&&real.rows.at(-1).pending===0,'slope reset occurs before pending block commits');
let h=new Hold();const quiet=analyse(Array(16).fill(-29530));
for(let i=0;i<64;i++){h.observe(quiet,i>=15,current);check(h.centres.length===Math.floor((i+1)/16)&&h.pending===(i+1)%16,'quiet overlap advances observation '+i);}
check(h.settled,'four-window qualification after 64 samples');
h=new Hold();for(let i=0;i<12;i++)h.observe(quiet,true,current);
h.observe({...quiet,slope:2.61},true,current);
check(h.pending===0&&h.centres.length===0,'failure after 12 passing observations resets pending');
for(let i=0;i<15;i++)h.observe(quiet,true,current);
check(h.centres.length===0&&h.pending===15,'15 passing observations after reset still no centre');
h.observe(quiet,true,current);check(h.centres.length===1,'sixteenth passing observation commits first centre');
// Reported diagnostics are gate-level regressions, not fabricated raw captures.
for(const [key,values,reason] of [
 ['slope',[3.73,4.31,2.61],'SLOPE'],['half',[38.33,37.50],'HALF_SHIFT']]){
 for(const value of values){
  const stats={...quiet,[key]:value};
  check(failures(stats,current)[0]===reason,`reported ${key} ${value} exceeds current limit`);
  check(!failures(stats,sets.find(s=>s.name==='slope-4.5-half-40')).length,
   `reported ${key} ${value} passes isolated offline candidate gate`);
  for(let passing=1;passing<=12;passing++){
   const hold=new Hold();
   for(let i=0;i<passing;i++)hold.observe(quiet,true,current);
   check(hold.observe(stats,true,current)===reason&&hold.pending===0&&hold.centres.length===0,
    `${reason} discards ${passing} qualifying observations`);
  }
 }
}
check(!failures({...quiet,slope:2,half:35}).length,'current gates accept exact equality');
check(failures({...quiet,slope:4.31,half:38.33})[0]==='HALF_SHIFT',
 'half-shift takes priority and may mask a simultaneous slope failure');
const build=(name,n,fn)=>({schemaVersion:1,name,source:'synthetic',initialState:'fresh',
 labelEvidence:'Deterministic generator ground truth; not captured physical movement.',
 samples:Array.from({length:n},(_,i)=>({id:String(i+1),ms:100+i*100,...fn(i)}))});
let seed=1;
const noisyStatic=build('stationary-irregular-noise',600,()=>{
 seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 return {raw:-29530+((seed>>>16)%151)-75,label:'static'};
});
const periodicStatic=build('balanced-periodic-static-fixture',240,i=>({raw:-29530+[-75,75,-20,20,-35,35,-5,5][i%8],label:'static'}));
const loadUnload=build('load-and-unload-with-established-plateaus',480,i=>{
 const raw=i<120?-29530:i<140?-29530-Math.round((i-119)*30030/20):i<280?-59560:i<300?-59560+Math.round((i-279)*30030/20):-29530;
 return {raw,label:i<120||i>=140&&i<280||i>=300?'static':i<140?'loading':'unloading'};
});
const drift=build('slow-controlled-ramp-after-qualification',320,i=>({raw:-29530+Math.max(0,i-119),label:i<120?'static':'drift'}));
const oscillation=build('small-periodic-changing-load',320,i=>({raw:-29530+Math.round(25*Math.sin(2*Math.PI*i/16)),label:'disturbance'}));
const glitches=build('glitch-reset-then-recovery',260,i=>({raw:-29530,label:i>=120&&i<184?'fault':'static',
 ...(i===120?{resetBefore:['RAW_RANGE']}:{} )}));
const baseline=replay(noisyStatic);
check(baseline.resetCounts.SLOPE===118&&baseline.resetCounts.HALF_SHIFT===129&&baseline.maxHold===1,'matches prior actual-C++ 600-sample parity fixture');
check(baseline.static.windows===585&&baseline.static.localGateRejects===247,'noise local false rejection separately counted');
check(replay(periodicStatic).maxHold===4,'periodic test fixture qualifies but is not enough noise evidence');
const move=replay(loadUnload,current,{details:true});
check(move.movement.labelledSamples===40&&move.movement.rawFalseStableSamples===0,'large loading and unloading rejected after established qualification');
check(move.static.qualificationSegments.length===3&&move.static.qualificationSegments.every(s=>s.firstQualifiedMs!==null),'static plateaus recover and latency measured');
const driftResult=replay(drift);
check(driftResult.movement.rawFalseStableSamples>0,'reports baseline false-stable exposure at onset of sub-noise drift rather than hiding it');
check(replay(glitches,current,{details:true}).rows.slice(120,183).every(r=>!r.rawQualified),'explicit sensor-range reset clears hold and requires recovery');
const currentOscillation=replay(oscillation,current),candidateOscillation=replay(oscillation,sets.find(s=>s.name==='slope-4.5-half-40'));
check(candidateOscillation.movement.rawFalseStableSamples>currentOscillation.movement.rawFalseStableSamples,
 'wider candidate exposes false-stable risk on bounded changing signal');
check(candidateOscillation.movement.maxFalseStableRun>0,'consecutive false-stable runs are reported');
const invalid=structuredClone(recorded);invalid.samples[5].id='99';throws(()=>validateDataset(invalid),'missing accepted IDs refused');
const badTime=structuredClone(recorded);badTime.samples[5].ms=badTime.samples[4].ms-1;throws(()=>validateDataset(badTime),'backwards timestamp refused');
const gap=build('gap',100,i=>({raw:-29530,label:'static'}));gap.samples.slice(65).forEach(s=>s.ms+=1000);
throws(()=>replay(gap),'gap without observed reset cannot silently be fixed by replay');
gap.samples[65].resetBefore=['STALE'];check(replay(gap,{...current}).resetCounts.STALE===1,'explicit stale reset preserved for every candidate');
const fakeFilter=structuredClone(recorded);fakeFilter.samples[1].resetBefore=['SLOPE'];throws(()=>validateDataset(fakeFilter),'current filter resets cannot contaminate candidate state');
throws(()=>thresholdSets([{name:'unsafe-hidden-change',band:999}]),'only requested diagnostic slope/half variations allowed');
const wrap=build('millis-wrap',100,i=>({raw:-29530,label:'static'}));wrap.samples.forEach((s,i)=>s.ms=(0xffffff00+i*100)>>>0);
check(replay(wrap).maxHold===4,'millis rollover accepted without clock-order false alarm');
const onlyUnknown=structuredClone(periodicStatic);onlyUnknown.samples.forEach(s=>s.label='unknown');
check(replay(onlyUnknown).static.localFalseRejectionRate===null,'unlabelled data never treated as known stationary');

// Complete synthetic wire capture: importer deduplicates paired snapshots and
// validates exact reset evidence; it never creates labels from stability output.
const raw=recorded.samples.map(s=>s.raw),times=recorded.samples.map(s=>s.ms);
const arrays=`accepted=16 count=16 firstId=1 intervals=15 dtMin=99 dtMax=101 dtAvg=100.000 raw=${JSON.stringify(raw)} times=${JSON.stringify(times)}`;
const capture=`#DIAG BEGIN mode=FULL startResetId=350\n#DIAG RESET ${arrays} resetId=351 reason=SLOPE value=5.010294 limit=2.000000\n#DIAG SNAPSHOT ${arrays}\n#DIAG END reason=USER accepted=16 resetObserved=1 resetQueued=1 recordsLost=0 protocolLost=0 lostReset=false\n`;
const imported=importLog(capture);
check(imported.samples.length===16&&imported.samples.every(s=>s.label==='unknown'),'wire reconstruction deduplicates without inventing labels');
check(replay(imported).resetCounts.SLOPE===1,'current wire gate reset reproducible');
const labelled=importLog(capture,{labels:[{fromId:'1',throughId:'16',label:'static',evidence:'test operator annotation, synthetic wire fixture'}]});
check(labelled.samples.every(s=>s.label==='static'),'only independent explicit intervals become static');
throws(()=>importLog(capture.replace('recordsLost=0','recordsLost=1')),'overflowed capture refused');
throws(()=>importLog(capture.replace('accepted=16 resetObserved','accepted=17 resetObserved')),'uncaptured tail refused');
throws(()=>importLog(capture.replace('value=5.010294','value=4.31')),'incorrect claimed failed value refused');
throws(()=>importLog(capture.replace('times=[583623','times=[583624')),'inconsistent duplicate/timing evidence refused');
throws(()=>importLog(capture.replace('mode=FULL','mode=SUMMARY')),'summary-only logs lack replay evidence');
const report={diagnosticOnly:true,realLabelledLoadingDataAvailable:false,
 notes:['Synthetic motion fixtures are not physical acceptance tests.','Do not select limits by reset count alone.'],
 results:[recorded,noisyStatic,periodicStatic,loadUnload,drift,oscillation,glitches].flatMap(d=>sets.map(t=>replay(d,t)))};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(`PASS: ${checks} offline replay, exact metrics, hold progression, synthetic static/motion/fault risk, log integrity and candidate isolation checks. No real labelled loading/unloading trace supplied; no safe production limits selected.`);
console.log(JSON.stringify({currentStaticLocalRejectRate:baseline.static.localFalseRejectionRate,
 currentOscillationFalseStable:currentOscillation.movement.rawFalseStableSamples,
 candidateOscillationFalseStable:candidateOscillation.movement.rawFalseStableSamples,
 realSnapshotCurrentSlope:m.slope},null,2));
