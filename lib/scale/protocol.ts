export const SCALE_DEVICE_ID = 'DLOOP-SCALE-01';
export const SCALE_BAUD_RATE = 115200;
export const SCALE_STALE_MS = 5000;
export const SCALE_REVIEW_TOLERANCE_G = 0.5;
export type ScaleFrame = {v:1;deviceId:string;seq:number;grossG:number;stable:boolean;calibrated:boolean;uid?:string};
export type ScaleReading = ScaleFrame & {receivedAt:number;connectionId:string;transport:'usb'|'simulator'};
export type FrameEvent = {kind:'reading';frame:ScaleFrame}|{kind:'fault';seq:number;reason:string}|{kind:'invalid';reason:string};

export function parseScaleFrame(line:string):FrameEvent {
  try {
    if(line.length>1024)throw Error('Frame exceeds the protocol limit.');
    const v=JSON.parse(line);
    if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Expected one JSON object per line.');
    if(Object.keys(v).some(k=>!['v','deviceId','seq','grossG','stable','calibrated','uid','fault'].includes(k)))throw Error('Unsupported frame fields.');
    if(v.v!==1)throw Error('Unsupported scale protocol version; version 1 is required.');
    if(v.deviceId!==SCALE_DEVICE_ID)throw Error('Unexpected scale device ID.');
    if(!Number.isSafeInteger(v.seq)||v.seq<0||v.seq>0xffffffff)throw Error('Invalid frame sequence.');
    if(typeof v.stable!=='boolean'||typeof v.calibrated!=='boolean')throw Error('Stable and calibrated must be booleans.');
    if(v.uid!==undefined&&(typeof v.uid!=='string'||!/^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/i.test(v.uid)))throw Error('Invalid optional NFC UID.');
    if(v.fault!==undefined&&v.fault!==null){
      if(typeof v.fault!=='string'||!/^[A-Z0-9_]{1,48}$/.test(v.fault))throw Error('Invalid sensor fault status.');
      const faults:Record<string,string>={HX711_NOT_READY:'HX711 not ready',HX711_TIMEOUT:'HX711 timeout',HX711_DISCONNECTED:'HX711 disconnected',CALIBRATION_REQUIRED:'Calibration required',OUT_OF_RANGE:'Sensor out of range'};
      return {kind:'fault',seq:v.seq,reason:`Sensor fault: ${faults[v.fault]??'device reported a fault'}. Check the sensor before reviewing a new reading.`};
    }
    if(typeof v.grossG!=='number'||!Number.isFinite(v.grossG)||v.grossG<0||v.grossG>100000)throw Error('Gross weight must be a finite number from 0 to 100,000 g.');
    return {kind:'reading',frame:{v:1,deviceId:v.deviceId,seq:v.seq,grossG:Math.round(v.grossG*100)/100,stable:v.stable,calibrated:v.calibrated,...(v.uid?{uid:v.uid.toUpperCase()}: {})}};
  }catch(e){return {kind:'invalid',reason:e instanceof SyntaxError?'Malformed JSON or non-protocol serial output.':(e as Error).message};}
}

// A bounded line framer preserves UTF-8 and JSON across arbitrary USB chunks.
export class ScaleFrameParser {
  private decoder=new TextDecoder('utf-8',{fatal:true});
  private line='';
  private dropping=false;
  private lastSequence=-1;
  reset(){this.decoder=new TextDecoder('utf-8',{fatal:true});this.line='';this.dropping=false;this.lastSequence=-1;}
  push(bytes:Uint8Array):FrameEvent[]{
    let text:string;
    try{text=this.decoder.decode(bytes,{stream:true});}
    catch{this.line='';this.dropping=true;this.decoder=new TextDecoder('utf-8',{fatal:true});return [{kind:'invalid',reason:'Invalid UTF-8 serial data. Waiting for the next complete line.'}];}
    const events:FrameEvent[]=[];
    for(const char of text){
      if(char==='\n'){
        if(this.dropping){this.dropping=false;this.line='';continue;}
        const line=this.line.trim();this.line='';if(!line)continue;
        const event=parseScaleFrame(line);
        if(event.kind==='reading'||event.kind==='fault'){
          const seq=event.kind==='reading'?event.frame.seq:event.seq;
          if(seq<=this.lastSequence){events.push({kind:'invalid',reason:'Duplicate or out-of-order frame. Reconnect after a device restart.'});continue;}
          this.lastSequence=seq;
        }
        events.push(event);
      }else if(!this.dropping){
        this.line+=char;
        if(this.line.length>1024){this.line='';this.dropping=true;events.push({kind:'invalid',reason:'Serial line exceeds 1,024 characters; discarding through the newline.'});}
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
