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
const {default:Dialog}=await import('../components/filament-dialog.tsx');
const {default:Batches}=await import('../components/qr-batch-library.tsx');
const {studioApi}=await import('../lib/api.ts');
const original={resolve:studioApi.resolveQrLabel,generate:studioApi.generateQrBatch,list:studioApi.qrBatches};
const id='a'.repeat(32),saves=[];
const spool={id:'existing',code:'PLA_WHITE_01',remaining:982,tare:193,status:'active'};
const state={spools:[spool],history:[],slots:{},brands:[{id:'1',name:'Numaker',active:true,version:1,defaultTare:193,defaultTareVerified:false}],profiles:[],qrLabelsAvailable:true,brandTaresAvailable:true};
const fill=(label,value)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
try{
 studioApi.resolveQrLabel=async token=>({data:{id:token,state:'UNUSED',spoolId:null,code:null}});
 render(React.createElement(Dialog,{state,saving:false,error:'',onCancel:()=>{},onSave:async a=>{saves.push(a);return true}}));
 fill('Scanned QR text or spool code','DL3D:LABEL:'+id);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Select from QR text'})));await screen.findByText(/UNUSED label verified: QL-/);
 fill('Spool name','QR New');fill('Brand','1');fill('Material','PLA+');fill('Colour name','White');fill('Spool type','Unknown');fill('Starting filament mass (g)','982');fill('Remaining filament mass (g)','982');
 fireEvent.click(screen.getByRole('button',{name:'Review new spool'}));assert(screen.getByText(/Bind UNUSED label QL-/));assert.equal(saves.length,0);fireEvent.click(screen.getByLabelText('I checked this physical spool, tare and proposed balance'));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Confirm & save spool'})));assert.equal(saves[0].qrLabelId,id);assert.equal(saves[0].type,'add');assert.equal(saves[0].spool.mode,'manual');assert.equal(saves[0].spool.remaining,'982');
 fireEvent.click(screen.getByRole('button',{name:'Back to edit'}));studioApi.resolveQrLabel=async token=>({data:{id:token,state:'ASSIGNED',spoolId:spool.id,code:spool.code}});fill('Scanned QR text or spool code','DL3D:LABEL:'+'b'.repeat(32));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Select from QR text'})));assert(screen.getByText(/Already assigned to PLA_WHITE_01/));assert(!screen.queryByText(/UNUSED label verified: QL-/));assert.equal(saves.length,1);cleanup();
 Object.defineProperty(globalThis,'sessionStorage',{value:window.sessionStorage,configurable:true});sessionStorage.clear();let keys=[],attempt=0;studioApi.qrBatches=async()=>({data:[]});studioApi.generateQrBatch=async(count,key)=>{keys.push(key);if(attempt++===0)throw Error('Lost response');return {data:{id:'batch',count}}};
 render(React.createElement(Batches,{available:true}));fireEvent.click(screen.getByLabelText('I confirm creation of this UNUSED label batch; no spool or weight will be changed'));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Create UNUSED QR batch'})));assert(screen.getByText(/Batch result uncertain or failed/));cleanup();
 render(React.createElement(Batches,{available:true}));fireEvent.click(screen.getByLabelText('I confirm creation of this UNUSED label batch; no spool or weight will be changed'));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Retry same batch request'})));assert.equal(keys[0],keys[1]);assert.equal(sessionStorage.getItem('dloop.pendingQrBatch'),null);
 console.log('PASS: Add spool scans server-validated UNUSED QR and confirms atomic binding payload; assigned scan cannot create duplicate; invalid new scan clears previous candidate; uncertain batch retry survives remount with the same request key. API spies only.');
}finally{cleanup();studioApi.resolveQrLabel=original.resolve;studioApi.generateQrBatch=original.generate;studioApi.qrBatches=original.list;dom.window.close();}
