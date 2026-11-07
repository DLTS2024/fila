import {SCALE_BAUD_RATE,ScaleFrameParser,parseScaleFrame,freshReading,type ScaleReading,type PreviewReading} from './protocol';
import {wifiResponseAllowance,type WifiSnapshotTiming} from './wifi-timing';
import {parseObservation,type ReceivedObservation} from './manual-observation';

export interface ScalePort {
  readable:ReadableStream<Uint8Array>|null;
  writable?:WritableStream<Uint8Array>|null;
  open(options:{baudRate:number}):Promise<void>;
  close():Promise<void>;
  addEventListener?(type:string,listener:EventListener):void;
  removeEventListener?(type:string,listener:EventListener):void;
}
export interface ScaleSerialProvider {
  requestPort():Promise<ScalePort>;
}
export type ScaleState = {
  connection:'disconnected'|'selecting'|'opening'|'connected'|'disconnecting'|'error';
  sensor:'waiting'|'ready'|'unstable'|'uncalibrated'|'fault'|'invalid'|'stale';
  transport:'usb'|'simulator'|'wifi'|null;
  reading:ScaleReading|null;
  preview?:PreviewReading|null;
  wifiObservation?:ReceivedObservation|null;
  lastReadingAt:number|null;
  message:string;
  serialDiagnostics?:{bytes:number;lines:number;frames:number;debugLines:number;rejected:number;lastLine:string;lastError:string};
};
export function browserSerialSupport():{provider?:ScaleSerialProvider;message:string}{
  if(typeof window==='undefined'||!window.isSecureContext)return {message:'USB requires a secure browser context: use localhost or HTTPS.'};
  const provider=(navigator as Navigator&{serial?:ScaleSerialProvider}).serial;
  return provider?{provider,message:'Web Serial available. Select the scale COM port when prompted.'}:{message:'Web Serial is unavailable. Use supported desktop Chrome or Edge, or enter weight manually.'};
}

