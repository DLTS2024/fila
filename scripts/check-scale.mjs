import './test-typescript-loader.mjs';
import assert from 'node:assert/strict';
const {ScaleFrameParser,parseScaleFrame,freshReading,eligibleReading,scaleConfirmationKey}=await import('../lib/scale/protocol.ts');
const {SerialScaleConnection,browserSerialSupport}=await import('../lib/scale/serial.ts');
const {SimulatedScalePort}=await import('../lib/scale/simulator.ts');
const encoder=new TextEncoder();
const frame=(seq=1,extra={})=>({v:1,deviceId:'DLOOP-SCALE-01',seq,grossG:984.6,stable:true,calibrated:true,...extra});
const bytes=v=>encoder.encode(JSON.stringify(v)+'\n');
let checks=0;
function check(ok,label){assert(ok,label);checks++;}
const parser=new ScaleFrameParser(),wire=bytes(frame());
for(let i=0;i<wire.length-1;i++)check(parser.push(wire.subarray(i,i+1)).length===0,'Partial frame cannot produce a reading');
let events=parser.push(wire.subarray(wire.length-1));check(events.length===1&&events[0].kind==='reading','Fragmented frame');check(events[0].frame.uid===undefined,'NFC optional');
events=parser.push(encoder.encode(JSON.stringify(frame(2))+'\r\n'+JSON.stringify(frame(3,{stable:false}))+'\n'));check(events.length===2&&events[1].frame.stable===false,'Multiple/CRLF frames');
check(parser.push(bytes(frame(3)))[0].kind==='invalid','Duplicate rejected');check(parser.push(bytes(frame(1)))[0].kind==='invalid','Out-of-order rejected');
parser.reset();check(parser.push(bytes(frame(0)))[0].kind==='reading','Reconnect resets sequence');
for(const value of [frame(1,{v:2}),frame(1,{v:'1'}),frame(1,{deviceId:'OTHER'}),frame(1,{grossG:'984.6'}),frame(1,{grossG:-1}),frame(1,{grossG:100001}),frame(1,{grossG:null}),frame(1,{stable:'true'}),frame(1,{calibrated:1}),frame(1,{seq:1.5}),frame(1,{seq:-1}),frame(1,{seq:4294967296}),frame(1,{uid:'bad'}),frame(1,{secret:'not-logged'}),[],null])check(parseScaleFrame(JSON.stringify(value)).kind==='invalid','Invalid fields rejected');
for(const value of ['not json','{"grossG":NaN}','{"grossG":Infinity}','{"v":1,"stable","calibrated"}'])check(parseScaleFrame(value).kind==='invalid','Malformed/non-numeric JSON rejected');
check(parseScaleFrame(JSON.stringify(frame(1,{grossG:0}))).kind==='reading','Zero gross valid');
check(parseScaleFrame(JSON.stringify(frame(1,{uid:'04A1B2C3D4E5F6'}))).kind==='reading','Optional UID accepted');
check(parseScaleFrame(JSON.stringify(frame(1,{fault:'HX711_TIMEOUT',grossG:null}))).kind==='fault','Sensor fault is not a measurement');
check(!parseScaleFrame(JSON.stringify(frame(1,{fault:'PRIVATE_CREDENTIAL'}))).reason.includes('PRIVATE_CREDENTIAL'),'Raw fault values are not echoed');
parser.reset();events=parser.push(encoder.encode('x'.repeat(3000)+'\n'+JSON.stringify(frame(5))+'\n'));check(events[0].kind==='invalid'&&events.at(-1).kind==='reading','Oversized line recovery');
parser.reset();check(parser.push(new Uint8Array([255,10]))[0].kind==='invalid','Invalid UTF-8 rejected');parser.push(encoder.encode('\n'));check(parser.push(bytes(frame(1)))[0].kind==='reading','UTF-8 recovery');
const sample={...frame(),connectionId:crypto.randomUUID(),receivedAt:10000,transport:'usb'};
check(eligibleReading(sample,15000),'Freshness boundary');check(!freshReading(sample,15001),'Stale reading');check(!freshReading(sample,9999),'Clock reversal/future receipt');
check(!eligibleReading({...sample,stable:false},10000),'Unstable');check(!eligibleReading({...sample,calibrated:false},10000),'Uncalibrated');check(scaleConfirmationKey(sample).length<=100,'Stable key fits API');

