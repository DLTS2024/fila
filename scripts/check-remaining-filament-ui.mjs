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
const {render,screen,fireEvent,cleanup,act}=await import('@testing-library/react');
const {default:Remaining}=await import('../components/live-remaining-filament.tsx');
const originalNow=Date.now;let clock=1000000;Date.now=()=>clock;
const spool={id:'one',version:1,code:'PLA_WHITE_01',name:'White',brandId:'1',capacity:1000,remaining:982,tare:193,tareDefault:193,tareProvisional:true,tareKnown:true,measured:false};
const state={brands:[{id:'1',defaultTare:193}],spools:[spool]},actions=[];
let sample={grams:850,receivedAt:clock,ageMs:0,connectionId:'usb',baselineId:'empty-platform',source:'live-preview-usb'};
const props={spool,state,sample,now:clock,revision:2,saving:false,act:async a=>{actions.push(a);return true}};
const checkGross=()=>fireEvent.click(screen.getByLabelText(/I confirm empty-platform zeroing/));
try{
 const view=render(React.createElement(Remaining,{...props,key:spool.id}));
 checkGross();assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'Unavailable');assert.equal(actions.length,0);
 clock++;sample={...sample,receivedAt:clock};view.rerender(React.createElement(Remaining,{...props,sample,now:clock,key:spool.id}));
 assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'657.0 g');assert.equal(actions.length,0);
 clock++;sample={...sample,grams:1175,receivedAt:clock};view.rerender(React.createElement(Remaining,{...props,sample,now:clock,key:spool.id}));assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'982.0 g');assert.equal(actions.length,0);
 fireEvent.click(screen.getByRole('button',{name:'Review & Save Estimate'}));assert(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}).disabled);
 fireEvent.click(screen.getByLabelText('I approve saving this manual UNVERIFIED estimate for this spool'));
 view.rerender(React.createElement(Remaining,{...props,sample,now:clock,revision:3,key:spool.id}));assert(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}).disabled);assert.equal(actions.length,0);
 view.rerender(React.createElement(Remaining,{...props,sample,now:clock,key:spool.id}));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'})));
 assert.equal(actions.length,1);assert.equal(actions[0].type,'manual-estimate');assert.equal(actions[0].gross,'1175.00');assert.equal(actions[0].expectedRevision,2);assert.equal(actions[0].id,'one');assert.equal(actions[0].source,'live-preview-usb');assert(!('reading' in actions[0]));
 view.rerender(React.createElement(Remaining,{...props,sample:null,now:clock,key:spool.id}));assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'Unavailable');
 view.rerender(React.createElement(Remaining,{...props,sample,now:clock+501,key:spool.id}));assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'Unavailable');
 const other={...spool,id:'two',code:'OTHER_01'};
 view.rerender(React.createElement(Remaining,{...props,spool:other,sample,now:clock,key:other.id}));assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'Unavailable');assert(!screen.getByLabelText(/I confirm empty-platform zeroing/).checked);assert.equal(actions.length,1);
 cleanup();
 render(React.createElement(Remaining,{...props,spool:undefined}));assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'Unavailable');
 console.log('PASS: automatic fresh 657/982 g display; no automatic actions; gross acknowledgement; explicit manual save with timestamp/source; revision conflict; stale/disconnect; switching spools discards old data and review; no selection.');
}finally{cleanup();Date.now=originalNow;dom.window.close();}
