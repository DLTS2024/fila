import {useCallback,useEffect,useRef,useState} from 'react';
import LiveWeightPreview from './live-weight-preview';
import SpoolIdentification from '@/components/spool-identification';
import LiveRemainingFilament from '@/components/live-remaining-filament';
import DelayedWifiEstimate from '@/components/delayed-wifi-estimate';
import type {LiveGrossSample} from '@/lib/scale/remaining-filament';
import type {OptionalNfcReaderAdapter} from '@/lib/spool-identification';
import {resolveSpool} from '@/lib/spool-identification';
import {Scale,Radio,Link,Usb,Check,Unplug} from 'lucide-react';
import type {InventoryState} from '@/lib/inventory';
import {useSerialScale} from '@/hooks/use-serial-scale';
import {browserSerialSupport,type SerialScaleConnection} from '@/lib/scale/serial';
import {SimulatedScalePort,type SimulatorSample} from '@/lib/scale/simulator';
import {eligibleReading,freshReading,frameIdentity,scaleConfirmationKey,reviewToleranceG,type ScaleReading} from '@/lib/scale/protocol';

type Review={spoolId:string;version:number;revision:number;gross:string;tare:string;before:number;net:number;key:string;reading?:ScaleReading};
type Props={state:InventoryState;revision?:number;saving:boolean;error?:string;act:(a:any)=>Promise<boolean|undefined>;controller?:SerialScaleConnection;wifiController?:SerialScaleConnection;networkMode?:boolean;phoneOrigin?:string|null;reader?:OptionalNfcReaderAdapter};

