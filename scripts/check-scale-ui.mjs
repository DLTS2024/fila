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
 readable=null;controller=null;stream=null;closes=0;
 async open({baudRate}){assert.equal(baudRate,115200);this.readable=this.stream=new ReadableStream({start:c=>this.controller=c});}
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
 delete navigator.serial;
 render(React.createElement(Connections,{state:fixture,revision:7,saving:false,act:save}));assert(screen.getByRole('button',{name:'Connect USB'}).disabled);assert(screen.getByLabelText('Manual gross weight (g)'));
 console.log('PASS: no chooser until click; zero writes before review/acknowledgement; no NFC; unstable/uncalibrated/fault/stale rejection; double-click and same-intent retry protection; manual fallback; reconnect/unmount cleanup; unsupported-browser fallback. Confirmation callback is a unit spy, not a claimed database save.');
}finally{cleanup();dom.window.close();}
