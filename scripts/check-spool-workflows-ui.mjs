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
const {render,screen,fireEvent,cleanup,act,waitFor}=await import('@testing-library/react');
const {default:FilamentDialog}=await import('../components/filament-dialog.tsx');
const {default:Identification}=await import('../components/spool-identification.tsx');
const {default:SelectionSync}=await import('../components/spool-selection-sync.tsx');
const {studioApi}=await import('../lib/api.ts');
const base={spools:[],history:[],slots:{},brands:[{id:'1',name:'Numaker',active:true,version:1,defaultTare:193,defaultTareVerified:false},{id:'2',name:'Other',active:true,version:1,defaultTare:null,defaultTareVerified:false}],profiles:[],catalogue:[],brandTaresAvailable:true,tagUrlsAvailable:true};
const fill=(label,value)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
const saves=[];
try{
 render(React.createElement(FilamentDialog,{state:base,saving:false,error:'',onCancel:()=>{},onSave:async a=>{saves.push(a);return true}}));
 fill('Spool name','Numaker PLA+ White UNVERIFIED');fill('Brand','1');fill('Material','PLA+');fill('Colour name','White');fill('Spool type','Unknown');fill('Starting filament mass (g)','982');
 fill('Balance entry','gross');fill('Gross weight on scale (g)','1175');
 fill('Estimate / tare provenance (no cover included)','Cover excluded. Tare 193 g is provisional brand default.');
 fireEvent.click(screen.getByRole('button',{name:'Review new spool'}));
 assert(screen.getByText(/UNVERIFIED manual estimate/));assert(screen.getAllByText('982.00 g').length>=1);
 fireEvent.click(screen.getByLabelText('I checked this physical spool, tare and proposed balance'));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Confirm & save spool'})));
 assert.equal(saves.length,1);assert.equal(saves[0].spool.mode,'manual');assert.equal(saves[0].spool.remaining,'982');assert(!('gross' in saves[0].spool));assert(saves[0].spool.estimateNote.includes('1175'));assert(!('reading' in saves[0]));
 fireEvent.click(screen.getByRole('button',{name:'Back to edit'}));fill('Brand','2');
 assert(screen.getByText(/Effective tare: Tare Required/));fireEvent.click(screen.getByRole('button',{name:'Review new spool'}));assert.equal(saves.length,1);assert(screen.getByRole('alert'));
 cleanup();
 const spool={id:'existing',code:'PLA_WHITE_01',version:1,name:'White spool',brand:'Numaker',brandId:'1',material:'PLA+',colorName:'White',capacity:1000,remaining:982,tare:193,tareKnown:true,tareProvisional:true,initial:982,measured:false,status:'active',tagToken:'a'.repeat(48)};
 const actions=[];
 function Harness(){const [id,setId]=React.useState('');return React.createElement(Identification,{state:{...base,spools:[spool]},selected:id?spool:undefined,select:setId,saving:false,liveGrams:1175,act:async a=>{actions.push(a);return true}})}
 render(React.createElement(Harness));fill('Manual spool code','UNKNOWN');fireEvent.click(screen.getByRole('button',{name:'Select existing spool by code'}));assert(screen.getByText(/No unique active spool/));assert.equal(actions.length,0);
 fill('Manual spool code','pla_white_01');fireEvent.click(screen.getByRole('button',{name:'Select existing spool by code'}));assert(screen.getByText(/White spool/));assert(screen.getByText(/982 g/));assert.equal(actions.length,0);
 assert(screen.getByText(/Phone access, tag writing and phone-to-PC sync are pending/));assert.equal(screen.queryByRole('button',{name:'Write URL to NFC sticker'}),null);
 fireEvent.click(screen.getByLabelText('I confirm the live display is gross spool + filament weight, with cover and packaging excluded'));assert(screen.getByText(/982.0 g/));assert.equal(actions.length,0);
 fireEvent.click(screen.getByLabelText("I confirm this spool's NFC association change (generate, replace or unlink)"));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Replace URL tag identifier'})));
 assert.equal(actions.length,1);assert.equal(actions[0].type,'tag-url');assert.equal(actions[0].id,'existing');assert(actions[0].replace);assert(!actions.some(a=>a.type==='add'));
 cleanup();
 // A phone URL opened before sign-in must still resolve when inventory mounts.
 window.history.replaceState(null,'','/#/spool/'+spool.tagToken);
 const selections=[];
 const props={state:{...base,spools:[spool]},selected:spool,select:id=>selections.push(id),saving:false,liveGrams:null,phoneOrigin:'https://studio.example.invalid',act:async a=>{actions.push(a);return true}};
 const view=render(React.createElement(Identification,props));
 assert.equal(selections.at(-1),spool.id);assert.equal(actions.length,1);
 assert.equal(screen.getByLabelText('NFC sticker URL').value,'https://studio.example.invalid/#/spool/'+spool.tagToken);
 assert(screen.getByRole('button',{name:'Write URL to NFC sticker'}));
 assert(screen.getByText(/Live display weight: unavailable/));
 fireEvent.click(screen.getByLabelText('I confirm the live display is gross spool + filament weight, with cover and packaging excluded'));
 assert(!screen.queryByText(/982.0 g/));assert.equal(actions.length,1);
 // Replacing a token while the old sticker URL is open must fail closed.
 view.rerender(React.createElement(Identification,{...props,state:{...base,spools:[{...spool,tagToken:'b'.repeat(48)}]}}));
 assert(screen.getByText(/Tag identifier is missing, replaced or archived/));assert.equal(selections.at(-1),'');
 await act(async()=>{window.history.replaceState(null,'','/#/spool/'+'b'.repeat(48));window.dispatchEvent(new window.HashChangeEvent('hashchange'));});
 assert.equal(selections.at(-1),spool.id);assert.equal(actions.length,1);
 cleanup();window.history.replaceState(null,'','/');
 const unlinkActions=[];
 render(React.createElement(Identification,{...props,phoneOrigin:null,act:async a=>{unlinkActions.push(a);return true}}));
 assert(screen.getByRole('button',{name:'Unlink NFC URL and hardware tag'}).disabled);
 fireEvent.click(screen.getByLabelText("I confirm this spool's NFC association change (generate, replace or unlink)"));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Unlink NFC URL and hardware tag'})));
 assert.equal(unlinkActions.length,1);assert.equal(unlinkActions[0].type,'tag-unlink');assert.equal(unlinkActions[0].id,spool.id);assert.equal(unlinkActions[0].confirmed,true);
 cleanup();
 const originalGet=studioApi.getSpoolSelection,originalSend=studioApi.sendSpoolSelection;
 let gets=0;const sent=[],received=[];
 studioApi.getSpoolSelection=async()=>{gets++;return {data:{selection:{spoolId:spool.id,eventId:'event-one',expiresAt:Date.now()/1000+120}}}};
 studioApi.sendSpoolSelection=async id=>{sent.push(id);return {data:{selection:null}}};
 try{
  const syncProps={enabled:false,selected:spool,spools:[spool],select:id=>received.push(id)};
  const sync=render(React.createElement(SelectionSync,syncProps));assert.equal(gets,0);assert.equal(screen.queryByLabelText('Receive spool selections from my signed-in devices'),null);
  sync.rerender(React.createElement(SelectionSync,{...syncProps,enabled:true}));assert.equal(gets,0);
  fireEvent.click(screen.getByLabelText('Receive spool selections from my signed-in devices'));
  await waitFor(()=>assert.equal(received.length,1));assert.equal(received[0],spool.id);
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Send selected spool to my receiving devices'})));assert.deepEqual(sent,[spool.id]);
  cleanup();
  studioApi.getSpoolSelection=async()=>({data:{selection:{spoolId:spool.id,eventId:'expired',expiresAt:Date.now()/1000-1}}});
  render(React.createElement(SelectionSync,{...syncProps,enabled:true}));
  await act(async()=>fireEvent.click(screen.getByLabelText('Receive spool selections from my signed-in devices')));assert.equal(received.length,1);
 }finally{cleanup();studioApi.getSpoolSelection=originalGet;studioApi.sendSpoolSelection=originalSend;}
 console.log('PASS: brand-specific provisional tare calculation -> confirmed manual estimate; unknown other-brand tare blocked; code selection and live estimate never create/save spools; NFC replacement targets existing ID; phone access pending in localhost mode. UI spies only.');
}finally{cleanup();dom.window.close();}