export default function Connections(props:Props){
  const [mode,setMode]=useState<'wifi'|'usb'>('wifi');
  if(!props.wifiController)return <ScaleConnections {...props}/>;
  return <><section className="panel help"><h2>Scale connection</h2><button className="primary" aria-pressed={mode==='wifi'} onClick={()=>setMode('wifi')}>Wi-Fi Scale</button><button className="secondary" aria-pressed={mode==='usb'} onClick={()=>setMode('usb')}>USB diagnostic fallback</button><p>Wi-Fi uses the authenticated PHP API. USB requires a separate explicit browser connection; neither path saves automatically.</p></section><ScaleConnections key={mode} {...props} controller={mode==='wifi'?props.wifiController:props.controller} networkMode={mode==='wifi'}/></>;
}
function ScaleConnections({state,revision=0,saving,error='',act,controller,phoneOrigin,reader,networkMode=false}:Props){
  const {connection,state:scale,now}=useSerialScale(controller,networkMode);
  const support=browserSerialSupport();
  const [simulator]=useState(()=>new SimulatedScalePort());
  const [showSimulator,setShowSimulator]=useState(false);
  const [sample,setSample]=useState<SimulatorSample>({grossG:984.6,stable:true,calibrated:true,fault:false,paused:false});
  const [raw,setRaw]=useState('');
  const [livePreviewGrams,setLivePreviewGrams]=useState<number|null>(null);
  const [grossSample,setGrossSample]=useState<LiveGrossSample|null>(null);
  const selectSpool=useCallback((id:string)=>{setRoll(id);setReview(null);setAck(false);setAttempted(false)},[]);
  const [roll,setRoll]=useState(''),[uid,setUID]=useState(''),[manual,setManual]=useState(''),[message,setMessage]=useState('');
  const [review,setReview]=useState<Review|null>(null),[ack,setAck]=useState(false),[attempted,setAttempted]=useState(false),[sending,setSending]=useState(false);
  const inFlight=useRef(false),consumed=useRef(new Set<string>());
  const active=state.spools.filter(p=>p.status!=='archived');
  const selected=active.find(p=>p.id===roll),current=active.find(p=>p.id===review?.spoolId);
  const reading=scale.reading;
  const connected=scale.connection==='connected';
  const connecting=['selecting','opening','disconnecting'].includes(scale.connection);
  const tareKnown=!!selected&&selected.tareKnown!==false&&Number.isFinite(selected.tare)&&selected.tare>=0;
  const fresh=freshReading(reading,now);
  const previewFresh=!scale.preview||(now>=scale.preview.receivedAt&&now-scale.preview.receivedAt+scale.preview.ageMs<=500);
  const ready=connected&&scale.sensor==='ready'&&eligibleReading(reading,now)&&previewFresh;
  const selectable=!!selected&&tareKnown&&!selected.tareProvisional&&Number.isInteger(selected.version)&&Number(selected.version)>0;
  const available=ready&&reading&&!consumed.current.has(frameIdentity(reading));
  const reviewRecordValid=!!review&&!!current&&current.version===review.version&&revision===review.revision;
  const sameConnection=!!review?.reading&&!!reading&&review.reading.connectionId===reading.connectionId;
  const liveStillMatches=ready&&sameConnection&&!!review?.reading&&!!reading&&reading.mode===review.reading.mode&&Math.abs(reading.grossG-review.reading.grossG)<=reviewToleranceG(review.reading);
  const sampleConsumed=!!review?.reading&&consumed.current.has(frameIdentity(review.reading));
  // An ambiguous retry may acknowledge an old committed sample. PHP rejects it
  // if no matching idempotency record exists and its receipt time has expired.
  const reviewScaleValid=!review?.reading||(!sampleConsumed&&liveStillMatches&&(attempted||eligibleReading(review.reading,now)));
  const canSave=!!review&&ack&&reviewRecordValid&&reviewScaleValid&&!saving&&!sending;

  useEffect(()=>{simulator.setSample(sample)},[simulator,sample]);
  useEffect(()=>{if(reading?.uid){setUID(reading.uid);const linked=resolveSpool(state.spools,{kind:'hardware-uid',value:reading.uid});if(linked)selectSpool(linked.id)}},[reading?.uid,state.spools,selectSpool]);

  const clearReview=()=>{setReview(null);setAck(false);setAttempted(false)};
  const preview=(usb:boolean)=>{
    setMessage('');
    if(!selectable||!selected){setMessage('Select an active spool with a saved tare and current version.');return;}
    if(usb&&(!available||!reading)){setMessage('Receive a fresh, stable, calibrated scale reading before review.');return;}
    if(!usb&&(!manual.trim()||!/^\d+(?:\.\d{1,2})?$/.test(manual))){setMessage('Enter a manual gross mass with at most two decimal places.');return;}
    const gross=usb?reading!.grossG:Number(manual);
    const cents=Math.round(gross*100),tareCents=Math.round(selected.tare*100);
    if(!Number.isFinite(gross)||gross<0||gross>100000||cents<tareCents){setMessage('Gross must be finite, at least the empty spool tare and no more than 100,000 g.');return;}
    setReview({spoolId:selected.id,version:selected.version!,revision,gross:(cents/100).toFixed(2),tare:(tareCents/100).toFixed(2),before:selected.remaining,net:(cents-tareCents)/100,key:usb?scaleConfirmationKey(reading!):crypto.randomUUID(),...(usb?{reading:{...reading!}}:{})});
    setAck(false);setAttempted(false);
  };
  const confirm=async()=>{
    if(inFlight.current||!canSave||!review)return;
    // Recheck receipt age at click time, not only on the 250 ms display timer.
    const live=connection.getState();
    if(review.reading&&live.preview&&(Date.now()<live.preview.receivedAt||Date.now()-live.preview.receivedAt+live.preview.ageMs>500)){setMessage('Sensor sample expired. Wait for a fresh reading.');return;}
    if(review.reading&&(live.connection!=='connected'||live.sensor!=='ready'||!eligibleReading(live.reading,Date.now())||live.reading.mode!==review.reading.mode||live.reading.connectionId!==review.reading.connectionId||Math.abs(live.reading.grossG-review.reading.grossG)>reviewToleranceG(review.reading)||(!attempted&&!eligibleReading(review.reading,Date.now())))){setMessage('Reading expired or the live sensor changed. Review a fresh sample.');return;}
    inFlight.current=true;setSending(true);setAttempted(true);setMessage('');
    try{
      const r=review.reading;
      const readingContext=r?{v:1,deviceId:r.deviceId,seq:r.seq,grossG:r.grossG,stable:r.stable,calibrated:r.calibrated,receivedAt:new Date(r.receivedAt).toISOString(),connectionId:r.connectionId,transport:r.transport,...(r.mode?{mode:r.mode,approximateAcknowledged:ack}:{})}:undefined;
      const saved=await act({type:'scale-measurement',id:review.spoolId,version:review.version,revision:review.revision,gross:review.gross,tare:review.tare,confirmationKey:review.key,...(readingContext?{reading:readingContext}:{})});
      if(saved){if(r)consumed.current.add(frameIdentity(r));clearReview();setMessage(r?.transport==='simulator'?'Simulator measurement saved with explicit test provenance.':'Confirmed measured balance saved with history.');}
    }finally{inFlight.current=false;setSending(false);}
  };
  const status=scale.sensor==='ready'?(reading?.mode==='APPROXIMATE'?'APPROXIMATE · settled · calibrated':'Stable · calibrated'):scale.sensor==='unstable'?'Unstable':scale.sensor==='uncalibrated'?'Not calibrated':scale.sensor==='stale'?'Stale reading':scale.sensor==='fault'?'Sensor fault':scale.sensor==='invalid'?'Invalid protocol data':'Waiting for sensor';
  return <div className="connectionGrid">
    <div className="notice wide">Live previews never save automatically. Manual UNVERIFIED estimates require explicit review; verified measurements retain strict freshness, stability and calibration gates.</div>
    <section className="panel help wide">
      <Usb/><h2>{networkMode?'Wi-Fi Smart Scale':'USB smart scale'}</h2><p>{networkMode?'Authenticated HTTPS polling; device credentials stay outside the browser.':support.message}</p>
      <span className="tag" role="status">{connected?(networkMode?'Wi-Fi online':scale.transport==='simulator'?'Simulator connected':'USB serial open'):scale.connection}</span>
      <div><button className="primary" disabled={networkMode||!support.provider||connected||connecting} onClick={()=>{if(support.provider)void connection.connect(support.provider)}}><Usb size={16}/> Connect USB</button>
      <button className="secondary" disabled={networkMode||scale.connection==='disconnected'} onClick={()=>void connection.disconnect()}><Unplug size={16}/> Disconnect</button></div>
      <p className="hint">Select your NodeMCU COM port at 115200 baud. Close Arduino Serial Monitor first. Calibration commands are sent only from the confirmed guide below; connecting alone sends none.</p>
      <details><summary>Inventory gross measurement status</summary><div className="readingBox"><small>LIVE GROSS WEIGHT {scale.transport==='simulator'?'— SIMULATED':''}</small><h3>{reading?.calibrated?`${reading.grossG.toFixed(2)} g`:'— g'}</h3><p role="status">{status}{reading&&!fresh?' · expired':''}</p><p>Last reading: {scale.lastReadingAt===null?'None':new Date(scale.lastReadingAt).toLocaleTimeString()}</p>{reading&&<small>{reading.deviceId} · sequence {reading.seq}{reading.uid?' · optional NFC received':' · no NFC required'}</small>}</div></details>
      {scale.message&&<p role="status">{scale.message}</p>}
      {networkMode&&<p>Last server receipt: {scale.lastReadingAt===null?'None':new Date(scale.lastReadingAt).toLocaleString()}. Online status does not imply a fresh, calibrated or stable reading.</p>}
      <details className="advancedScaleDiagnostics"><summary>USB receive diagnostics</summary>
        <p>Received bytes: {scale.serialDiagnostics?.bytes??0} · complete lines: {scale.serialDiagnostics?.lines??0} · accepted v1 frames: {scale.serialDiagnostics?.frames??0} · DEBUG lines ignored: {scale.serialDiagnostics?.debugLines??0} · rejected frames: {scale.serialDiagnostics?.rejected??0}</p>
        {connected&&!(scale.serialDiagnostics?.bytes)&&<p>Port is open but no bytes have reached this browser session. This is not a calibration or spool-selection failure. Check the device output before changing hardware or flashing.</p>}
        {!!scale.serialDiagnostics?.debugLines&&!scale.serialDiagnostics.frames&&<p>DEBUG output is arriving, but no accepted v1 JSON frames have arrived. DEBUG RAW is never converted into a weight.</p>}
        {!!scale.serialDiagnostics?.frames&&!scale.preview&&<p>V1 frames were received, but the current frame has no usable live preview. Inspect the last line and rejection reason; older firmware may lack the live extension.</p>}
        <p>Last received line (first 240 characters, memory only):</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{scale.serialDiagnostics?.lastLine||'None'}</pre>
        {scale.serialDiagnostics?.lastError&&<p>Last rejection: {scale.serialDiagnostics.lastError}</p>}
        <p>Boot text or a sequence restarting may indicate a board reset. No reset signals or commands are sent by this diagnostic panel. A reset cannot be confirmed from an open-port message alone.</p>
      </details>
      <button className="textButton" aria-expanded={showSimulator} disabled={networkMode} onClick={()=>setShowSimulator(v=>!v)}>Simulator (no hardware)</button>
      {showSimulator&&<div className="inventoryForms simulatorControls"><h3>Protocol simulator</h3><p className="hint">Test data only. Confirming a simulator preview will update the selected inventory record and be recorded as simulated.</p><label>Simulator gross weight (g)<input type="number" min="0" max="100000" step="0.01" value={sample.grossG} onChange={e=>setSample({...sample,grossG:Number(e.target.value)})}/></label>
      {(['stable','calibrated','fault','paused'] as const).map(key=><label className="checkLabel" key={key}><input type="checkbox" checked={sample[key]} onChange={e=>setSample({...sample,[key]:e.target.checked})}/>{key==='stable'?'Simulator stable':key==='calibrated'?'Simulator calibrated':key==='fault'?'Simulator sensor fault':'Pause simulator stream'}</label>)}
      <button className="secondary" disabled={connected||connecting} onClick={()=>void connection.connectSimulator(simulator)}>Start scale simulator</button>
      <label>Custom simulator frame<textarea maxLength={4096} rows={3} value={raw} onChange={e=>setRaw(e.target.value)} placeholder='{"v":1,"deviceId":"DLOOP-SCALE-01","seq":123,"grossG":984.6,"stable":true,"calibrated":true}'/></label>
      <button className="secondary" disabled={!connected||scale.transport!=='simulator'||!raw.trim()} onClick={()=>simulator.inject(raw+'\n')}>Send simulator frame</button></div>}
    </section>
    <SpoolIdentification state={state} selected={selected} select={selectSpool} act={act} saving={saving||sending} phoneOrigin={phoneOrigin} reader={reader} liveGrams={livePreviewGrams} showLegacyLiveEstimate={false}/>
    {networkMode&&scale.wifiObservation&&!scale.preview?.calibrated?<DelayedWifiEstimate key={selected?.id??'none'} observation={scale.wifiObservation} connected={connected} spool={selected} state={state} now={now} revision={revision} saving={saving||sending} act={act} error={error}/>:<>
     <LiveWeightPreview connection={connection} state={scale} now={now} onPreviewGrams={setLivePreviewGrams} onGrossSample={setGrossSample}/>
     <LiveRemainingFilament key={selected?.id??'none'} spool={selected} state={state} sample={connected?grossSample:null} now={now} revision={revision} saving={saving||sending} act={act} error={error}/>
    </>}
    <section className="panel help">
      <Scale/><h2>Select, review & confirm</h2><label>Spool for measurement<select value={roll} disabled={sending} onChange={e=>{setRoll(e.target.value);clearReview()}}><option value="">Choose spool manually</option>{active.map(p=><option key={p.id} value={p.id}>{p.code||p.name} · {p.name} · {p.brand}</option>)}</select></label>
      <p>Saved effective tare: {tareKnown?`${selected!.tare.toFixed(2)} g${selected?.tareProvisional?' (UNVERIFIED; use manual inventory estimate)':''}`:'Tare Required — edit the spool first'}</p>
      <button className="primary" disabled={!selectable||!available||saving||sending} onClick={()=>preview(true)}>Review scale measurement</button>
      <form onSubmit={e=>{e.preventDefault();preview(false)}}><label>Manual gross weight (g)<input type="number" required min="0" max="100000" step="0.01" value={manual} onChange={e=>setManual(e.target.value)}/></label><button className="secondary" disabled={!selectable||saving||sending}>Review manual measurement</button></form>
      <p className="hint">Manual entry always remains available. Incoming serial frames never save inventory. To change tare, use Update existing filament separately.</p>
      {review&&<div className="scaleReview"><h3>Frozen measurement preview</h3><p>{current?.name} · {review.reading?.transport==='simulator'?'SIMULATOR — NOT PHYSICAL':review.reading?'USB scale':'Manual entry'}</p><div className="previewBalance"><div><span>Gross weight</span><strong>{review.gross} g</strong></div><div><span>Effective tare</span><strong>{review.tare} g</strong></div><div><span>Previous remaining mass</span><strong>{review.before.toFixed(2)} g</strong></div><div><span>Proposed remaining mass</span><strong>{review.net.toFixed(2)} g</strong></div><div><span>Difference</span><strong>{(review.net-review.before).toFixed(2)} g</strong></div></div>
      {!reviewRecordValid&&<p role="alert" className="error">Inventory changed. Reload and review this spool again.</p>}
      {review.reading&&!reviewScaleValid&&<p role="alert" className="error">Scale preview is no longer safe: check freshness, stability, calibration and connection, then review a new reading.</p>}
      {review.reading?.mode==='APPROXIMATE'&&<p role="status">APPROXIMATE measurement — check the proposed balance before saving. Reference testing does not guarantee accuracy at every load.</p>}
      <label className="checkLabel"><input type="checkbox" checked={ack} disabled={sending} onChange={e=>setAck(e.target.checked)}/>{review.reading?.mode==='APPROXIMATE'?(review.reading.transport==='simulator'?'I accept this APPROXIMATE SIMULATED weight and checked the spool, tare and balance':'I accept this APPROXIMATE weight and checked the spool, tare and balance'):review.reading?.transport==='simulator'?'I understand simulated data will update the selected inventory record':'I checked this spool, tare and proposed balance'}</label>
      <button className="primary" disabled={!canSave} onClick={()=>void confirm()}><Check size={16}/>{sending?'Saving…':attempted?'Retry this confirmation':'Confirm & save measurement'}</button>
      <button className="secondary" disabled={sending} onClick={clearReview}>Cancel review</button>
      {attempted&&<p className="hint">A retry uses the identical confirmation and key. PHP only acknowledges an expired sample if it was already committed. Otherwise review a new reading. Disconnecting or a sensor fault blocks retry.</p>}
      </div>}
      {error&&<p role="alert" className="error">{error}</p>}
    </section>
    <section className="panel help"><Radio/><h2>Optional NFC tag link</h2><p>NFC is optional identification, never a weight or permission source. Select any spool manually above; USB works without a tag.</p><label>Optional NFC UID<input value={uid} maxLength={50} placeholder="04:A1:B2:C3:D4:E5:F6" onChange={e=>setUID(e.target.value)}/></label><button className="primary" disabled={!selected||saving||sending} onClick={async()=>{if(selected&&await act({type:'link',id:selected.id,uid}))setMessage(uid?'Tag linked after confirmation.':'Tag unlinked after confirmation.')}}><Link size={16}/> Save optional tag link</button><div className="tagRecords">{state.spools.map(p=><div key={p.id}><strong>{p.name}<small>{p.code||p.id.slice(0,8)}{p.status==='archived'?' · Archived':''}</small></strong><code>{p.nfc||'No tag linked'}</code></div>)}</div></section>
    <section className="panel help"><h2>Protocol & hardware status</h2><p>ESP8266 NodeMCU + HX711: D5 = DT, D6 = SCK, 115200 baud. Each frame ends with a newline; stable and calibrated are required booleans.</p><pre>{'{"v":1,"deviceId":"DLOOP-SCALE-01","seq":123,"grossG":984.6,"stable":true,"calibrated":true}\n'}</pre><p className="hint">Readings expire after five seconds. Duplicate/out-of-order sequences and faults invalidate confirmation. A device reboot requires disconnect/reconnect. A UID is optional. Original Wi-Fi diagnostic text is not a valid frame. The guided workflow sends only explicitly confirmed strict calibration commands. Preview tare affects the display only. Live preview expires at 500 ms; inventory readings retain the existing five-second receipt limit. Physical accuracy remains unverified.</p></section>
    {message&&<div role="status" className="notice wide">{message}</div>}
  </div>;
}
