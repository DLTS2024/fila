import {useEffect,useRef,useState} from 'react';
import type {InventoryState,ManagedSpool} from '@/lib/inventory';
import {effectiveSpoolTare} from '@/lib/scale/remaining-filament';
import {observationAge,MANUAL_OBSERVATION_MS,type ReceivedObservation} from '@/lib/scale/manual-observation';
import {UNVERIFIED_COUNTS_PER_GRAM} from '@/lib/scale/unverified-preview';
import {formatPreviewWeight} from '@/lib/scale/weight-display';

type Props={observation:ReceivedObservation;connected:boolean;spool?:ManagedSpool;state:InventoryState;now:number;revision:number;saving:boolean;act:(action:any)=>Promise<boolean|undefined>;error?:string};
type Review={id:string;version:number;revision:number;gross:number;tare:number;net:number;capturedAt:string;ageAtReview:number;createdAt:number;baseline:string;connectionId:string};
export default function DelayedWifiEstimate({observation:o,connected,spool,state,now,revision,saving,act,error}:Props){
 const [selectedAt]=useState(()=>Date.now());
 const [baseline,setBaseline]=useState<{raw:number;connectionId:string;id:string}|null>(null);
 const [empty,setEmpty]=useState(false),[physical,setPhysical]=useState(false),[ack,setAck]=useState(false),[review,setReview]=useState<Review|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef(false);
 useEffect(()=>{setBaseline(null);setEmpty(false);setPhysical(false);setReview(null);setAck(false)},[o.connectionId]);
 const age=observationAge(o,now),current=connected&&o.usable;
 const withinManual=current&&age<=MANUAL_OBSERVATION_MS;
 const tareAvailable=withinManual&&typeof o.raw==='number'&&Number.isFinite(o.raw)&&Math.abs(o.raw)<8388600&&!busy&&!saving;
 useEffect(()=>{if(!tareAvailable)setEmpty(false)},[tareAvailable]);
 const status=current&&age<=500?'FRESH':'STALE';
 const sameBaseline=baseline?.connectionId===o.connectionId;
 const gross=sameBaseline&&o.raw!==null?Math.round((o.raw-baseline!.raw)/UNVERIFIED_COUNTS_PER_GRAM*100)/100:null;
 const tare=spool?effectiveSpoolTare(spool,state):null;
 const net=gross!==null&&tare!==null?(Math.round(gross*100)-Math.round(tare*100))/100:null;
 const validMass=net!==null&&gross!==null&&Number.isFinite(gross)&&gross>=0&&gross<=10000&&net>=0&&Number.isFinite(spool?.capacity)&&net<=spool!.capacity!;
 const available=withinManual&&o.arrivedAt>selectedAt&&physical&&validMass&&!!spool?.version&&spool.status!=='archived';
 const validReview=!!review&&!!spool&&spool.id===review.id&&spool.version===review.version&&revision===review.revision&&tare===review.tare&&baseline?.id===review.baseline&&o.connectionId===review.connectionId&&current&&validMass&&now>=review.createdAt&&now-review.createdAt<=10000&&review.ageAtReview+now-review.createdAt<=14000;
 const confirm=async()=>{
  const at=Date.now();
  if(!review||!validReview||!ack||pending.current||saving||at<review.createdAt||at-review.createdAt>10000||review.ageAtReview+at-review.createdAt>14000)return;
  pending.current=true;setBusy(true);
  try{if(await act({type:'manual-estimate',id:review.id,version:review.version,expectedRevision:review.revision,confirmed:true,gross:review.gross.toFixed(2),tare:review.tare.toFixed(2),capturedAt:review.capturedAt,source:'live-preview-wifi'})){
   setReview(null);setAck(false);setMessage('Manual UNVERIFIED estimate saved. No verified scale measurement recorded.');
  }}finally{pending.current=false;setBusy(false);}
 };
 return <section className="panel help wide" aria-label="Latest Wi-Fi weight and manual estimate">
  <h2>Latest Wi-Fi weight</h2><p>Select Spool → Place on Scale → Review Weight → Confirm → Save</p>
  <strong>UNVERIFIED ESTIMATE · {status} · {connected?'CONNECTED':'OFFLINE'}</strong>
  <output className="liveWeightValue" aria-label="Latest received estimated weight">{formatPreviewWeight(gross)}</output>
  <p role="status">Age: {Number.isFinite(age)?(age/1000).toFixed(1):'unknown'} seconds. {status==='STALE'?'Historical reading; not fresh and not a verified measurement.':'Fresh arrival; still uncalibrated and unverified.'}</p>
  {!o.usable&&<p>Latest packet has no usable raw value. The retained number is historical and cannot be reviewed.</p>}
  <p>Source: Wi-Fi raw preview · sequence {o.seq} · estimated capture time {new Date(o.sampledAtMs).toISOString()}.</p>
  <p>Raw: {o.raw??'unavailable'} counts. Factor: {UNVERIFIED_COUNTS_PER_GRAM} counts/g, browser estimate only. No accuracy or stability guarantee.</p>
  {!sameBaseline&&<p>Empty the platform and set a browser display tare before estimating grams.</p>}
  <label className="checkLabel"><input type="checkbox" checked={empty} disabled={!tareAvailable} onChange={e=>{if(tareAvailable)setEmpty(e.target.checked)}}/>I confirm the platform is empty for browser display tare</label>
  <button className="secondary" disabled={!tareAvailable||!empty} onClick={()=>{
   if(!tareAvailable||!empty||observationAge(o,Date.now())>MANUAL_OBSERVATION_MS||o.raw===null){setEmpty(false);setMessage('Browser tare needs a usable observation no older than 5 seconds and an empty-platform acknowledgement.');return;}
   setBaseline({raw:o.raw,connectionId:o.connectionId,id:`${o.connectionId}-${o.seq}-${Date.now()}`});setEmpty(false);setReview(null);setAck(false);setPhysical(false);
  }}>Set browser display tare</button>
  <p>This changes browser display only: no firmware zero, calibration, EEPROM or saved spool tare changes. Phone NFC is optional; no PN532 is needed.</p>
  <p>Browser tare does not require a selected spool. Selecting another spool or reconnecting clears the baseline; inventory review still requires a selected spool.</p>
  <h3>{spool?`Selected spool: ${spool.code}`:'Select an existing spool by code above'}</h3>
  <p>Saved balance: {spool?.remaining??'—'} g · spool tare: {tare??'Tare Required'} g · proposed remaining: {validMass?net!.toFixed(2):'Unavailable'} g.</p>
  <label className="checkLabel"><input type="checkbox" checked={physical} disabled={!spool} onChange={e=>{setPhysical(e.target.checked);setReview(null);setAck(false)}}/>I checked this selected spool and gross load; cover/packaging are excluded and spool tare is subtracted once</label>
  {!withinManual&&<p>Retained for reference only. Wait for a current observation no older than 5 seconds to begin a manual review.</p>}
  <button className="primary" disabled={!available||saving||busy} onClick={()=>{
   if(!available||!spool?.version||gross===null||tare===null||net===null||!baseline||observationAge(o,Date.now())>5000)return;
   setReview({id:spool.id,version:spool.version,revision,gross,tare,net,capturedAt:new Date(o.sampledAtMs).toISOString(),ageAtReview:observationAge(o,Date.now()),createdAt:Date.now(),baseline:baseline.id,connectionId:o.connectionId});setAck(false);setMessage('');
  }}>Review manual estimate</button>
  {review&&<div className="scaleReview"><h3>Review manual UNVERIFIED estimate</h3>
   <p>{spool?.code}: {review.gross.toFixed(2)} g gross − {review.tare.toFixed(2)} g tare = {review.net.toFixed(2)} g remaining. Source: live-preview-wifi. Captured {review.capturedAt}. Verification: UNVERIFIED; {review.ageAtReview>500?'STALE at review':'FRESH at review, uncalibrated'}. Age at review: {(review.ageAtReview/1000).toFixed(1)} seconds; current frozen-value age: {((review.ageAtReview+now-review.createdAt)/1000).toFixed(1)} seconds. This review freezes the value.</p>
   {!validReview&&<p role="alert">Review expired or spool, tare, connection or inventory changed. Review again.</p>}
   <label className="checkLabel"><input type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/>I confirm saving this manual UNVERIFIED estimate, including its age, source and selected spool</label>
   <button className="primary" disabled={!validReview||!ack||saving||busy} onClick={()=>void confirm()}>Confirm and save manual estimate</button>
   <button className="secondary" disabled={busy} onClick={()=>{setReview(null);setAck(false)}}>Cancel review</button>
  </div>}
  {(message||error)&&<p role="alert">{message||error}</p>}
 </section>;
}
