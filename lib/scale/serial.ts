import {SCALE_BAUD_RATE,ScaleFrameParser,freshReading,type ScaleReading} from './protocol';

export interface ScalePort {
  readable:ReadableStream<Uint8Array>|null;
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
  transport:'usb'|'simulator'|null;
  reading:ScaleReading|null;
  lastReadingAt:number|null;
  message:string;
};
export function browserSerialSupport():{provider?:ScaleSerialProvider;message:string}{
  if(typeof window==='undefined'||!window.isSecureContext)return {message:'USB requires a secure browser context: use localhost or HTTPS.'};
  const provider=(navigator as Navigator&{serial?:ScaleSerialProvider}).serial;
  return provider?{provider,message:'Web Serial available. Select the scale COM port when prompted.'}:{message:'Web Serial is unavailable. Use supported desktop Chrome or Edge, or enter weight manually.'};
}

export class SerialScaleConnection {
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
  constructor(private now:()=>number=Date.now){}
  getState(){return this.state;}
  subscribe(listener:(state:ScaleState)=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener)};}
  private emit(patch:Partial<ScaleState>){this.state={...this.state,...patch};for(const listener of this.listeners)listener(this.state);}
  tick(){if(this.state.connection==='connected'&&this.state.reading&&!freshReading(this.state.reading,this.now()))this.emit({sensor:'stale'});}

  // requestPort is invoked synchronously before the first await: retain the click gesture.
  async connect(provider:ScaleSerialProvider):Promise<boolean>{return this.open(()=>provider.requestPort(),'usb');}
  async connectSimulator(port:ScalePort):Promise<boolean>{return this.open(()=>Promise.resolve(port),'simulator');}
  private async open(select:()=>Promise<ScalePort>,transport:'usb'|'simulator'):Promise<boolean>{
    if(this.opening||this.port||this.running)return false;
    this.opening=true;this.cancelled=false;
    this.emit({connection:'selecting',sensor:'waiting',reading:null,lastReadingAt:null,transport,message:''});
    try{
      const port=await select();if(this.cancelled)return false;
      this.port=port;this.emit({connection:'opening'});
      await port.open({baudRate:SCALE_BAUD_RATE});this.opened=true;
      if(this.cancelled){await this.cleanup();return false;}
      if(!port.readable)throw Error('No readable serial stream.');
      this.parser.reset();this.session=crypto.randomUUID();
      this.reader=port.readable.getReader();port.addEventListener?.('disconnect',this.onDisconnect);
      this.emit({connection:'connected',message:transport==='simulator'?'Simulator connected — these are not physical scale readings.':'USB port open; waiting for version 1 scale frames.'});
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
        for(const event of this.parser.push(value)){
          if(event.kind!=='reading'){
            this.emit({reading:null,sensor:event.kind==='fault'?'fault':'invalid',message:event.reason});continue;
          }
          const reading:ScaleReading={...event.frame,receivedAt:this.now(),connectionId:this.session,transport:this.state.transport!};
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
    this.cancelled=true;this.emit({connection:'disconnecting',reading:null,sensor:'waiting'});
    try{await this.reader?.cancel()}catch{}
    if(this.running)await this.running;
    else if(!this.opening)await this.cleanup();
    if(!this.opening&&!this.port)this.emit({connection:'disconnected',reading:null,sensor:'waiting',message:'Disconnected. Manual weight entry remains available.'});
  }
}
