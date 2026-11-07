import type {InventoryState,ManagedSpool} from '@/lib/inventory';
export type LiveGrossSample={grams:number;receivedAt:number;ageMs:number;connectionId:string;baselineId:string;source:'live-preview-usb'|'live-preview-simulator'|'live-preview-wifi'};
export function effectiveSpoolTare(spool:ManagedSpool,state:InventoryState):number|null{
 // Existing spools use their saved snapshot; brand defaults seed new spools only.
 const value=spool.tareOverride??spool.tareDefault??(spool.tareKnown!==false?spool.tare:null);
 return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
}
export function remainingFilament(spool:ManagedSpool|undefined,tare:number|null,sample:LiveGrossSample|null,now:number,selectedAt:number){
 if(!spool)return {error:'Select an existing spool.',remaining:null};
 if(tare===null)return {error:'Tare Required.',remaining:null};
 if(!sample||!Number.isFinite(sample.receivedAt)||!Number.isFinite(sample.ageMs)||sample.ageMs<0||sample.receivedAt<=selectedAt||now<sample.receivedAt||now-sample.receivedAt+sample.ageMs>500)return {error:'Unavailable: wait for fresh data after selecting this spool.',remaining:null};
 const gross=sample.grams;
 if(!Number.isFinite(gross)||gross<0||gross>10000)return {error:'Invalid or implausible gross weight (0–10,000 g required).',remaining:null};
 if(gross<tare)return {error:'Gross weight is below spool tare. Remove the empty platform reading or check the load.',remaining:null};
 const net=Math.max(0,gross-tare);
 if(!Number.isFinite(spool.capacity)||(spool.capacity??0)<=0||net>spool.capacity!)return {error:'Remaining exceeds nominal capacity or capacity is unknown; verify the load.',remaining:null};
 return {error:null,remaining:net};
}
