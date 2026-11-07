import {useRef,useState} from 'react';
import type {InventoryState,ManagedSpool} from '@/lib/inventory';
import {effectiveSpoolTare,remainingFilament,type LiveGrossSample} from '@/lib/scale/remaining-filament';
import {formatPreviewWeight} from '@/lib/scale/weight-display';

export default function LiveRemainingFilament({spool,state,sample,now,revision,saving,act,error=''}:{spool?:ManagedSpool;state:InventoryState;sample:LiveGrossSample|null;now:number;revision:number;saving:boolean;act:(a:any)=>Promise<boolean|undefined>;error?:string}){
 const [selectedAt]=useState(()=>Date.now());
 const [baseline,setBaseline]=useState<string|null>(null),[review,setReview]=useState<{spoolId:string;version:number;revision:number;gross:number;tare:number;net:number;capturedAt:string;source:LiveGrossSample['source'];baselineId:string;createdAt:number}|null>(null),[ack,setAck]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const inFlight=useRef(false);
 const tare=spool?effectiveSpoolTare(spool,state):null;
 const result=remainingFilament(spool,tare,sample,now,selectedAt);
 const grossConfirmed=!!sample&&baseline===sample.baselineId;
 const available=grossConfirmed&&result.remaining!==null;
 const reviewValid=!!review&&!!spool&&spool.id===review.spoolId&&spool.version===review.version&&revision===review.revision&&tare===review.tare&&available&&sample?.baselineId===review.baselineId&&now-review.createdAt<=15000;
 const confirm=async()=>{
  if(!review||!reviewValid||!ack||inFlight.current||saving)return;
  const current=remainingFilament(spool,tare,sample,Date.now(),selectedAt);
  if(current.remaining===null||Date.now()-review.createdAt>15000){setMessage('Reading expired; review a fresh estimate.');return;}
  inFlight.current=true;setBusy(true);
  try{if(await act({type:'manual-estimate',id:review.spoolId,version:review.version,expectedRevision:review.revision,confirmed:true,gross:review.gross.toFixed(2),tare:review.tare.toFixed(2),capturedAt:review.capturedAt,source:review.source})){setReview(null);setAck(false);setMessage('Manual UNVERIFIED estimate saved. No scale measurement recorded.');}}
  finally{inFlight.current=false;setBusy(false);}
 };
 return <section className="panel help wide spoolIdentification" aria-label="Live remaining filament"><h2>Live remaining filament {spool?.code}</h2><span className="weightStatus unverified">UNVERIFIED ESTIMATE - FILAMENT</span>
 <output className="liveWeightValue" aria-label="Live remaining filament weight">{available?formatPreviewWeight(result.remaining):'Unavailable'}</output>
 <p role="status">{result.error??(!grossConfirmed?'Confirm the empty-platform gross baseline below.':'Live estimate only; saved inventory is unchanged.')}</p>
 <div className="previewBalance"><div><span>Live gross</span><strong>{sample&&result.remaining!==null?formatPreviewWeight(sample.grams):'Unavailable'}</strong></div><div><span>Effective spool tare</span><strong>{tare===null?'Tare Required':`${tare} g`}</strong></div><div><span>Remaining percentage</span><strong>{available&&spool?.capacity?`${(result.remaining!/spool.capacity*100).toFixed(1)}%`:'Unavailable'}</strong></div><div><span>Saved balance</span><strong>{spool?`${spool.remaining} g`:'No spool selected'}</strong></div></div>
 <label className="checkLabel"><input type="checkbox" disabled={!sample||!spool} checked={grossConfirmed} onChange={e=>{setBaseline(e.target.checked?sample!.baselineId:null);setReview(null);setAck(false)}}/>I confirm empty-platform zeroing: live weight is gross spool plus filament, not filament-only; cover and packaging are excluded</label>
 <p>Spool tare is subtracted once. No 43 g cover adjustment is applied. Zero only the empty platform; do not display-tare an empty spool. No automatic inventory writes.</p>
 <button className="primary" disabled={!available||!spool?.version||saving||busy} onClick={()=>{if(!available||!spool||!sample||tare===null)return;setReview({spoolId:spool.id,version:spool.version!,revision,gross:sample.grams,tare,net:result.remaining!,capturedAt:new Date(sample.receivedAt).toISOString(),source:sample.source,baselineId:sample.baselineId,createdAt:Date.now()});setAck(false);setMessage('')}}>Review &amp; Save Estimate</button>
 {review&&<div className="scaleReview"><h3>Review manual UNVERIFIED estimate</h3><p>{spool?.code}: {review.gross.toFixed(2)} g gross − {review.tare.toFixed(2)} g tare = {review.net.toFixed(2)} g. Recorded at {review.capturedAt}. This freezes the reviewed value; live display continues.</p>{!reviewValid&&<p role="alert">Inventory, tare, connection or freshness changed. Review again.</p>}<label className="checkLabel"><input type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/>I approve saving this manual UNVERIFIED estimate for this spool</label><button className="primary" disabled={!reviewValid||!ack||saving||busy} onClick={()=>void confirm()}>Confirm &amp; save UNVERIFIED estimate</button><button className="secondary" disabled={busy} onClick={()=>{setReview(null);setAck(false)}}>Cancel estimate review</button></div>}
 {(message||error)&&<p role="alert">{message||error}</p>}
 </section>;
}
