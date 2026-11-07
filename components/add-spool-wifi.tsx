import {useEffect,useState} from 'react';
import type {SerialScaleConnection} from '@/lib/scale/serial';
import {observationAge,MANUAL_OBSERVATION_MS} from '@/lib/scale/manual-observation';
import {UNVERIFIED_COUNTS_PER_GRAM} from '@/lib/scale/unverified-preview';
export type SpoolEstimate={gross:string;tare:string;remaining:string;capturedAt:string;source:'live-preview-wifi';unverified:true};
export default function AddSpoolWifi({controller,tare,capacity,disabled,onAccept}:{controller:SerialScaleConnection;tare:number|null;capacity:number;disabled:boolean;onAccept:(e:SpoolEstimate)=>void}){
 const [s,setS]=useState(()=>controller.getState()),[now,setNow]=useState(Date.now),[empty,setEmpty]=useState(false),[accept,setAccept]=useState(false);
 const [baseline,setBaseline]=useState<{raw:number;connectionId:string}|null>(null);
 useEffect(()=>controller.subscribe(setS),[controller]);useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),100);return()=>clearInterval(t)},[]);
 const o=s.wifiObservation;const connected=s.connection==='connected';const age=o?observationAge(o,now):Infinity;
 const usable=connected&&!!o?.usable&&o.raw!==null&&Number.isFinite(o.raw)&&age<=MANUAL_OBSERVATION_MS;
 useEffect(()=>{setBaseline(null);setEmpty(false);setAccept(false)},[o?.connectionId]);
 useEffect(()=>{if(!usable){setEmpty(false);setAccept(false)}},[usable]);
 useEffect(()=>setAccept(false),[tare,capacity,o?.seq]);
 useEffect(()=>{if(!connected)setBaseline(null)},[connected]);
 const gross=usable&&baseline&&baseline.connectionId===o?.connectionId&&o?.raw!==null&&o?.raw!==undefined?Math.round((o.raw-baseline.raw)/UNVERIFIED_COUNTS_PER_GRAM*100)/100:null;
 const net=gross!==null&&tare!==null?(Math.round(gross*100)-Math.round(tare*100))/100:null;
 const valid=net!==null&&gross!==null&&Number.isFinite(net)&&gross>=0&&gross<=10000&&net>=0&&net<=capacity;
 return <section className="scaleReview" aria-label="Read from Wi-Fi Scale"><h3>Read from Wi-Fi Scale</h3><p>{connected?'CONNECTED':'OFFLINE'} / UNVERIFIED / Source: live-preview-wifi / Observation age: {Number.isFinite(age)?(age/1000).toFixed(1)+' s':'unavailable'}</p><p>Estimated gross: {gross?.toFixed(2)??'Unavailable'} g / effective spool tare: {tare?.toFixed(2)??'Required'} g / remaining: {valid?net!.toFixed(2):'Unavailable'} g</p><label className="checkLabel"><input type="checkbox" disabled={disabled||!usable} checked={empty} onChange={e=>setEmpty(e.target.checked)}/>I confirm the platform is empty for browser display tare</label><button type="button" className="secondary" disabled={disabled||!usable||!empty} onClick={()=>{if(!o||o.raw===null||observationAge(o,Date.now())>MANUAL_OBSERVATION_MS)return;setBaseline({raw:o.raw,connectionId:o.connectionId});setEmpty(false);setAccept(false)}}>Set browser display tare</button><p>Place the spool without cover or packaging. This is a browser estimate, not a calibrated measurement. Starting filament mass stays independent.</p><label className="checkLabel"><input type="checkbox" disabled={disabled||!valid} checked={accept} onChange={e=>setAccept(e.target.checked)}/>I accept this UNVERIFIED estimate and explicitly replace the remaining mass field</label><button type="button" className="secondary" disabled={disabled||!valid||!accept} onClick={()=>{if(!o||!valid||gross===null||net===null||tare===null||observationAge(o,Date.now())>MANUAL_OBSERVATION_MS)return;onAccept({gross:gross.toFixed(2),tare:tare.toFixed(2),remaining:net.toFixed(2),capturedAt:new Date(o.sampledAtMs).toISOString(),source:'live-preview-wifi',unverified:true});setAccept(false)}}>Accept weight into form</button></section>;
}