export class SerialScaleConnection {
  private writing=false;
  private state:ScaleState={connection:'disconnected',sensor:'waiting',transport:null,reading:null,lastReadingAt:null,message:''};
  private listeners=new Set<(state:ScaleState)=>void>();
  private parser=new ScaleFrameParser();
  private port:ScalePort|null=null;
  private reader:ReadableStreamDefaultReader<Uint8Array>|null=null;
  private running:Promise<void>|null=null;
  private opening=false;
  private cancelled=false;
  private opened=false;
  private session='';
  private wifiFrameKey='';
  private wifiFrameReceivedAt=0;
  constructor(private now:()=>number=Date.now){}
  getState(){return this.state;}
  // API preview only. A network packet never becomes a verified inventory reading.
  ingestWifi(data:{configured?:boolean;online?:boolean;observation?:unknown;timing?:WifiSnapshotTiming;reading?:null|{frame:unknown;bootId:string;receivedAtMs:number;ageMs:number}},roundTripMs=0){
    const previous=this.state.wifiObservation;
    this.state={...this.state,wifiObservation:previous?{...previous,usable:false}:null};
    if(!data.online||!data.reading){this.emit({connection:'disconnected',transport:'wifi',reading:null,preview:null,sensor:'waiting',message:data.configured?'Wi-Fi scale offline.':'Wi-Fi scale not configured; USB remains available.'});return;}
    if(this.state.connection!=='connected'){this.session=crypto.randomUUID();this.wifiFrameKey='';}
    const event=parseScaleFrame(JSON.stringify(data.reading.frame));
    if(event.kind==='invalid'){this.emit({connection:'connected',transport:'wifi',reading:null,preview:null,sensor:'invalid',message:event.reason});return;}
    const seq=event.kind==='reading'?event.frame.seq:event.seq;
    const key=`${data.reading.bootId}-${seq}`;
    const observation=parseObservation(data.observation);
    if(observation&&observation.seq===seq&&observation.raw!==null&&observation.usable){
      const connectionId=`wifi-${data.reading.bootId}-${this.session}`;
      this.state.wifiObservation=previous?.seq===seq&&previous.connectionId===connectionId?{...previous,usable:true}:
       {...observation,sampleAgeMs:Math.min(0xffffffff,observation.sampleAgeMs+wifiResponseAllowance(roundTripMs,data.timing)),arrivedAt:this.now(),connectionId};
    }
    if(key!==this.wifiFrameKey){this.wifiFrameKey=key;this.wifiFrameReceivedAt=this.now()-Math.max(0,data.reading.ageMs)-wifiResponseAllowance(roundTripMs,data.timing);}
    // Re-polling the same stored packet must not look like a new sample after
    // spool selection, or refresh its age. Preserve its mapped receipt time.
    const preview=event.live?{...event.live,ageMs:Math.min(4294967295,Math.max(0,event.live.ageMs-data.reading.ageMs)),receivedAt:this.wifiFrameReceivedAt,connectionId:`wifi-${data.reading.bootId}-${this.session}`}:null;
    this.emit({connection:'connected',transport:'wifi',reading:null,preview,lastReadingAt:data.reading.receivedAtMs,sensor:event.kind==='fault'?'fault':preview?.raw===null?'stale':'uncalibrated',message:event.kind==='fault'?event.reason:'Wi-Fi live preview received; manual estimates require review.'});
  }
  wifiFailure(){this.emit({connection:'disconnected',transport:'wifi',reading:null,preview:null,wifiObservation:this.state.wifiObservation?{...this.state.wifiObservation,usable:false}:null,sensor:'stale',message:'Wi-Fi API unavailable or session expired. No inventory was changed.'});}
  subscribe(listener:(state:ScaleState)=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener)};}
  private emit(patch:Partial<ScaleState>){this.state={...this.state,...patch};for(const listener of this.listeners)listener(this.state);}
  tick(){const p=this.state.preview;const expired=p&&(this.now()<p.receivedAt||this.now()-p.receivedAt+p.ageMs>500);if(this.state.connection==='connected'&&this.state.reading&&(!freshReading(this.state.reading,this.now())||expired))this.emit({sensor:'stale'});}
  async command(command:string):Promise<void>{
    if(!/^(MODE STRICT|ZERO EMPTY|ACCEPT|CAL (?:\d+(?:\.\d{1,2})?)|VERIFY (?:\d+(?:\.\d{1,2})?))$/.test(command))throw Error('Unsupported scale command.');
    const preview=this.state.preview;
    if(this.writing||this.state.connection!=='connected'||this.state.transport!=='usb'||!this.port?.writable||!preview||preview.raw===null||this.now()<preview.receivedAt||this.now()-preview.receivedAt+preview.ageMs>500)throw Error('Connect a compatible, fresh USB scale before sending commands.');
    const port=this.port,writer=port.writable!.getWriter();this.writing=true;
    this.session=crypto.randomUUID(); // Frozen inventory reviews cannot survive a calibration command.
    // Invalidate any inventory review immediately, before the board responds.
    this.emit({reading:null,preview:null,sensor:'waiting'});
    try{await writer.write(new TextEncoder().encode(command+'\n'));}
    finally{writer.releaseLock();this.writing=false;}
  }

  // requestPort is invoked synchronously before the first await: retain the click gesture.
  async connect(provider:ScaleSerialProvider):Promise<boolean>{return this.open(()=>provider.requestPort(),'usb');}
  async connectSimulator(port:ScalePort):Promise<boolean>{return this.open(()=>Promise.resolve(port),'simulator');}
  private async open(select:()=>Promise<ScalePort>,transport:'usb'|'simulator'):Promise<boolean>{
    if(this.opening||this.port||this.running)return false;
    this.opening=true;this.cancelled=false;
    this.emit({connection:'selecting',sensor:'waiting',reading:null,preview:null,lastReadingAt:null,transport,message:''});
    try{
      const port=await select();if(this.cancelled)return false;
      this.port=port;this.emit({connection:'opening'});
      await port.open({baudRate:SCALE_BAUD_RATE});this.opened=true;
      if(this.cancelled){await this.cleanup();return false;}
      if(!port.readable)throw Error('No readable serial stream.');
      this.parser.reset();this.session=crypto.randomUUID();
      this.reader=port.readable.getReader();port.addEventListener?.('disconnect',this.onDisconnect);
      this.emit({connection:'connected',serialDiagnostics:this.parser.diagnostics(),message:transport==='simulator'?'Simulator connected — these are not physical scale readings.':'USB port open; waiting for version 1 scale frames.'});
      this.running=this.read();return true;
    }catch(e){
      await this.cleanup();
      if(!this.cancelled&&!this.port)this.emit({connection:(e as Error).name==='NotFoundError'?'disconnected':'error',sensor:'waiting',reading:null,message:(e as Error).name==='NotFoundError'?'COM port selection cancelled.':'Unable to open the scale. Check browser permission and close Arduino Serial Monitor or other port users.'});
      return false;
    }finally{this.opening=false;if(this.cancelled&&!this.port)this.emit({connection:'disconnected',sensor:'waiting',reading:null});}
  }
  private onDisconnect:EventListener=()=>{void this.disconnect();};
  private async read():Promise<void>{
    try{
      while(!this.cancelled&&this.reader){
        const {done,value}=await this.reader.read();if(done)break;if(this.cancelled)break;
        const events=this.parser.push(value);
        this.emit({serialDiagnostics:this.parser.diagnostics()});
        for(const event of events){
          this.emit({preview:event.kind!=='invalid'&&event.live?{...event.live,receivedAt:this.now(),connectionId:this.session}:null});
          if(event.kind!=='reading'){
            this.emit({reading:null,sensor:event.kind==='fault'?'fault':'invalid',message:event.reason});continue;
          }
          const reading:ScaleReading={...event.frame,receivedAt:this.now(),connectionId:this.session,transport:this.state.transport==='simulator'?'simulator':'usb'};
          this.emit({reading,lastReadingAt:reading.receivedAt,sensor:!reading.calibrated?'uncalibrated':!reading.stable?'unstable':'ready',message:''});
        }
      }
      if(!this.cancelled)this.emit({message:'Serial stream ended. Reconnect to receive new readings.'});
    }catch{if(!this.cancelled)this.emit({message:'Serial connection lost. Reconnect the USB scale.'});}
    finally{await this.cleanup();this.running=null;if(!this.port)this.emit({connection:'disconnected',sensor:'waiting',reading:null});}
  }
  private async cleanup(){
    if(this.reader){try{this.reader.releaseLock()}catch{}this.reader=null;}
    const port=this.port;if(!port)return;
    port.removeEventListener?.('disconnect',this.onDisconnect);
    if(this.opened){try{await port.close();}catch{this.emit({connection:'error',sensor:'waiting',reading:null,message:'Port cleanup failed. Disconnect again before reconnecting.'});return;}}
    this.port=null;this.opened=false;this.parser.reset();
  }
  async disconnect():Promise<void>{
    this.cancelled=true;this.emit({connection:'disconnecting',reading:null,preview:null,sensor:'waiting'});
    try{await this.reader?.cancel()}catch{}
    if(this.running)await this.running;
    else if(!this.opening)await this.cleanup();
    if(!this.opening&&!this.port)this.emit({connection:'disconnected',reading:null,sensor:'waiting',message:'Disconnected. Manual weight entry remains available.'});
  }
}
