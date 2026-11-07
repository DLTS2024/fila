// Server-side only. Never import from browser components.
export function localRequestAllowed(address:string|undefined,headers:Record<string,string|string[]|undefined>,origins:string[]):boolean {
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address??''))return false;
  const host=headers.host;
  if(typeof host!=='string'||!/^(localhost|127\.0\.0\.1|\[::1\])(?::([1-9][0-9]{0,4}))?$/.test(host))return false;
  const port=host.match(/:(\d+)$/)?.[1];if(port&&Number(port)>65535)return false;
  for(const key of ['forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-real-ip'])if(headers[key]!==undefined)return false;
  if(headers['sec-fetch-site']!==undefined&&!['none','same-origin'].includes(String(headers['sec-fetch-site'])))return false;
  if(headers.origin!==undefined&&!origins.includes(String(headers.origin)))return false;
  if(headers.referer!==undefined){try{if(!origins.includes(new URL(String(headers.referer)).origin))return false;}catch{return false;}}
  return true;
}