class MockPort {
 readable=null;stream=null;controller=null;opens=0;closes=0;listeners=new Set();failClose=false;failOpen=false;
 async open(options){assert.equal(options.baudRate,115200);this.opens++;if(this.failOpen)throw Error('busy');this.readable=this.stream=new ReadableStream({start:c=>this.controller=c});}
 async close(){this.closes++;if(this.failClose){this.failClose=false;throw Error('cleanup failure');}try{this.controller?.close()}catch{}this.readable=null;this.controller=null;}
 addEventListener(type,f){this.listeners.add(f)}removeEventListener(type,f){this.listeners.delete(f)}
 send(v){this.controller.enqueue(bytes(v))}
 unplug(){this.controller.error(Error('removed'));for(const f of this.listeners)f(new Event('disconnect'));}
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
let now=Date.now();const manager=new SerialScaleConnection(()=>now),port=new MockPort();let selections=0;
const opened=manager.connect({requestPort:()=>{selections++;return Promise.resolve(port)}});check(selections===1,'Port chooser invoked synchronously from click');check(await opened,'Connect');
check(!await manager.connect({requestPort:()=>Promise.resolve(port)}),'No concurrent connect');port.send(frame());await flush();check(manager.getState().sensor==='ready','Live stable reading');const firstConnection=manager.getState().reading.connectionId;
port.send(frame(2,{stable:false}));await flush();check(manager.getState().sensor==='unstable','Live unstable status');
port.send(frame(3,{calibrated:false}));await flush();check(manager.getState().sensor==='uncalibrated','Calibration status');
port.send(frame(4,{grossG:null,fault:'HX711_NOT_READY'}));await flush();check(manager.getState().sensor==='fault'&&manager.getState().reading===null,'Fault invalidates last valid sample');
port.send(frame(5));await flush();now+=5001;manager.tick();check(manager.getState().sensor==='stale','Clock-based stale state');
await manager.disconnect();check(port.closes===1&&!port.stream.locked&&port.listeners.size===0,'Reader/port/listener cleanup');check(manager.getState().reading===null,'Disconnect invalidates measurement');
await manager.connect({requestPort:()=>Promise.resolve(port)});port.send(frame(0));await flush();check(manager.getState().reading.connectionId!==firstConnection,'Reconnect uses new identity');
port.unplug();await flush();await flush();check(manager.getState().connection==='disconnected'&&port.closes===2&&!port.stream.locked,'Unplug cleanup');
const cancelled=new SerialScaleConnection();check(!await cancelled.connect({requestPort:()=>Promise.reject(new DOMException('cancel','NotFoundError'))}),'Cancelled chooser');check(cancelled.getState().connection==='disconnected','Cancellation status');
let choose;const pending=new SerialScaleConnection();const selecting=pending.connect({requestPort:()=>new Promise(resolve=>choose=resolve)});await pending.disconnect();const late=new MockPort();choose(late);await selecting;check(late.opens===0,'Disconnect/unmount during chooser never opens late port');
const slow=new MockPort();let finishOpen;slow.open=async()=>{slow.opens++;await new Promise(resolve=>finishOpen=resolve);slow.readable=slow.stream=new ReadableStream({start:c=>slow.controller=c});};
const openingManager=new SerialScaleConnection();const pendingOpen=openingManager.connect({requestPort:()=>Promise.resolve(slow)});await flush();await openingManager.disconnect();finishOpen();await pendingOpen;check(slow.closes===1,'Disconnect during open closes late-owned port');
const failPort=new MockPort();failPort.failOpen=true;const failed=new SerialScaleConnection();check(!await failed.connect({requestPort:()=>Promise.resolve(failPort)}),'Open failure handled');check(failPort.closes===0,'Do not close an unowned/already busy port');
const cleanupPort=new MockPort(),cleanupManager=new SerialScaleConnection();await cleanupManager.connect({requestPort:()=>Promise.resolve(cleanupPort)});cleanupPort.failClose=true;await cleanupManager.disconnect();check(cleanupManager.getState().connection==='error','Close failure visible');await cleanupManager.disconnect();check(cleanupPort.closes===2&&cleanupManager.getState().connection==='disconnected','Cleanup can be retried');
const simulator=new SimulatedScalePort(),simManager=new SerialScaleConnection();await simManager.connectSimulator(simulator);simulator.send();await flush();check(simManager.getState().reading.transport==='simulator','Simulator passes through same stream/parser');await simManager.disconnect();check(simulator.readable===null,'Simulator timer/stream cleanup');
const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
try{Object.defineProperty(globalThis,'window',{value:{isSecureContext:false},configurable:true});check(!browserSerialSupport().provider,'Insecure context blocked');Object.defineProperty(globalThis,'window',{value:{isSecureContext:true},configurable:true});Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});check(!browserSerialSupport().provider,'Unsupported browser fallback');Object.defineProperty(globalThis,'navigator',{value:{serial:{requestPort(){}}},configurable:true});check(!!browserSerialSupport().provider,'Secure browser support detected');}finally{if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else delete globalThis.window;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;}
console.log(`PASS: ${checks} USB parser, freshness, fault, support, simulator and owned connection lifecycle checks. No hardware or inventory API used.`);
