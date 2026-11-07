export const SCALE_DEVICE_ID = 'DLOOP-SCALE-01';
export const SCALE_BAUD_RATE = 115200;
export const SCALE_STALE_MS = 5000;
export const SCALE_REVIEW_TOLERANCE_G = 0.5;
export const APPROXIMATE_REVIEW_TOLERANCE_G = 2;
export type ScaleFrame = {v:1;deviceId:string;seq:number;grossG:number;stable:boolean;calibrated:boolean;uid?:string;mode?:'APPROXIMATE'};
export type ScaleReading = ScaleFrame & {receivedAt:number;connectionId:string;transport:'usb'|'simulator'};
export type LivePreview = {raw:number|null;grams:number|null;ageMs:number;calibrated:boolean;strictStable:boolean;hold:number;pending:number;stage:'EMPTY'|'LOAD'|'VERIFY'|'ACCEPT'|'DONE'|'STRICT_REQUIRED';spike:boolean};
export type PreviewReading = LivePreview & {receivedAt:number;connectionId:string};
export type FrameEvent = ({kind:'reading';frame:ScaleFrame}|{kind:'fault';seq:number;reason:string}) & {live?:LivePreview} | {kind:'invalid';reason:string};
function parseLive(v:unknown):LivePreview|undefined {
  if(v===undefined)return undefined;
  if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid live preview.');
  const p=v as LivePreview;
  if(Object.keys(p).sort().join(',')!=='ageMs,calibrated,grams,hold,pending,raw,spike,stage,strictStable'||
    ![p.calibrated,p.strictStable,p.spike].every(x=>typeof x==='boolean')||
    !Number.isInteger(p.ageMs)||p.ageMs<0||p.ageMs>0xffffffff||
    !Number.isInteger(p.hold)||p.hold<0||p.hold>4||!Number.isInteger(p.pending)||p.pending<0||p.pending>15||
    !['EMPTY','LOAD','VERIFY','ACCEPT','DONE','STRICT_REQUIRED'].includes(p.stage)||
    !(p.raw===null||typeof p.raw==='number'&&Number.isFinite(p.raw)&&Math.abs(p.raw)<8388600)||
    !(p.grams===null||typeof p.grams==='number'&&Number.isFinite(p.grams)&&Math.abs(p.grams)<=100000)||
    (!p.calibrated&&p.grams!==null)|| (p.ageMs>500&&(p.raw!==null||p.grams!==null))||
    (p.grams!==null&&p.raw===null))throw Error('Invalid or unsafe live preview.');
  return p;
}
export function reviewToleranceG(reading:ScaleReading):number {
  return reading.mode==='APPROXIMATE'?APPROXIMATE_REVIEW_TOLERANCE_G:SCALE_REVIEW_TOLERANCE_G;
}

export function parseScaleFrame(line:string):FrameEvent {
  try {
    if(line.length>1024)throw Error('Frame exceeds the protocol limit.');
    const v=JSON.parse(line);
    if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Expected one JSON object per line.');
    if(Object.keys(v).some(k=>!['v','deviceId','seq','grossG','stable','calibrated','uid','fault','mode','live'].includes(k)))throw Error('Unsupported frame fields.');
    const live=parseLive(v.live);
    if(live?.calibrated&&(!v.calibrated||v.mode==='APPROXIMATE'))throw Error('Inconsistent preview calibration.');
    if(v.mode!==undefined&&v.mode!=='APPROXIMATE')throw Error('Unsupported weighing mode.');
    if(v.v!==1)throw Error('Unsupported scale protocol version; version 1 is required.');
    if(v.deviceId!==SCALE_DEVICE_ID)throw Error('Unexpected scale device ID.');
    if(!Number.isSafeInteger(v.seq)||v.seq<0||v.seq>0xffffffff)throw Error('Invalid frame sequence.');
    if(typeof v.stable!=='boolean'||typeof v.calibrated!=='boolean')throw Error('Stable and calibrated must be booleans.');
    if(v.uid!==undefined&&(typeof v.uid!=='string'||!/^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/i.test(v.uid)))throw Error('Invalid optional NFC UID.');
    if(v.fault!==undefined&&v.fault!==null){
      if(typeof v.fault!=='string'||!/^[A-Z0-9_]{1,48}$/.test(v.fault))throw Error('Invalid sensor fault status.');
      const faults:Record<string,string>={HX711_NOT_READY:'HX711 not ready',HX711_TIMEOUT:'HX711 timeout',HX711_DISCONNECTED:'HX711 disconnected',CALIBRATION_REQUIRED:'Calibration required',OUT_OF_RANGE:'Sensor out of range',NOT_READY:'NOT_READY: weight is still settling or drifting',REFERENCE_REQUIRED:'APPROXIMATE: verify a real 1000 g reference before weighing'};
      const calibrationFaults:Record<string,string>={ZERO_UNSTABLE:'Empty platform has not passed strict hold',CALIBRATION_UNSTABLE:'Reference has not passed strict calibration gates',VERIFICATION_FAILED:'Different-reference verification failed or expired',STORAGE_ERROR:'Calibration storage failed',COMMAND_REJECTED:'Calibration command rejected'};
      return {kind:'fault',seq:v.seq,live,reason:`Sensor fault: ${faults[v.fault]??calibrationFaults[v.fault]??'device reported a fault'}. Check the sensor before reviewing a new reading.`};
    }
    if(typeof v.grossG!=='number'||!Number.isFinite(v.grossG)||v.grossG<0||v.grossG>100000)throw Error('Gross weight must be a finite number from 0 to 100,000 g.');
    return {kind:'reading',live,frame:{v:1,deviceId:v.deviceId,seq:v.seq,grossG:Math.round(v.grossG*100)/100,stable:v.stable,calibrated:v.calibrated,...(v.uid?{uid:v.uid.toUpperCase()}: {}),...(v.mode?{mode:v.mode}: {})}};
  }catch(e){return {kind:'invalid',reason:e instanceof SyntaxError?'Malformed JSON or non-protocol serial output.':(e as Error).message};}
}

