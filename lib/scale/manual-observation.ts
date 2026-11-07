export type ManualObservation={version:1;verification:'UNVERIFIED';seq:number;raw:number|null;sampleAgeMs:number;sampledAtMs:number;usable:boolean};
export type ReceivedObservation=ManualObservation&{arrivedAt:number;connectionId:string};
export const MANUAL_OBSERVATION_MS=5000;
export function observationAge(o:ReceivedObservation,now:number){return now<o.arrivedAt?Infinity:o.sampleAgeMs+now-o.arrivedAt;}
export function parseObservation(value:unknown):ManualObservation|null{
 if(!value||typeof value!=='object')return null;const o=value as ManualObservation;
 return o.version===1&&o.verification==='UNVERIFIED'&&Number.isInteger(o.seq)&&o.seq>=0&&o.seq<=0xffffffff&&
  (o.raw===null||typeof o.raw==='number'&&Number.isFinite(o.raw)&&Math.abs(o.raw)<8388600)&&
  Number.isInteger(o.sampleAgeMs)&&o.sampleAgeMs>=0&&o.sampleAgeMs<=0xffffffff&&Number.isSafeInteger(o.sampledAtMs)&&o.sampledAtMs>0&&typeof o.usable==='boolean'?o:null;
}
