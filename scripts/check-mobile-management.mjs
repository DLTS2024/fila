import {spawnSync} from 'node:child_process';
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


const {default:Wifi}=await import('../components/add-spool-wifi.tsx');
const {default:Dialog}=await import('../components/filament-dialog.tsx');
const {default:Printers}=await import('../components/printer-library.tsx');
const {default:Products}=await import('../components/product-library.tsx');
const {default:RecordActions}=await import('../components/record-actions.tsx');
let clock=Date.now();const originalNow=Date.now;Date.now=()=>clock;
let listener;let state={connection:'connected',wifiObservation:{version:1,verification:'UNVERIFIED',seq:1,raw:10000,sampleAgeMs:3000,sampledAtMs:clock-3000,usable:true,arrivedAt:clock,connectionId:'fixture'}};
const controller={getState:()=>state,subscribe:fn=>{listener=fn;return()=>{listener=null}}};
const emit=(patch)=>{state={...state,...patch};act(()=>listener?.(state))};
let captures=[];render(React.createElement(Wifi,{controller,tare:193,capacity:1000,disabled:false,onAccept:e=>captures.push(e)}));
assert(screen.getByText(/CONNECTED.*UNVERIFIED/));assert(screen.getByRole('button',{name:'Accept weight into form'}).disabled);
fireEvent.click(screen.getByLabelText('I confirm the platform is empty for browser display tare'));fireEvent.click(screen.getByRole('button',{name:'Set browser display tare'}));
emit({wifiObservation:{...state.wifiObservation,seq:2,raw:10000+271.99*213.656}});
fireEvent.click(screen.getByLabelText(/I accept this UNVERIFIED/));fireEvent.click(screen.getByRole('button',{name:'Accept weight into form'}));
assert.equal(captures.length,1);assert.equal(captures[0].remaining,'78.99');assert.equal(captures[0].gross,'271.99');assert.equal(captures[0].source,'live-preview-wifi');
emit({connection:'disconnected'});assert(screen.getByRole('button',{name:'Accept weight into form'}).disabled);
emit({connection:'connected',wifiObservation:{...state.wifiObservation,sampleAgeMs:5001}});assert(screen.getByRole('button',{name:'Set browser display tare'}).disabled);
cleanup();
const inventory={brandTaresAvailable:true,managementAvailable:true,spools:[],history:[],slots:{},brands:[{id:'1',name:'Numaker',active:true,version:1,defaultTare:193,defaultTareVerified:false}],profiles:[],catalogue:[]};
let saves=[];render(React.createElement(Dialog,{state:inventory,wifiController:controller,saving:false,error:'',onCancel:()=>{},onSave:async a=>{saves.push(a);return true}}));
fireEvent.change(screen.getByLabelText('Brand'),{target:{value:'1'}});assert(screen.getByText(/Effective tare: 193.00 g/));
fireEvent.change(screen.getByLabelText('Starting filament mass (g)'),{target:{value:'1000'}});fireEvent.change(screen.getByLabelText('Remaining filament mass (g)'),{target:{value:'700'}});
fireEvent.click(screen.getByRole('button',{name:'Read from Wi-Fi Scale'}));
emit({connection:'connected',wifiObservation:{...state.wifiObservation,raw:10000,sampleAgeMs:3000}});
fireEvent.click(screen.getByLabelText('I confirm the platform is empty for browser display tare'));fireEvent.click(screen.getByRole('button',{name:'Set browser display tare'}));
emit({wifiObservation:{...state.wifiObservation,seq:3,raw:10000+271.99*213.656}});
assert.equal(screen.getByLabelText('Remaining filament mass (g)').value,'700');assert.equal(saves.length,0);
fireEvent.click(screen.getByLabelText(/I accept this UNVERIFIED/));fireEvent.click(screen.getByRole('button',{name:'Accept weight into form'}));
assert.equal(screen.getByLabelText('Remaining filament mass (g)').value,'78.99');assert.equal(screen.getByLabelText('Starting filament mass (g)').value,'1000');assert.equal(saves.length,0);
fireEvent.change(screen.getByLabelText('Spool name'),{target:{value:'Captured spool'}});fireEvent.change(screen.getByLabelText('Colour name'),{target:{value:'White'}});fireEvent.change(screen.getByLabelText('Spool type'),{target:{value:'Unknown'}});
fireEvent.click(screen.getByRole('button',{name:'Review new spool'}));assert.equal(saves.length,0);
fireEvent.click(screen.getByLabelText('I checked this physical spool, tare and proposed balance'));fireEvent.click(screen.getByRole('button',{name:'Confirm & save spool'}));
await waitFor(()=>assert.equal(saves.length,1));assert.equal(saves[0].spool.initial,'1000');assert.equal(saves[0].spool.remaining,'78.99');assert.equal(saves[0].spool.mode,'manual');assert.equal(saves[0].spool.estimateCapture.source,'live-preview-wifi');
fireEvent.click(screen.getByRole('button',{name:'Back to edit'}));

fireEvent.change(screen.getByLabelText('Physical spool tare override (g)'),{target:{value:'200'}});assert(screen.getByText(/Effective tare: 200.00 g/));assert.equal(screen.getByLabelText('Estimate / tare provenance (no cover included)').value,'');cleanup();
const printers=[{id:'1',name:'Anycubic Kobra 3',brand:'Anycubic',model:'Kobra 3',nickname:'',mode:'single',slotCount:1,active:true,version:1,slotPrefix:'kobra'},{id:'2',name:'Creality SPARKX i7',brand:'Creality',model:'SparkX i7',nickname:'',mode:'multi',slotCount:4,active:true,version:1,slotPrefix:'sparkx'}];
let assignments=[];render(React.createElement(Printers,{state:{...inventory,printers,slots:{'sparkx-4':'spool'}},saving:false,act:async()=>true,onAssign:(...a)=>assignments.push(a)}));
assert.equal(screen.getAllByRole('button',{name:/^Slot /}).length,5);fireEvent.click(screen.getAllByRole('button',{name:/^Slot 4/})[0]);assert.deepEqual(assignments,[['sparkx-4','spool']]);
fireEvent.click(screen.getByRole('button',{name:'Add printer'}));fireEvent.change(screen.getByLabelText('Colour mode'),{target:{value:'multi'}});assert(!screen.getByLabelText('Slot count').disabled);cleanup();
globalThis.confirm=()=>false;let actions=[];render(React.createElement(RecordActions,{entity:'spool',id:'fixture',version:1,active:true,saving:false,act:async a=>actions.push(a)}));fireEvent.click(screen.getByRole('button',{name:'Delete unused'}));assert.equal(actions.length,0);globalThis.confirm=()=>true;fireEvent.click(screen.getByRole('button',{name:'Archive'}));assert.equal(actions[0].confirmed,true);cleanup();
Date.now=originalNow;console.log('PASS: real management components: Wi-Fi acknowledgement, 5-second expiry/offline, 271.99 minus 193 = 78.99, explicit draft replacement, independent starting mass, override precedence, five legacy slots, manual assignment and cancelable destructive confirmation. No network/database.');

const phpPath=fileURLToPath(new URL('../.tools/php/php.exe',import.meta.url));
const backend=spawnSync(process.env.DLOOP_PHP||(existsSync(phpPath)?phpPath:'php'),['-n',fileURLToPath(new URL('../backend/tests/mobile-management-offline.php',import.meta.url))],{encoding:'utf8'});
assert.equal(backend.error,undefined);process.stdout.write(backend.stdout??'');assert.equal(backend.status,0,backend.stderr);
