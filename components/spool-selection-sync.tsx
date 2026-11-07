import {useEffect,useRef,useState} from 'react';
import {studioApi} from '@/lib/api';
import type {ManagedSpool} from '@/lib/inventory';

export default function SpoolSelectionSync({enabled,selected,spools,select}:{enabled:boolean;selected?:ManagedSpool;spools:ManagedSpool[];select:(id:string)=>void}){
 const [receive,setReceive]=useState(false),[message,setMessage]=useState(''),[sending,setSending]=useState(false);
 const last=useRef('');
 useEffect(()=>{
  if(!enabled||!receive)return;
  let cancelled=false,timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   try{
    const {data}=await studioApi.getSpoolSelection();if(cancelled)return;
    const event=data.selection;
    if(event&&event.eventId!==last.current&&event.expiresAt>Date.now()/1000){
     const spool=spools.find(s=>s.id===event.spoolId&&s.status!=='archived');
     if(spool){last.current=event.eventId;select(spool.id);setMessage(`Received selection: ${spool.code}. Inventory unchanged.`);}
    }
   }catch(e){if(!cancelled){setMessage((e as Error).message);setReceive(false);return;}}
   if(!cancelled)timer=setTimeout(poll,3000);
  };
  void poll();return()=>{cancelled=true;clearTimeout(timer)};
 },[enabled,receive,spools,select]);
 if(!enabled)return null;
 return <section aria-label="Secure spool selection sync"><h3>Phone / PC selection sync</h3><p>Sign in to the same authenticated HTTPS studio account on both devices. Enable receiving on the PC, then explicitly send the selected spool from the phone. Selections expire after 120 seconds. No weights, tags or inventory records are changed.</p><label className="checkLabel"><input type="checkbox" checked={receive} onChange={e=>setReceive(e.target.checked)}/>Receive spool selections from my signed-in devices</label><button className="secondary" disabled={sending||!selected} onClick={async()=>{if(!selected)return;setSending(true);try{await studioApi.sendSpoolSelection(selected.id);setMessage(`Sent ${selected.code}. Inventory unchanged.`)}catch(e){setMessage((e as Error).message)}finally{setSending(false)}}}>Send selected spool to my receiving devices</button>{message&&<p role="status">{message}</p>}</section>;
}
