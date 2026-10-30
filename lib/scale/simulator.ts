import type {ScalePort} from './serial';
import {SCALE_DEVICE_ID} from './protocol';
export type SimulatorSample={grossG:number;stable:boolean;calibrated:boolean;fault:boolean;paused:boolean};
export class SimulatedScalePort implements ScalePort {
  readable:ReadableStream<Uint8Array>|null=null;
  private controller:ReadableStreamDefaultController<Uint8Array>|null=null;
  private timer:ReturnType<typeof setInterval>|null=null;
  private sequence=0;
  private sample:SimulatorSample={grossG:984.6,stable:true,calibrated:true,fault:false,paused:false};
  setSample(sample:Partial<SimulatorSample>){this.sample={...this.sample,...sample};}
  async open({baudRate}:{baudRate:number}){
    if(baudRate!==115200||this.readable)throw Error('Invalid simulator open.');
    this.sequence=0;
    this.readable=new ReadableStream<Uint8Array>({start:c=>{this.controller=c;},cancel:()=>{this.stop();this.controller=null;}});
    this.timer=setInterval(()=>this.send(),500);
  }
  send(){
    if(this.sample.paused)return;
    this.inject(JSON.stringify({v:1,deviceId:SCALE_DEVICE_ID,seq:++this.sequence,grossG:this.sample.fault?null:this.sample.grossG,stable:this.sample.stable,calibrated:this.sample.calibrated,...(this.sample.fault?{fault:'HX711_NOT_READY'}:{})})+'\n');
  }
  inject(text:string){if(this.controller)this.controller.enqueue(new TextEncoder().encode(text));}
  private stop(){if(this.timer!==null){clearInterval(this.timer);this.timer=null;}}
  async close(){this.stop();try{this.controller?.close()}catch{}this.controller=null;this.readable=null;}
}
