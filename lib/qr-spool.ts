import type {SpoolIdentifier} from './spool-identification';
export function spoolQrPayload(code:string,url?:string|null):string{return url??`DL3D:SPOOL:${code}`;}
export function parseSpoolQr(text:string,allowedOrigins:string[]):SpoolIdentifier|null{
 const value=text.trim();if(!value||value.length>512)return null;
 const label=value.match(/^(?:DL3D:LABEL:|QL-)([a-f0-9]{32})$/i);if(label)return {kind:'preprinted-qr',value:label[1].toLowerCase()};
 const code=value.replace(/^DL3D:SPOOL:/i,'');
 if(/^[A-Z0-9][A-Z0-9_-]{1,99}$/i.test(code))return {kind:'code',value:code};
 try{const u=new URL(value);const token=u.hash.match(/^#\/spool\/([a-f0-9]{48})$/);if(u.protocol==='https:'&&allowedOrigins.includes(u.origin)&&!u.username&&!u.password&&!u.search&&u.pathname==='/'&&token)return {kind:'tag-token',value:token[1]};}catch{}
 return null;
}
