// Component tests in jsdom, not a real-browser or visual-layout test.
import { JSDOM } from 'jsdom';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost:5173'});
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Node']) {
  Object.defineProperty(globalThis, name, {value: dom.window[name], configurable: true});
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base = specifier.startsWith('@/') ? new URL('../' + specifier.slice(2), import.meta.url) : new URL(specifier, context.parentURL);
      for (const suffix of ['', '.ts', '.tsx']) {
        if (/\.tsx?$/.test(base.pathname + suffix) && existsSync(fileURLToPath(base) + suffix)) {
          return {url: pathToFileURL(fileURLToPath(base) + suffix).href, shortCircuit: true};
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (/\.tsx?$/.test(url)) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText,
    };
    return nextLoad(url, context);
  },
});
const React=await import('react');
const {render,screen,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react');
const {default:Connections}=await import('../app/connections.tsx');
const {SerialScaleConnection}=await import('../lib/scale/serial.ts');
const fixture={spools:[{id:'00000000-0000-4000-8000-000000000001',code:'PLA_BLACK_01',version:1,name:'Untagged roll',brand:'Test',material:'PLA',color:'#222222',initial:1000,remaining:800,tare:220,tareKnown:true,location:'Shelf',measured:false,status:'active',nfc:''}],history:[],slots:{}};
let choose=0,clock=Date.now(),port;
class MockPort{
 readable=null;controller=null;stream=null;closes=0;writable=null;writes=[];
 async open({baudRate}){assert.equal(baudRate,115200);this.readable=this.stream=new ReadableStream({start:c=>this.controller=c});this.writable=new WritableStream({write:b=>this.writes.push(new TextDecoder().decode(b))});}
 async close(){this.closes++;try{this.controller?.close()}catch{}this.readable=null;this.controller=null;}
 send(frame){this.controller.enqueue(new TextEncoder().encode(JSON.stringify(frame)+'\n'));}
}
Object.defineProperty(window,'isSecureContext',{value:true,configurable:true});
Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>{choose++;port=new MockPort();return port}},configurable:true});
const manager=new SerialScaleConnection(()=>clock);
let calls=[],resolveSave;
const save=a=>{calls.push(a);return new Promise(resolve=>resolveSave=resolve)};
const frame=(seq,extra={})=>({v:1,deviceId:'DLOOP-SCALE-01',seq,grossG:984.6,stable:true,calibrated:true,...extra});
async function send(v){await act(async()=>{port.send(v);await new Promise(resolve=>setTimeout(resolve,0))});}
try{
 render(React.createElement(Connections,{state:fixture,revision:7,saving:false,act:save,controller:manager}));
 assert.equal(choose,0);fireEvent.click(screen.getByRole('button',{name:'Connect USB'}));await screen.findByText('USB serial open');assert.equal(choose,1);
 fireEvent.change(screen.getByLabelText('Spool for measurement'),{target:{value:fixture.spools[0].id}});
 await send(frame(1));assert(screen.getByText('984.60 g'));assert.equal(calls.length,0);
 fireEvent.click(screen.getByRole('button',{name:'Review scale measurement'}));assert(screen.getByText('764.60 g'));assert(screen.getByText('-35.40 g'));assert.equal(calls.length,0);
 assert(screen.getByRole('button',{name:'Confirm & save measurement'}).disabled);
 fireEvent.click(screen.getByLabelText('I checked this spool, tare and proposed balance'));
 await send(frame(2,{stable:false}));assert(screen.getByRole('button',{name:'Confirm & save measurement'}).disabled);
 await send(frame(3,{calibrated:false}));assert(screen.getByRole('button',{name:'Confirm & save measurement'}).disabled);
 await send(frame(4,{fault:'HX711_TIMEOUT',grossG:null}));assert(screen.getByRole('button',{name:'Confirm & save measurement'}).disabled);
 await send(frame(5));assert(!screen.getByRole('button',{name:'Confirm & save measurement'}).disabled);
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save measurement'}));fireEvent.click(screen.getByRole('button',{name:'Saving…'}));assert.equal(calls.length,1);
 await act(async()=>resolveSave(false));const intent=structuredClone(calls[0]);assert.equal(intent.reading.uid,undefined);assert.equal(intent.reading.seq,1);assert.equal(intent.gross,'984.60');assert.equal(intent.tare,'220.00');assert.equal(intent.version,1);assert.equal(intent.revision,7);
 fireEvent.click(screen.getByRole('button',{name:'Retry this confirmation'}));assert.equal(calls.length,2);assert.deepEqual(calls[1],intent);
 await act(async()=>resolveSave(true));assert.equal(screen.queryByRole('button',{name:'Confirm & save measurement'}),null);
 await send(frame(5));assert(screen.getByRole('button',{name:'Review scale measurement'}).disabled);
 await send(frame(6));clock+=5001;await act(async()=>manager.tick());assert(screen.getByRole('button',{name:'Review scale measurement'}).disabled);assert.equal(calls.length,2);
 fireEvent.click(screen.getByRole('button',{name:'Disconnect'}));await waitFor(()=>assert.equal(manager.getState().connection,'disconnected'));assert.equal(port.closes,1);assert(!port.stream.locked);
 fireEvent.change(screen.getByLabelText('Manual gross weight (g)'),{target:{value:'900'}});fireEvent.click(screen.getByRole('button',{name:'Review manual measurement'}));assert(screen.getByText('680.00 g'));
 fireEvent.click(screen.getByLabelText('I checked this spool, tare and proposed balance'));fireEvent.click(screen.getByRole('button',{name:'Confirm & save measurement'}));assert.equal(calls.length,3);assert.equal(calls[2].reading,undefined);assert.equal(calls[2].gross,'900.00');await act(async()=>resolveSave(true));
 fireEvent.click(screen.getByRole('button',{name:'Connect USB'}));await screen.findByText('USB serial open');clock=Date.now();await send(frame(0));assert.equal(manager.getState().reading.seq,0);
 cleanup();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(port.closes,1);assert(!port.stream.locked);
 const approxManager=new SerialScaleConnection(()=>clock),approxCalls=[];
 render(React.createElement(Connections,{state:fixture,revision:7,saving:false,act:async a=>{approxCalls.push(a);return true},controller:approxManager}));
 fireEvent.click(screen.getByRole('button',{name:'Connect USB'}));await screen.findByText('USB serial open');
 fireEvent.change(screen.getByLabelText('Spool for measurement'),{target:{value:fixture.spools[0].id}});
 await send(frame(0,{mode:'APPROXIMATE'}));assert(screen.getByText('APPROXIMATE · settled · calibrated'));assert.equal(approxCalls.length,0);
 fireEvent.click(screen.getByRole('button',{name:'Review scale measurement'}));
 assert(screen.getByRole('button',{name:'Confirm & save measurement'}).disabled);
 fireEvent.click(screen.getByLabelText('I accept this APPROXIMATE weight and checked the spool, tare and balance'));
 await send(frame(1,{mode:'APPROXIMATE',grossG:985.6}));assert(!screen.getByRole('button',{name:'Confirm & save measurement'}).disabled);
 await send(frame(2));assert(screen.getByRole('button',{name:'Confirm & save measurement'}).disabled); // mode change
 await send(frame(3,{mode:'APPROXIMATE',grossG:null,fault:'NOT_READY'}));assert(screen.getByRole('button',{name:'Confirm & save measurement'}).disabled);
 await send(frame(4,{mode:'APPROXIMATE'}));
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Confirm & save measurement'}));await new Promise(resolve=>setTimeout(resolve,0))});
 assert.equal(approxCalls.length,1);assert.equal(approxCalls[0].reading.mode,'APPROXIMATE');assert.equal(approxCalls[0].reading.approximateAcknowledged,true);assert.equal(approxCalls[0].reading.grossG,984.6);
 cleanup();await new Promise(resolve=>setTimeout(resolve,0));
 const previewManager=new SerialScaleConnection(()=>Date.now()),previewCalls=[];
 render(React.createElement(Connections,{state:fixture,revision:7,saving:false,act:async a=>{previewCalls.push(a);return true},controller:previewManager}));
 fireEvent.click(screen.getByRole('button',{name:'Connect USB'}));await screen.findByText('USB serial open');
 const live=(extra={})=>({raw:125000,grams:null,ageMs:10,calibrated:false,strictStable:false,hold:0,pending:2,stage:'EMPTY',spike:false,...extra});
 await send(frame(0,{calibrated:false,grossG:null,fault:'CALIBRATION_REQUIRED',live:live({raw:385008})}));
 assert(screen.getByText('Sensor raw: 385008 counts'));assert.equal(document.querySelector('.advancedScaleDiagnostics').open,false);assert(screen.getByText('UNVERIFIED ESTIMATE'));assert.equal(port.writes.length,0);assert.equal(previewCalls.length,0);
 assert.equal(screen.getByLabelText('Live preview weight').textContent,'— g');
 fireEvent.click(screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline'));
 assert.equal(screen.getByLabelText('Live preview weight').textContent,'1.802 kg');assert(screen.getByText('Sensor raw: 385008 counts'));
 assert.equal(previewManager.getState().reading,null);assert.equal(port.writes.length,0);assert.equal(previewCalls.length,0);
 assert(screen.getByRole('button',{name:'Tare preview display'}).disabled);
 fireEvent.click(screen.getByLabelText('I confirm the current load is the display tare baseline'));
 fireEvent.click(screen.getByRole('button',{name:'Tare preview display'}));assert(screen.getByText('Tared display: 0 counts'));assert.equal(port.writes.length,0);
 assert(!screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline').checked);
 assert.equal(screen.getByLabelText('Live preview weight').textContent,'— g');
 fireEvent.click(screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline'));
 assert.equal(screen.getByLabelText('Live preview weight').textContent,'0.0 g');
 fireEvent.click(screen.getByLabelText('I confirm the platform/reference matches this calibration step'));
 assert(screen.getByRole('button',{name:'Zero empty platform'}).disabled);
 await send(frame(1,{calibrated:false,grossG:null,fault:'CALIBRATION_REQUIRED',live:live({strictStable:true,hold:4})}));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Zero empty platform'})));
 assert.deepEqual(port.writes,['ZERO EMPTY\n']);
 assert.equal(screen.getByLabelText('Live preview weight').textContent,'— g');
 await send(frame(2,{calibrated:false,grossG:null,fault:'CALIBRATION_REQUIRED',live:live({stage:'LOAD',strictStable:true,hold:4})}));
 fireEvent.change(screen.getByLabelText('Known reference mass (g)'),{target:{value:'500'}});
 fireEvent.click(screen.getByLabelText('I confirm the platform/reference matches this calibration step'));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Fit known reference'})));
 assert.equal(port.writes.at(-1),'CAL 500\n');
 await send(frame(3,{calibrated:false,grossG:500,stable:false,live:live({stage:'VERIFY',strictStable:true,hold:4})}));
 assert.equal(screen.queryByText('500.00 g'),null);assert(screen.getByText('Sensor raw: 125000 counts'));
 fireEvent.change(screen.getByLabelText('Known reference mass (g)'),{target:{value:'1000'}});
 fireEvent.click(screen.getByLabelText('I confirm the platform/reference matches this calibration step'));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Verify different reference'})));
 assert.equal(port.writes.at(-1),'VERIFY 1000\n');
 await send(frame(4,{calibrated:false,grossG:1000,live:live({stage:'ACCEPT',strictStable:true,hold:4})}));
 fireEvent.click(screen.getByLabelText('I confirm the platform/reference matches this calibration step'));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Accept verified calibration'})));
 assert.equal(port.writes.at(-1),'ACCEPT\n');
 await send(frame(5,{grossG:1000,stable:false,live:live({raw:200000,grams:1000,calibrated:true,stage:'DONE'})}));
 assert.equal(screen.getByLabelText('Live preview weight').textContent,'1.000 kg');assert(screen.getByRole('button',{name:'Review scale measurement'}).disabled);
 await send(frame(6,{grossG:null,fault:'HX711_NOT_READY',live:live({raw:null,grams:null,ageMs:501,calibrated:true,stage:'DONE'})}));
 assert.equal(screen.getByLabelText('Live preview weight').textContent,'— g');assert(screen.getByRole('button',{name:'Tare preview display'}).disabled);assert.equal(previewCalls.length,0);
 cleanup();await new Promise(resolve=>setTimeout(resolve,0));
 const estimateManager=new SerialScaleConnection(()=>Date.now());
 render(React.createElement(Connections,{state:fixture,revision:7,saving:false,act:async()=>{throw Error('Estimate must not save inventory')},controller:estimateManager}));
 fireEvent.click(screen.getByRole('button',{name:'Connect USB'}));await screen.findByText('USB serial open');
 await send(frame(0,{calibrated:false,grossG:null,fault:'CALIBRATION_REQUIRED',live:live({raw:385008})}));
 fireEvent.click(screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline'));assert.equal(screen.getByLabelText('Live preview weight').textContent,'1.802 kg');
 await send(frame(1,{calibrated:false,grossG:null,fault:'HX711_NOT_READY',live:live({raw:null,ageMs:501})}));
 assert.equal(screen.getByLabelText('Live preview weight').textContent,'— g');assert(!screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline').checked);
 await send(frame(2,{calibrated:false,grossG:null,fault:'CALIBRATION_REQUIRED',live:live({raw:385008})}));assert.equal(screen.getByLabelText('Live preview weight').textContent,'— g');assert.equal(port.writes.length,0);
 cleanup();await new Promise(resolve=>setTimeout(resolve,0));
 const remainingManager=new SerialScaleConnection(()=>Date.now()),remainingCalls=[];
 const numaker={...fixture.spools[0],code:'PLA_WHITE_01',brandId:'1',capacity:1000,tare:193,tareDefault:193,tareProvisional:true};
 render(React.createElement(Connections,{state:{...fixture,spools:[numaker],brands:[{id:'1',name:'Numaker',defaultTare:193,defaultTareVerified:false}]},revision:6,saving:false,act:async a=>{remainingCalls.push(a);return true},controller:remainingManager}));
 fireEvent.click(screen.getByRole('button',{name:'Connect USB'}));await screen.findByText('USB serial open');
 fireEvent.change(screen.getByLabelText('Manual spool code'),{target:{value:'PLA_WHITE_01'}});fireEvent.click(screen.getByRole('button',{name:'Select existing spool by code'}));
 await new Promise(r=>setTimeout(r,5));
 await send(frame(0,{calibrated:false,grossG:null,fault:'CALIBRATION_REQUIRED',live:live({raw:850*213.656})}));
 fireEvent.click(screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline'));
 fireEvent.click(screen.getByLabelText(/I confirm empty-platform zeroing/));
 assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'657.0 g');assert.equal(remainingCalls.length,0);
 await send(frame(1,{calibrated:false,grossG:null,fault:'CALIBRATION_REQUIRED',live:live({raw:1175*213.656})}));
 assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'982.0 g');assert.equal(remainingCalls.length,0);
 await send(frame(2,{calibrated:false,grossG:null,fault:'HX711_NOT_READY',live:live({raw:1175*213.656})}));
 assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'Unavailable');assert.equal(remainingCalls.length,0);
 cleanup();await new Promise(resolve=>setTimeout(resolve,0));
 delete navigator.serial;
 render(React.createElement(Connections,{state:fixture,revision:7,saving:false,act:save}));assert(screen.getByRole('button',{name:'Connect USB'}).disabled);assert(screen.getByLabelText('Manual gross weight (g)'));
 console.log('PASS: explicit strict/APPROXIMATE acknowledgement, mode-change/fault rejection, approximate provenance and bounded review tolerance; no automatic writes; ordinary scale safety and lifecycle regressions. Confirmation callback is a unit spy, not a claimed database save.');
}finally{cleanup();dom.window.close();}
