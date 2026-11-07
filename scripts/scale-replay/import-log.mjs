import assert from 'node:assert/strict';
import {analyse,failures,current,validateDataset} from './core.mjs';
const external=new Set(['STALE','RAW_RANGE','CANCEL','ZERO_ACCEPTED','CAL_ACCEPTED','CALIBRATION_ACCEPTED']);
const key={FULL_RANGE:'spread',CENTRAL_RANGE:'central',MAD:'mad',HALF_SHIFT:'half',SLOPE:'slope',LATEST:'latest'};
const uint=(value,label)=>{assert(/^\d+$/.test(value??''),label+' missing/invalid');return BigInt(value);};
export function importLog(text,annotations={}){
 assert(text.length<=20_000_000,'capture exceeds 20 MB');
 const records=text.split(/\r?\n/).flatMap(line=>{
  const start=line.indexOf('#DIAG ');if(start<0)return [];
  const part=line.slice(start),kind=part.split(' ')[1];
  return [{kind,fields:Object.fromEntries([...part.matchAll(/([A-Za-z][A-Za-z0-9]*)=(\[[^\]]*\]|[^\s]+)/g)].map(m=>[m[1],m[2]]))}];
 });
 assert.equal(records.filter(r=>r.kind==='BEGIN').length,1,'one complete capture per file required');
 assert.equal(records.filter(r=>r.kind==='END').length,1,'one END required');
 assert.equal(records[0].kind,'BEGIN');assert.equal(records.at(-1).kind,'END');
 const begin=records[0].fields,end=records.at(-1).fields;
 assert.equal(begin.mode,'FULL','FULL capture required for ordered raw reconstruction');
 assert.equal(end.reason,'USER','capture stopped abnormally');
 assert.equal(uint(end.recordsLost,'recordsLost'),0n);assert.equal(uint(end.protocolLost,'protocolLost'),0n);
 assert.equal(end.lostReset,'false');
 const resetRecords=records.filter(r=>r.kind==='RESET');
 assert.equal(BigInt(resetRecords.length),uint(end.resetObserved,'resetObserved'));
 assert.equal(BigInt(resetRecords.length),uint(end.resetQueued,'resetQueued'));
 let resetId=Number(uint(begin.startResetId,'startResetId'));
 const samples=new Map(),externalAfter=[];
 for(const record of records){
  const f=record.fields;
  if(record.kind==='RESET'){
   resetId=(resetId+1)>>>0;assert.equal(Number(uint(f.resetId,'resetId')),resetId,'duplicate or missing reset event');
   if(external.has(f.reason))externalAfter.push({after:uint(f.accepted,'accepted'),reason:f.reason});
  }
  if(f.raw===undefined)continue;
  const raw=JSON.parse(f.raw),times=JSON.parse(f.times),count=Number(uint(f.count,'count'));
  assert(count<=16&&raw.length===count&&times.length===count,'invalid raw/time snapshot');
  const first=uint(f.firstId,'firstId'),last=uint(f.accepted,'accepted');
  if(count)assert.equal(first+BigInt(count)-1n,last,'window IDs disagree with counter');
  let total=0,min=Infinity,max=0;
  for(let i=0;i<count;i++){
   const id=String(first+BigInt(i)),sample={id,raw:raw[i],ms:times[i],label:'unknown'};
   const previous=samples.get(id);
   if(previous)assert(previous.raw===sample.raw&&previous.ms===sample.ms,'conflicting duplicate sample');
   else samples.set(id,sample);
   if(i){const dt=(times[i]-times[i-1])>>>0;assert(dt>0&&dt<0x80000000,'invalid timestamp order');total+=dt;min=Math.min(min,dt);max=Math.max(max,dt);}
  }
  assert.equal(Number(f.intervals),Math.max(0,count-1),'interval count mismatch');
  assert.equal(Number(f.dtMin),count>1?min:0);assert.equal(Number(f.dtMax),count>1?max:0);
  assert(Math.abs(Number(f.dtAvg)-(count>1?total/(count-1):0))<=0.000501,'interval mean mismatch');
  if(record.kind==='RESET'&&key[f.reason]){
   assert.equal(count,16,'filter reset requires full raw evidence');
   const metrics=analyse(raw);assert.equal(failures(metrics)[0],f.reason,'log disagrees with current formula/priority');
   assert(Math.abs(metrics[key[f.reason]]-Number(f.value))<=0.000000501,'failed value disagrees with raw window');
   assert(Math.abs(current[key[f.reason]]-Number(f.limit))<=0.000000501,'log limit differs from current production config');
  }
 }
 const ordered=[...samples.values()].sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
 assert(ordered.length,'no full raw/time evidence found');
 assert.equal(BigInt(ordered.at(-1).id),uint(end.accepted,'END accepted'),
  'uncaptured tail: final SNAPSHOT and TRACE OFF must be sent together, or use a fully covered normalized subset');
 for(const event of externalAfter){
  const next=samples.get(String(event.after+1n));
  if(next)(next.resetBefore??=[]).push(event.reason);
 }
 for(const label of annotations.labels??[]){
  assert(typeof label.evidence==='string'&&label.evidence.length,'each labelled interval needs independent evidence');
  const from=uint(label.fromId,'fromId'),to=uint(label.throughId,'throughId');assert(from<=to);
  assert(samples.has(String(from))&&samples.has(String(to)),'label interval must lie inside captured data');
  for(const s of ordered)if(BigInt(s.id)>=from&&BigInt(s.id)<=to){assert.equal(s.label,'unknown','overlapping labels');s.label=label.label;}
 }
 return validateDataset({schemaVersion:1,name:annotations.name??'unlabelled-full-capture',source:'recorded',initialState:'unknown',
  labelEvidence:annotations.labelEvidence??'No independent labels supplied. Unknown intervals are not scored as static or moving.',samples:ordered});
}
