import {useEffect,useState} from 'react';
import type {SerialScaleConnection,ScaleState} from '@/lib/scale/serial';
import {UNVERIFIED_COUNTS_PER_GRAM,unverifiedEstimatedGrams} from '@/lib/scale/unverified-preview';
import {DISPLAY_ZERO_DEADBAND_G,formatPreviewWeight} from '@/lib/scale/weight-display';
import type {LiveGrossSample} from '@/lib/scale/remaining-filament';

export default function LiveWeightPreview({connection,state,now,onPreviewGrams,onGrossSample}:{connection:SerialScaleConnection;state:ScaleState;now:number;onPreviewGrams?:(value:number|null)=>void;onGrossSample?:(value:LiveGrossSample|null)=>void}){
  const p=state.preview;
  const fresh=state.connection==='connected'&&!!p&&now>=p.receivedAt&&now-p.receivedAt+p.ageMs<=500&&p.raw!==null;
  const [tare,setTare]=useState<{value:number;grams:boolean}|null>(null);
  const [tareAck,setTareAck]=useState(false),[calAck,setCalAck]=useState(false);
  const [estimateAck,setEstimateAck]=useState(false);
  const [mass,setMass]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{setTare(null);setTareAck(false);setCalAck(false);setMessage('')},[p?.connectionId,p?.calibrated]);
  useEffect(()=>{setCalAck(false);setMass('')},[p?.stage]);
  const grams=!!p?.calibrated&&p.grams!==null;
  const value=fresh?(grams?p!.grams!:p!.raw!):null;
  const displayed=value===null?null:value-(tare?.grams===grams?tare.value:0);
  useEffect(()=>{setEstimateAck(false)},[p?.connectionId,p?.calibrated,tare]);
  useEffect(()=>{if(!fresh&&state.transport!=='wifi')setEstimateAck(false)},[fresh,state.transport]);
  const estimate=unverifiedEstimatedGrams(grams?null:displayed,estimateAck,fresh);
  const weightText=formatPreviewWeight(grams?displayed:estimate);
  useEffect(()=>{onPreviewGrams?.(fresh?(grams?displayed:estimate):null)},[fresh,grams,displayed,estimate,onPreviewGrams]);
  useEffect(()=>{
    // Calibration/settling status is expected during unverified preview. Physical sensor faults are not usable gross data.
    const usableStatus=state.sensor!=='fault'||/Calibration required|NOT_READY:|strict hold|strict calibration gates|verification failed or expired|Calibration command rejected|APPROXIMATE: verify/.test(state.message);
    const gross=grams?displayed:estimate;
    onGrossSample?.(fresh&&usableStatus&&p&&gross!==null?{grams:gross,receivedAt:p.receivedAt,ageMs:p.ageMs,connectionId:p.connectionId,baselineId:JSON.stringify([p.connectionId,p.calibrated,tare]),source:state.transport==='wifi'?'live-preview-wifi':state.transport==='simulator'?'live-preview-simulator':'live-preview-usb'}:null);
  },[fresh,grams,displayed,estimate,p,tare,state.transport,state.sensor,state.message,onGrossSample]);
  const stage=p?.stage;
  const numericMass=/^\d+(?:\.\d{1,2})?$/.test(mass)&&Number(mass)>=50&&Number(mass)<=5000;
  const command=stage==='STRICT_REQUIRED'?'MODE STRICT':stage==='EMPTY'?'ZERO EMPTY':stage==='LOAD'?`CAL ${mass}`:stage==='VERIFY'?`VERIFY ${mass}`:stage==='ACCEPT'?'ACCEPT':null;
  const send=async(text:string)=>{
    if(busy)return;setBusy(true);setMessage('');setCalAck(false);
    try{await connection.command(text);setTare(null);setMessage('Command sent. Wait for the device status; a sent command is not calibration approval.');}
    catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  };
  return <section className="panel help wide" aria-label="Live weight preview">
    <h2>Live Weight Preview</h2>
    <p>Filtered live display. Manual UNVERIFIED estimates require separate review; verified gross measurements retain strict calibration and stability checks.</p>
    <div className="readingBox liveWeightHero">
      <span className={grams?'weightStatus verified':'weightStatus unverified'}>{grams?'STRICT CALIBRATION ACCEPTED':'UNVERIFIED ESTIMATE'}{state.transport==='simulator'?' · SIMULATED':''}</span>
      <output className="liveWeightValue" aria-label="Live preview weight">{weightText}</output>
      <p role="status">{!p?(state.transport==='wifi'?'Waiting for fresh Wi-Fi scale data.':'Connect your USB scale to preview weight.'):!fresh?'Stale or waiting for fresh sensor data':!grams&&!estimateAck?'Confirm the empty-platform tare below to enable the estimate.':grams&&p.strictStable?'Strict hold complete':!grams?'UNVERIFIED estimate; no calibrated or stable measurement claim':'Live display · waiting for strict stability'}</p>
      {tare&&<p>Browser display tare applied. This does not calibrate or zero the device, write EEPROM, or change the saved spool tare.</p>}
      <small>Display zero: ±{DISPLAY_ZERO_DEADBAND_G.toFixed(1)} g only. This changes the display, never the measured value.</small>
    </div>
    {!grams&&<label className="checkLabel"><input type="checkbox" checked={estimateAck} disabled={!fresh} onChange={e=>setEstimateAck(e.target.checked)}/>I confirm the displayed raw counts are tared to the empty-platform baseline</label>}
    {!grams&&<p className="hint">Unverified approximation only. If not already tared, remove all load and tare the empty platform first. No estimate updates inventory automatically. Review & Save Estimate records a manual UNVERIFIED balance only with your confirmation.</p>}
    <label className="checkLabel"><input type="checkbox" checked={tareAck} onChange={e=>setTareAck(e.target.checked)}/>I confirm the current load is the display tare baseline</label>
    <button className="secondary" disabled={!fresh||!tareAck||busy} onClick={()=>{
      // Recheck both host age and device sample age at the click boundary.
      const live=connection.getState().preview;
      if(!live||Date.now()<live.receivedAt||Date.now()-live.receivedAt+live.ageMs>500)return;
      const inGrams=live.calibrated&&live.grams!==null;
      const current=inGrams?live.grams:live.raw;if(current===null)return;
      setTare({value:current,grams:inGrams});setTareAck(false);
    }}>Tare preview display</button>
    <button className="textButton" disabled={!tare} onClick={()=>setTare(null)}>Clear display tare</button>
    <details className="advancedScaleDiagnostics"><summary>Advanced Diagnostics</summary>
      <h3>Sensor and display data</h3>
      <p>Sensor raw: {fresh&&p?p.raw!.toFixed(0):'—'} counts</p>
      <p>Tared display: {fresh&&displayed!==null?displayed.toFixed(grams?2:0):'—'} {grams?'g':'counts'}</p>
      {p&&<p>Strict hold {p.hold}/4 · pending {p.pending}/16 · calibration: {p.stage}{p.spike?' · spike excluded from display median':''}</p>}
      <p>Browser-only approximate factor: {UNVERIFIED_COUNTS_PER_GRAM} counts/g. Reference supplied: 1802 g at approximately 385008 tared counts. This is separate from accepted calibration.</p>
      <p>Unrounded weight before display formatting: {grams?displayed??'unavailable':estimate??'unavailable'} g. Display-only zero deadband: |weight| ≤ {DISPLAY_ZERO_DEADBAND_G} g; kg starts at |weight| ≥ 1000 g.</p>
      <p>{state.transport==='wifi'?'Wi-Fi baseline confirmation clears on tare changes, calibration changes or reconnect. Stale weights remain hidden.':'Estimate confirmation clears on tare changes, calibration changes, reconnect or stale data.'} It does not tare or calibrate the sensor.</p>
    <details><summary>Guided verified-reference calibration</summary>
      <p>Use independently known masses. Preview smoothing never qualifies calibration. The board must pass its existing strict gates at every step; if it cannot settle, calibration stays blocked.</p>
      {stage==='STRICT_REQUIRED'?<p>Switch to strict mode to use this guide. This does not accept approximate calibration.</p>:
        stage==='DONE'?<p>Strict calibration accepted. Verify physical accuracy with independent loads before inventory use.</p>:
        stage==='LOAD'?<p>Place the first known reference (50–5000 g), wait for strict hold, then enter its actual mass.</p>:
        stage==='VERIFY'?<p>Replace it with a different known reference, differing by at least 20 g or 10% of the fitting mass, whichever is larger. Wait for strict hold. Verification never changes the fitted factor.</p>:
        stage==='ACCEPT'?<p>Leave the verification reference untouched. Accept only after checking this reference; the board rechecks freshness, stability and mass before saving.</p>:
        <p>Remove all load. Zero only an empty platform. This starts a new strict calibration and invalidates the saved strict calibration.</p>}
      {(stage==='LOAD'||stage==='VERIFY')&&<label>Known reference mass (g)<input type="number" min="50" max="5000" step="0.01" value={mass} onChange={e=>{setMass(e.target.value);setCalAck(false)}}/></label>}
      <label className="checkLabel"><input type="checkbox" checked={calAck} onChange={e=>setCalAck(e.target.checked)}/>I confirm the platform/reference matches this calibration step</label>
      {command&&<button className="primary" disabled={busy||!fresh||!calAck||state.transport!=='usb'||(stage!=='STRICT_REQUIRED'&&!p?.strictStable)||((stage==='LOAD'||stage==='VERIFY')&&!numericMass)} onClick={()=>void send(command)}>{stage==='STRICT_REQUIRED'?'Use strict calibration':stage==='EMPTY'?'Zero empty platform':stage==='LOAD'?'Fit known reference':stage==='VERIFY'?'Verify different reference':'Accept verified calibration'}</button>}
      {stage==='DONE'&&<button className="secondary" disabled={!fresh||!calAck||!p?.strictStable||busy||state.transport!=='usb'} onClick={()=>void send('ZERO EMPTY')}>Start new calibration with empty platform</button>}
      {stage==='DONE'&&<p>Starting again requires an empty platform and invalidates the existing strict calibration.</p>}
      {message&&<p role="status">{message}</p>}
    </details>
    </details>
  </section>;
}
