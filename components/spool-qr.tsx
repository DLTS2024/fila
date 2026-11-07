import {useEffect,useRef,useState} from 'react';
import type {ManagedSpool} from '@/lib/inventory';
import {parseSpoolQr,spoolQrPayload} from '@/lib/qr-spool';
import {resolveSpool,tagUrl} from '@/lib/spool-identification';
import {startSpoolCamera,type CameraControls} from '@/lib/qr-camera';
import {studioApi} from '@/lib/api';
type Props={spools:ManagedSpool[];selected?:ManagedSpool;select:(id:string)=>void;phoneOrigin?:string|null;camera?:typeof startSpoolCamera;onUnusedLabel?:(id:string)=>void;unusedOnly?:boolean;onScanStart?:()=>void};
export default function SpoolQr({spools,selected,select,phoneOrigin,camera=startSpoolCamera,onUnusedLabel,unusedOnly=false,onScanStart}:Props){
 const [text,setText]=useState(''),[message,setMessage]=useState(''),[running,setRunning]=useState(false),[image,setImage]=useState<{payload:string;src:string}|null>(null);
 const video=useRef<HTMLVideoElement>(null),controls=useRef<CameraControls|null>(null),scan=useRef(0),generation=useRef(0);
 const current=useRef({spools,select,phoneOrigin,onUnusedLabel,unusedOnly,onScanStart});current.current={spools,select,phoneOrigin,onUnusedLabel,unusedOnly,onScanStart};
 const lookup=useRef(0),cameraBusy=useRef(false);
 const url=tagUrl(phoneOrigin,selected?.tagToken),payload=selected?.qrLabelId?'DL3D:LABEL:'+selected.qrLabelId:selected?.code?spoolQrPayload(selected.code,url):null;
 const close=()=>{scan.current++;lookup.current++;controls.current?.stop();controls.current=null;const stream=video.current?.srcObject as MediaStream|null;stream?.getTracks?.().forEach(t=>t.stop());if(video.current)video.current.srcObject=null;};
 useEffect(()=>{generation.current++;setImage(null)},[payload]);
 useEffect(()=>{const hidden=()=>{if(document.hidden){close();setRunning(false)}};document.addEventListener('visibilitychange',hidden);return()=>{close();generation.current++;document.removeEventListener('visibilitychange',hidden)}},[]);
 const identify=async(value:string)=>{const request=++lookup.current;const latest=current.current;latest.onScanStart?.();const identifier=parseSpoolQr(value,[window.location.origin,...(latest.phoneOrigin?[latest.phoneOrigin]:[])]);try{
  if(identifier?.kind==='preprinted-qr'){
   const label=(await studioApi.resolveQrLabel(identifier.value)).data;if(request!==lookup.current)return false;
   if(label.state==='UNUSED'){if(current.current.onUnusedLabel){current.current.onUnusedLabel(label.id);setMessage('UNUSED label verified. No assignment has been saved.');return true;}setMessage('UNUSED label. Open Add spool and scan this label there; nothing was created.');return false;}
   const assigned=current.current.spools.find(p=>p.id===label.spoolId&&p.status!=='archived');if(!assigned){setMessage('Assigned spool is not in the current inventory. Reload stock; no spool was created.');return false;}
   if(current.current.unusedOnly){setMessage(`Already assigned to ${label.code}. Select that existing spool; a duplicate cannot be created.`);return false;}
   current.current.select(assigned.id);setMessage(`Selected ${assigned.code}. Inventory unchanged.`);return true;
  }
  const spool=identifier?resolveSpool(current.current.spools,identifier):null;if(!spool){setMessage('QR/code does not identify a unique active spool in this studio. Nothing was changed.');return false;}if(current.current.unusedOnly){setMessage('Add spool requires a registered UNUSED pre-printed QR, not an existing spool code.');return false;}current.current.select(spool.id);setMessage(`Selected ${spool.code}. Inventory unchanged.`);return true;
 }catch(e){if(request===lookup.current)setMessage((e as Error).message);return false;}};
 return <section className="spoolIdentification" aria-label="QR spool identification"><h3>QR label and camera</h3><p>QR, manual code and NFC identify the same existing spool. Scanning never creates inventory or saves weight. Camera decoding stays in this browser; images are not uploaded.</p>
 <form onSubmit={e=>{e.preventDefault();identify(text)}}><label>Scanned QR text or spool code<input maxLength={512} value={text} onChange={e=>setText(e.target.value)} autoComplete="off"/></label><button className="secondary" disabled={!text.trim()}>Select from QR text</button></form>
 <video ref={video} muted playsInline aria-label="Spool QR camera" style={{display:running?'block':'none',width:'100%',maxWidth:420}}/>
 <button className="secondary" disabled={running} onClick={async()=>{if(!video.current)return;setRunning(true);setMessage('');const request=++scan.current;try{const active=await camera(video.current,async value=>{if(scan.current!==request||cameraBusy.current)return;cameraBusy.current=true;try{if(await identify(value)){close();setRunning(false)}}finally{cameraBusy.current=false}});if(scan.current!==request)active.stop();else controls.current=active;}catch(e){if(scan.current===request){close();setRunning(false);setMessage((e as Error).message||'Camera unavailable. Paste a code instead.')}}}}>Start QR camera</button>
 <button className="secondary" disabled={!running} onClick={()=>{close();setRunning(false)}}>Stop QR camera</button>
 {payload&&<><button className="secondary" onClick={async()=>{const request=++generation.current;try{const qr=await import('qrcode');const svg=await qr.toString(payload,{type:'svg',errorCorrectionLevel:'M',margin:4,width:256});if(generation.current===request)setImage({payload,src:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)});}catch{setMessage('QR generation failed. The permanent manual code remains available.')}}}>Generate QR label</button><p>QR payload: <code>{payload}</code></p>{image?.payload===payload&&<><img width={256} height={256} src={image.src} alt={`QR label for ${selected?.code}`}/><a className="secondary" href={image.src} download={`${selected?.code}.svg`}>Download QR label</a></>}</>}
 {!url&&<p>Code-only labels work without a hosted URL. Mobile URL labels need an existing approved opaque identity and authenticated HTTPS configuration. The passwordless localhost service is not exposed to a phone.</p>}
 {message&&<p role="status" aria-live="polite">{message}</p>}</section>;
}
