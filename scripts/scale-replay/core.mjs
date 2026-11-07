// Diagnostic-only mirror of raw_stability.h. Never imported by firmware/frontend.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const base=new URL('../../',import.meta.url);
const config=fs.readFileSync(new URL('firmware/dloop_usb_scale/scale_config.h',base),'utf8');
const source=fs.readFileSync(new URL('firmware/dloop_usb_scale/raw_stability.h',base),'utf8');
const number=name=>Number(config.match(new RegExp(`\\b${name}\\s*=\\s*([0-9.]+)`))?.[1]);
export const current={name:'current',spread:number('RAW_HARD_RANGE'),central:number('RAW_CENTRAL_RANGE'),
 mad:number('RAW_MAD'),half:number('RAW_HALF_SHIFT'),slope:number('RAW_SLOPE'),
 latest:number('RAW_LATEST_DELTA'),band:number('RAW_HOLD_DRIFT')};
assert.equal(number('WINDOW_SIZE'),16);
assert(Object.values(current).slice(1).every(Number.isFinite));
export const provenance={formula:'16-middle12-clipped-index-slope-v1',
 rawStabilitySha256:crypto.createHash('sha256').update(source).digest('hex'),
 configSha256:crypto.createHash('sha256').update(config).digest('hex')};
const sort=a=>[...a].sort((a,b)=>a-b),sum=a=>a.reduce((a,b)=>a+b,0);
export function analyse(raw){
 assert.equal(raw.length,16);
 const s=sort(raw),median=(s[7]+s[8])/2,centre=sum(s.slice(2,14))/12;
 const deviations=sort(raw.map(v=>Math.abs(v-median)));
 const half=a=>sum(sort(a).slice(1,7));
 let numerator=0,denominator=0;
 for(let i=0;i<16;i++){const x=i-7.5,y=Math.max(s[2],Math.min(s[13],raw[i]));numerator+=x*(y-median);denominator+=x*x;}
 return {centre,median,spread:s[15]-s[0],central:s[13]-s[2],mad:(deviations[7]+deviations[8])/2,
 half:Math.abs(half(raw.slice(0,8))-half(raw.slice(8)))/6,
 slope:Math.abs(numerator/denominator),signedSlope:numerator/denominator,
 latest:Math.abs(raw[15]-centre)};
}
const gates=[['spread','FULL_RANGE'],['central','CENTRAL_RANGE'],['mad','MAD'],['half','HALF_SHIFT'],['slope','SLOPE'],['latest','LATEST']];
export function failures(stats,limits=current){return gates.filter(([key])=>stats[key]>limits[key]).map(([,reason])=>reason);}
export class Hold {
 constructor(){this.centres=[];this.pending=0;this.settled=false;}
 reset(){this.centres=[];this.pending=0;this.settled=false;}
 observe(stats,full,limits){
  ++this.pending;
  if(!full){this.settled=false;return null;}
  const reason=failures(stats,limits)[0];
  if(reason){this.reset();return reason;}
  if(this.pending>=16){this.pending=0;this.centres.push(stats.centre);if(this.centres.length>4)this.centres.shift();}
  const span=Math.max(stats.centre,...this.centres)-Math.min(stats.centre,...this.centres);
  if(span>limits.band){this.reset();return 'CENTRE_SPAN';}
  this.settled=this.centres.length===4;return null;
 }
}
const labels=new Set(['unknown','static','loading','unloading','drift','disturbance','fault']);
const external=new Set(['STALE','RAW_RANGE','CANCEL','ZERO_ACCEPTED','CAL_ACCEPTED','CALIBRATION_ACCEPTED']);
export function validateDataset(d){
 assert.equal(d.schemaVersion,1,'dataset schemaVersion must be 1');
 assert(['recorded','synthetic'].includes(d.source),'explicit recorded/synthetic provenance required');
 assert(['fresh','unknown'].includes(d.initialState),'initialState must be fresh or unknown');
 assert(typeof d.name==='string'&&d.name.length>0,'dataset name required');
 assert(typeof d.labelEvidence==='string'&&d.labelEvidence.length>0,'independent label evidence required');
 assert(Array.isArray(d.samples)&&d.samples.length>0&&d.samples.length<=100000,'1..100000 samples required');
 let previous=null;
 for(const s of d.samples){
  assert(typeof s.id==='string'&&/^\d+$/.test(s.id),'sample IDs must be integer strings');
  assert(BigInt(s.id)>=1n&&BigInt(s.id)<=0xffffffffffffffffn,'uint64 sample ID required');
  assert(Number.isInteger(s.ms)&&s.ms>=0&&s.ms<=0xffffffff,'uint32 device millis required');
  assert(Number.isInteger(s.raw)&&s.raw>-8388600&&s.raw<8388600,'accepted raw values must not be rejected ADC rails');
  assert(labels.has(s.label),'independent per-sample label required');
  assert(s.resetBefore===undefined||Array.isArray(s.resetBefore),'resetBefore must be an array');
  for(const reason of s.resetBefore??[])assert(external.has(reason),'only external resets allowed; do not copy current filter resets into candidates');
  if(previous){
   assert.equal(BigInt(s.id),BigInt(previous.id)+1n,'missing accepted samples: do not invent or interpolate gaps');
   const dt=(s.ms-previous.ms)>>>0;
   assert(dt>0&&dt<0x80000000,'timestamps must progress, permitting one millis rollover');
   assert(dt<=number('SAMPLE_FRESH_MS')||(s.resetBefore??[]).includes('STALE'),
    'long acquisition gap requires explicit observed STALE evidence; replay cannot infer firmware loop ordering');
  }
  previous=s;
 }
 return d;
}
export function thresholdSets(candidates=[]){
 assert(Array.isArray(candidates),'candidates must be an array');
 const names=new Set(['current']);
 return [current,...candidates.map(c=>{
  assert(c&&Object.keys(c).every(k=>['name','slope','half'].includes(k)),'only offline slope/half candidates supported');
  assert(typeof c.name==='string'&&c.name.length>0&&!names.has(c.name),'unique candidate name required');names.add(c.name);
  for(const k of ['slope','half'])assert(c[k]===undefined||(Number.isFinite(c[k])&&c[k]>0),'finite positive limits required');
  return {...current,...c};
 })];
}
const rate=(n,d)=>d?n/d:null;
export function replay(input,limits=current,{details=false}={}){
 const d=validateDataset(input),h=new Hold();let window=[],resetCounts={},allGateFailures={},rows=[];
 let fullWindows=0,staticWindows=0,staticGateRejects=0,postWarmupStatic=0,staticNotQualified=0;
 let motionSamples=0,falseStable=0,maxFalseStableRun=0,falseRun=0,maxHold=0;
 let segment=null,segments=[],priorLabel=null;
 for(let i=0;i<d.samples.length;i++){
  const s=d.samples[i];
  if(s.label!==priorLabel){
   segment={label:s.label,startId:s.id,startMs:s.ms,samples:0,firstQualifiedMs:null,rightCensored:true};
   segments.push(segment);priorLabel=s.label;
  }
  ++segment.samples;
  for(const reason of s.resetBefore??[]){h.reset();window=[];resetCounts[reason]=(resetCounts[reason]??0)+1;}
  window.push(s);if(window.length>16)window.shift();
  const full=window.length===16,stats=full?analyse(window.map(v=>v.raw)):null;
  const failed=full?failures(stats,limits):[];
  const discarded={pending:h.pending+1,hold:h.centres.length};
  const reason=h.observe(stats,full,limits);
  if(reason)resetCounts[reason]=(resetCounts[reason]??0)+1;
  for(const f of failed)allGateFailures[f]=(allGateFailures[f]??0)+1;
  if(full)++fullWindows;
  const entirelyStatic=full&&window.every(v=>v.label==='static');
  if(entirelyStatic){
   ++staticWindows;if(failed.length)++staticGateRejects;
   if(segment.firstQualifiedMs===null&&h.settled){segment.firstQualifiedMs=(s.ms-segment.startMs)>>>0;segment.rightCensored=false;}
   if(segment.samples>=64){++postWarmupStatic;if(!h.settled)++staticNotQualified;}
  }
  const motion=!['unknown','static'].includes(s.label);
  if(motion){++motionSamples;if(h.settled){++falseStable;++falseRun;}else falseRun=0;}else falseRun=0;
  maxFalseStableRun=Math.max(maxFalseStableRun,falseRun);maxHold=Math.max(maxHold,h.centres.length);
  if(details)rows.push({id:s.id,ms:s.ms,label:s.label,stats,failed,reset:reason,
   discarded:reason?discarded:null,pending:h.pending,hold:h.centres.length,rawQualified:h.settled});
 }
 return {dataset:d.name,source:d.source,limits,initialState:d.initialState,
  interpretation:'Raw qualification only; not calibrated USB eligibility, accuracy or permission to save inventory.',
  initialStateWarning:d.initialState==='unknown'?'Cold-start reconstruction; original hold history is unavailable.':null,
  samples:d.samples.length,fullWindows,maxHold,resetCounts,allGateFailures,
  static:{windows:staticWindows,localGateRejects:staticGateRejects,localFalseRejectionRate:rate(staticGateRejects,staticWindows),
   postWarmupSamples:postWarmupStatic,postWarmupNotQualified:staticNotQualified,
   postWarmupNotQualifiedRate:rate(staticNotQualified,postWarmupStatic),
   qualificationSegments:segments.filter(s=>s.label==='static')},
  movement:{labelledSamples:motionSamples,rawFalseStableSamples:falseStable,
   rawFalseStableRate:rate(falseStable,motionSamples),rejectionRate:rate(motionSamples-falseStable,motionSamples),maxFalseStableRun},
  realSafetyAssessment:d.source==='recorded'&&motionSamples>0&&staticWindows>0?'Needs independent labels, repeated held-out captures and physical validation.':'NOT ASSESSED: no recorded labelled static-plus-motion evidence.',
  ...(details?{rows}:{})};
}
