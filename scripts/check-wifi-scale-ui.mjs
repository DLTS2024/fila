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
const {useWifiScale}=await import('../hooks/use-wifi-scale.ts');
const {studioApi}=await import('../lib/api.ts');
const original=studioApi.getScaleReading;let online=true,calls=0,controller;const saves=[];
const frame={v:1,deviceId:'DLOOP-SCALE-01',seq:1,grossG:null,stable:false,calibrated:false,fault:'CALIBRATION_REQUIRED',live:{raw:850*213.656,grams:null,ageMs:0,calibrated:false,strictStable:true,hold:4,pending:0,stage:'EMPTY',spike:false}};
studioApi.getScaleReading=async()=>{calls++;frame.seq++;return {configured:true,online,reading:online?{frame,bootId:'a'.repeat(32),receivedAtMs:Date.now(),ageMs:0}:null}};
const spool={id:'one',code:'PLA_WHITE_01',version:1,name:'White',brandId:'1',brand:'Numaker',material:'PLA+',capacity:1000,remaining:982,initial:982,tare:193,tareDefault:193,tareKnown:true,tareProvisional:true,status:'active',measured:false};
const state={spools:[spool],brands:[{id:'1',name:'Numaker',defaultTare:193,defaultTareVerified:false}],history:[],slots:{}};
function Harness(){const c=useWifiScale();controller=c;const [show,setShow]=React.useState(true);return React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>setShow(v=>!v)},'Navigate test page'),show&&React.createElement(Connections,{state,revision:0,saving:false,wifiController:c,act:async a=>{saves.push(a);return true}}));}
try{
 render(React.createElement(Harness));await screen.findByText('Wi-Fi online');assert(screen.getByRole('button',{name:'Connect USB'}).disabled);
 fireEvent.change(screen.getByLabelText('Manual spool code'),{target:{value:'PLA_WHITE_01'}});fireEvent.click(screen.getByRole('button',{name:'Select existing spool by code'}));
 await waitFor(()=>assert(!screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline').disabled));fireEvent.click(screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline'));
 await waitFor(()=>assert(!screen.getByLabelText(/I confirm empty-platform zeroing/).disabled));fireEvent.click(screen.getByLabelText(/I confirm empty-platform zeroing/));
 await waitFor(()=>assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'657.0 g'));assert.equal(saves.length,0);
 assert.equal(controller.getState().reading,null);await assert.rejects(()=>controller.command('ZERO EMPTY'));
 assert(screen.getByText('UNVERIFIED ESTIMATE'));assert(screen.getByText('UNVERIFIED estimate; no calibrated or stable measurement claim'));
 assert.equal(screen.queryByText('Strict hold complete'),null);
 fireEvent.click(screen.getByRole('button',{name:'Review & Save Estimate'}));fireEvent.click(screen.getByLabelText('I approve saving this manual UNVERIFIED estimate for this spool'));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'})));assert.equal(saves[0].source,'live-preview-wifi');assert.equal(saves[0].type,'manual-estimate');
 // Browser-only empty-platform baseline: no device command or additional save.
 fireEvent.click(screen.getByLabelText('I confirm the current load is the display tare baseline'));
 fireEvent.click(screen.getByRole('button',{name:'Tare preview display'}));
 assert(screen.getByText(/Browser display tare applied/));assert.equal(saves.length,1);
 assert(!screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline').checked);
 fireEvent.click(screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline'));
 await waitFor(()=>assert.equal(screen.getByLabelText('Live preview weight').textContent,'0.0 g'));
 frame.live.raw=(850+1802)*213.656;
 await waitFor(()=>assert.equal(screen.getByLabelText('Live preview weight').textContent,'1.802 kg'));
 assert.equal(controller.getState().reading,null);assert.equal(saves.length,1);
 assert.equal(frame.calibrated,false);assert.equal(frame.live.grams,null);
 // A delayed packet hides the weight, but does not require the operator to
 // reconfirm the same browser baseline for each healthy Wi-Fi update.
 frame.live.raw=null;frame.live.ageMs=600;
 await waitFor(()=>assert(screen.getByText('Stale or waiting for fresh sensor data')));
 assert.notEqual(screen.getByLabelText('Live preview weight').textContent,'1.802 kg');
 assert(screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline').checked);
 assert.equal(saves.length,1);
 frame.live.raw=(850+1802)*213.656;frame.live.ageMs=0;
 await waitFor(()=>assert.equal(screen.getByLabelText('Live preview weight').textContent,'1.802 kg'));
 online=false;await waitFor(()=>assert.equal(controller.getState().connection,'disconnected'));await waitFor(()=>assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'Unavailable'));online=true;await screen.findByText('Wi-Fi online');assert(!screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline').checked);
 const previous=controller;fireEvent.click(screen.getByRole('button',{name:'Navigate test page'}));const count=calls;await new Promise(r=>setTimeout(r,300));assert(calls>count);assert.equal(controller,previous);fireEvent.click(screen.getByRole('button',{name:'Navigate test page'}));await screen.findByText('Wi-Fi online');assert.equal(controller,previous);assert.equal(saves.length,1);
 console.log('PASS: authenticated API hook simulation, Wi-Fi primary, 850-193=657, explicit UNVERIFIED wifi source, no verified readings/commands, offline/reconnect acknowledgement and navigation without USB or poll lifecycle restart. No real radio/TLS claimed.');
}finally{cleanup();studioApi.getScaleReading=original;dom.window.close();}
