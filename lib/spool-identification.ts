import type {ManagedSpool} from './inventory';
export type SpoolIdentifier={kind:'code'|'tag-token'|'hardware-uid'|'preprinted-qr';value:string};
export function resolveSpool(spools:ManagedSpool[],identifier:SpoolIdentifier):ManagedSpool|null {
  const value=identifier.value.trim();if(!value)return null;
  const matches=spools.filter(s=>s.status!=='archived'&&(identifier.kind==='code'?s.code?.toUpperCase()===value.toUpperCase():identifier.kind==='tag-token'?s.tagToken===value:identifier.kind==='preprinted-qr'?s.qrLabelId===value:s.nfc?.toUpperCase()===value.replace(/[: -]/g,'').toUpperCase()));
  return matches.length===1?matches[0]:null;
}
export interface OptionalNfcReaderAdapter {
  // Future PN532/compatible implementation supplies identifiers only. It cannot
  // create spools, claim a mass, change calibration or commit inventory.
  subscribe(listener:(identifier:SpoolIdentifier)=>void):()=>void;
}
export function tagUrl(origin:string|null|undefined,token:string|null|undefined):string|null {
  if(!origin||!token||!/^[a-f0-9]{48}$/.test(token))return null;
  try{const u=new URL(origin);if(u.protocol!=='https:'||u.origin!==origin||u.username||u.password||['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.hostname.endsWith('.localhost'))return null;return `${origin}/#/spool/${token}`;}catch{return null;}
}
export async function writePhoneTag(url:string):Promise<void> {
  const u=new URL(url);if(!tagUrl(u.origin,u.hash.replace('#/spool/',''))||!window.isSecureContext||window.location.protocol!=='https:'||window.top!==window)throw Error('An authenticated, reachable HTTPS phone deployment is required.');
  const Reader=(window as Window&{NDEFReader?:new()=>{write:(data:{records:{recordType:string;data:string}[]})=>Promise<void>}}).NDEFReader;
  if(!Reader)throw Error('Web NFC is unavailable here. Use a compatible Android browser or write the approved URL with your phone NFC writer.');
  await new Reader().write({records:[{recordType:'url',data:url}]});
}
