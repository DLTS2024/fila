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

const {default:Panel}=await import('../components/delayed-wifi-estimate.tsx');
const {SerialScaleConnection}=await import('../lib/scale/serial.ts');
const {parseObservation}=await import('../lib/scale/manual-observation.ts');
const originalNow=Date.now;let clock=1800000000000;Date.now=()=>clock;
let saves=[],finish;
let observation={version:1,verification:'UNVERIFIED',seq:1,raw:125000,sampleAgeMs:3000,sampledAtMs:clock-3000,usable:true,arrivedAt:clock,connectionId:'wifi-test'};
const spool={id:'test',code:'TEST_ONLY',version:1,name:'Test fixture',capacity:1000,remaining:800,initial:1000,tare:193,tareDefault:193,tareKnown:true,status:'active',measured:false};
const state={spools:[spool],brands:[],history:[],slots:{}};
let props={observation,connected:true,spool,state,now:clock,revision:1,saving:false,act:async a=>{saves.push(a);return new Promise(r=>{finish=r;});}};
try{
 const view=render(React.createElement(Panel,props));
 const update=(extra={})=>{props={...props,...extra,now:clock};view.rerender(React.createElement(Panel,props));};
 const emptyBox=()=>screen.getByLabelText('I confirm the platform is empty for browser display tare');
 const tareButton=()=>screen.getByRole('button',{name:'Set browser display tare'});
 const delayed={...observation,raw:126129.22,sampleAgeMs:1100};
 update({spool:undefined,observation:delayed});
 assert(!emptyBox().disabled);assert(tareButton().disabled);
 fireEvent.click(emptyBox());assert(!tareButton().disabled);fireEvent.click(tareButton());
 assert.equal(screen.getByLabelText('Latest received estimated weight').textContent,'0.0 g');
 assert(screen.getByText(/UNVERIFIED ESTIMATE.*STALE/));assert.equal(saves.length,0);
 for(const extra of [{observation:{...delayed,raw:null}},{observation:{...delayed,raw:NaN}},{observation:{...delayed,sampleAgeMs:5001}},{connected:false},{observation:{...delayed,usable:false}}]){
  update({observation:delayed,connected:true,...extra});assert(emptyBox().disabled);assert(tareButton().disabled);assert(!emptyBox().checked);
 }
 update({connected:true,spool,observation:{...delayed,raw:delayed.raw+213.656,sampleAgeMs:5000}});assert(!emptyBox().disabled);
 fireEvent.click(emptyBox());clock+=1;fireEvent.click(tareButton());assert.equal(saves.length,0);
 // Click-time expiration must not replace the previous browser baseline.
 assert.equal(screen.getByLabelText('Latest received estimated weight').textContent,'1.0 g');
 update({observation,spool,connected:true});
 clock+=100;observation={...observation,seq:2,arrivedAt:clock,sampledAtMs:clock-3000};update({observation});
 assert(screen.getByText(/UNVERIFIED ESTIMATE.*STALE/));assert.equal(saves.length,0);
 fireEvent.click(screen.getByLabelText('I confirm the platform is empty for browser display tare'));
 fireEvent.click(screen.getByRole('button',{name:'Set browser display tare'}));
 clock+=100;observation={...observation,seq:3,raw:125000+850*213.656,arrivedAt:clock,sampledAtMs:clock-3000};update({observation});
 assert.equal(screen.getByLabelText('Latest received estimated weight').textContent,'850.0 g');
 fireEvent.click(screen.getByLabelText(/I checked this selected spool and gross load/));
 assert(!screen.getByRole('button',{name:'Review manual estimate'}).disabled);
 fireEvent.click(screen.getByRole('button',{name:'Review manual estimate'}));
 assert(screen.getByText(/STALE at review/));assert.equal(saves.length,0);
 fireEvent.click(screen.getByLabelText(/I confirm saving this manual UNVERIFIED estimate/));
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Confirm and save manual estimate'}));fireEvent.click(screen.getByRole('button',{name:'Confirm and save manual estimate'}));});
 assert.equal(saves.length,1);assert.equal(saves[0].type,'manual-estimate');assert.equal(saves[0].source,'live-preview-wifi');assert.equal(saves[0].gross,'850.00');assert.equal(saves[0].tare,'193.00');assert(!('reading' in saves[0]));
 await act(async()=>finish(true));
 fireEvent.click(screen.getByRole('button',{name:'Review manual estimate'}));
 update({spool:{...spool,version:2}});assert(screen.getByRole('button',{name:'Confirm and save manual estimate'}).disabled);
 update({spool});clock+=6000;update();assert(screen.getByRole('button',{name:'Review manual estimate'}).disabled);assert.equal(screen.getByLabelText('Latest received estimated weight').textContent,'850.0 g');
 update({connected:false,observation:{...observation,usable:false}});assert(screen.getByText(/OFFLINE/));assert.equal(saves.length,1);
 assert.equal(parseObservation({...observation,raw:Infinity}),null);
 const c=new SerialScaleConnection(()=>clock);
 const frame={v:1,deviceId:'DLOOP-SCALE-01',seq:3,grossG:null,stable:false,calibrated:false,fault:'CALIBRATION_REQUIRED',live:{raw:null,grams:null,ageMs:3000,calibrated:false,strictStable:false,hold:0,pending:0,stage:'EMPTY',spike:false}};
 const payload={configured:true,online:true,observation,reading:{frame,bootId:'b'.repeat(32),receivedAtMs:clock-3000,ageMs:100}};
 c.ingestWifi(payload,100);assert.equal(c.getState().reading,null);assert.equal(c.getState().preview.raw,null);assert.equal(c.getState().wifiObservation.raw,observation.raw);
 const received=c.getState().wifiObservation.arrivedAt;clock+=100;c.ingestWifi(payload,50);assert.equal(c.getState().wifiObservation.arrivedAt,received);
 frame.seq=4;payload.observation={...observation,seq:4,raw:null,usable:false};c.ingestWifi(payload,50);assert.equal(c.getState().wifiObservation.usable,false);
 console.log('PASS: 3-second STALE display, manual browser tare, explicit frozen estimate save, cent-correct net/source/timestamp, duplicate prevention, version/age/offline gates, historical display and unchanged 500 ms preview/calibration boundary. No actual inventory calls.');
}finally{cleanup();Date.now=originalNow;dom.window.close();}
