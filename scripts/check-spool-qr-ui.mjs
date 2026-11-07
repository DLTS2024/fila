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
const {default:SpoolQr}=await import('../components/spool-qr.tsx');
const spool={id:'existing',code:'PLA_WHITE_01',status:'active'},selected=[];
let callback,stops=0,starts=0;
const props={spools:[spool],selected:spool,select:id=>selected.push(id),camera:async(video,onText)=>{starts++;callback=onText;return {stop:()=>stops++}}};
try{
 const view=render(React.createElement(SpoolQr,props));assert.equal(starts,0);
 fireEvent.click(screen.getByRole('button',{name:'Generate QR label'}));await screen.findByAltText('QR label for PLA_WHITE_01');assert(screen.getByRole('link',{name:'Download QR label'}));assert.equal(selected.length,0);
 fireEvent.change(screen.getByLabelText('Scanned QR text or spool code'),{target:{value:'DL3D:SPOOL:PLA_WHITE_01'}});fireEvent.click(screen.getByRole('button',{name:'Select from QR text'}));assert.deepEqual(selected,['existing']);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Start QR camera'})));assert.equal(starts,1);
 await act(async()=>callback('https://untrusted.invalid/#/spool/'+'a'.repeat(48)));assert.equal(selected.length,1);
 // A replacement/archive during active scanning must use current inventory, not the old closure.
 view.rerender(React.createElement(SpoolQr,{...props,spools:[{...spool,status:'archived'}]}));await act(async()=>callback('DL3D:SPOOL:PLA_WHITE_01'));assert.equal(selected.length,1);
 view.rerender(React.createElement(SpoolQr,props));await act(async()=>callback('DL3D:SPOOL:PLA_WHITE_01'));assert.equal(selected.length,2);assert(stops>=1);
 await act(async()=>callback('DL3D:SPOOL:PLA_WHITE_01'));assert.equal(selected.length,2);cleanup();
 let release;const lateStops=stops;
 render(React.createElement(SpoolQr,{...props,camera:()=>new Promise(r=>release=r)}));fireEvent.click(screen.getByRole('button',{name:'Start QR camera'}));fireEvent.click(screen.getByRole('button',{name:'Stop QR camera'}));await act(async()=>release({stop:()=>stops++}));assert.equal(stops,lateStops+1);cleanup();
 render(React.createElement(SpoolQr,{...props,camera:async()=>{throw Error('Permission denied')}}));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Start QR camera'})));assert(screen.getByText('Permission denied'));assert(!screen.getByRole('button',{name:'Start QR camera'}).disabled);
 console.log('PASS: QR label/download, paste and simulated camera select existing spool only; explicit camera start; unknown/archived/current-state handling; stop after selection; late permission cleanup; denied camera fallback. No actual camera used.');
}finally{cleanup();dom.window.close();}