// A bounded line framer preserves UTF-8 and JSON across arbitrary USB chunks.
export class ScaleFrameParser {
  private decoder=new TextDecoder('utf-8',{fatal:true});
  private line='';
  private dropping=false;
  private lastSequence=-1;
  private monitor=false;
  private stats={bytes:0,lines:0,frames:0,debugLines:0,rejected:0,lastLine:'',lastError:''};
  diagnostics(){return {...this.stats};}
  reset(){this.decoder=new TextDecoder('utf-8',{fatal:true});this.line='';this.dropping=false;this.monitor=false;this.lastSequence=-1;this.stats={bytes:0,lines:0,frames:0,debugLines:0,rejected:0,lastLine:'',lastError:''};}
  push(bytes:Uint8Array):FrameEvent[]{
    this.stats.bytes+=bytes.byteLength;
    let text:string;
    try{text=this.decoder.decode(bytes,{stream:true});}
    catch{this.line='';this.dropping=true;this.monitor=false;this.stats.rejected++;this.stats.lastError='Invalid UTF-8 serial data.';this.decoder=new TextDecoder('utf-8',{fatal:true});return [{kind:'invalid',reason:'Invalid UTF-8 serial data. Waiting for the next complete line.'}];}
    const events:FrameEvent[]=[];
    for(const char of text){
      if(char==='\n'){
        this.stats.lines++;
        if(this.monitor){this.stats.debugLines++;this.stats.lastLine=this.line.slice(0,240);this.monitor=false;this.dropping=false;this.line='';continue;}
        if(this.dropping){this.dropping=false;this.line='';continue;}
        const line=this.line.trim();this.line='';if(!line)continue;
        this.stats.lastLine=line.slice(0,240);
        const event=parseScaleFrame(line);
        if(event.kind==='reading'||event.kind==='fault'){
          const seq=event.kind==='reading'?event.frame.seq:event.seq;
          if(seq<=this.lastSequence){this.stats.rejected++;this.stats.lastError='Duplicate or out-of-order frame. Reconnect after a device restart.';events.push({kind:'invalid',reason:this.stats.lastError});continue;}
          this.lastSequence=seq;
          this.stats.frames++;
        }
        if(event.kind==='invalid'){this.stats.rejected++;this.stats.lastError=event.reason;}
        events.push(event);
      }else if(!this.dropping){
        this.line+=char;
        // Known monitor lines are not measurements. Ignore their bounded content
        // without invalidating fresh JSON or relaxing any protocol validation.
        if(this.line.startsWith('#DEBUG ')&&this.line.length>=240){this.monitor=true;this.dropping=true;}
        else if(this.line.length>1024){this.line='';this.dropping=true;this.stats.rejected++;this.stats.lastError='Serial line exceeds 1,024 characters; discarding through the newline.';events.push({kind:'invalid',reason:this.stats.lastError});}
        else if(this.line==='#DEBUG ')this.monitor=true;
      }
    }
    return events;
  }
}

export function freshReading(reading:ScaleReading|null,now=Date.now()):reading is ScaleReading {
  return !!reading&&now>=reading.receivedAt&&now-reading.receivedAt<=SCALE_STALE_MS;
}
export function eligibleReading(reading:ScaleReading|null,now=Date.now()):reading is ScaleReading {
  return freshReading(reading,now)&&reading.stable&&reading.calibrated;
}
export function frameIdentity(reading:ScaleReading):string{return `${reading.connectionId}_${reading.deviceId}_${reading.seq}`;}
export function scaleConfirmationKey(reading:ScaleReading):string{return `scale_${frameIdentity(reading)}`;}
