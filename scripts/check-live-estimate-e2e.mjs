// Real PHP/Vite integration via jsdom components; not a browser layout test.
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
assert.equal(process.env.DLOOP_DISPOSABLE_TEST,'yes');
const live=process.env.DLOOP_TEST_URL;
assert(live&&new URL(live).hostname==='127.0.0.1'&&new URL(live).port==='8120','Dedicated disposable PHP test server on 8120 required.');
const fixture=JSON.parse(readFileSync('work/local-single-user-test/live-estimate-e2e.json','utf8'));
assert(fixture.database.startsWith('dloop_test_local_mode_'));
const React=await import('react');
const {render,screen,fireEvent,waitFor,cleanup,within,act}=await import('@testing-library/react');
const {default:App}=await import('../app/authenticated-studio.tsx');
const actualFetch=globalThis.fetch;let cookie,csrf,snapshot,port;
const writes=[],commands=[];
globalThis.fetch=async(url,options={})=>{
 const r=await actualFetch(live+url,{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{}),...(options.method==='POST'?{Origin:'http://127.0.0.1:5173'}:{})}});
 if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
 const json=await r.clone().json();if(json.data?.csrfToken)csrf=json.data.csrfToken;
 if(url==='/api/v1/stock'&&(!options.method||options.method==='GET')&&r.ok)snapshot=json;
 if(url==='/api/v1/stock'&&options.method==='POST')writes.push({body:JSON.parse(options.body),status:r.status});
 return r;
};
class MockPort{
 readable=null;writable=null;timer;seq=0;paused=false;
 async open(){this.readable=new ReadableStream({start:c=>this.controller=c});this.writable=new WritableStream({write:b=>commands.push(new TextDecoder().decode(b))});this.timer=setInterval(()=>{if(this.paused)return;this.controller.enqueue(new TextEncoder().encode(JSON.stringify({v:1,deviceId:'DLOOP-SCALE-01',seq:this.seq++,grossG:null,stable:false,calibrated:false,fault:'CALIBRATION_REQUIRED',live:{raw:850*213.656,grams:null,ageMs:0,calibrated:false,strictStable:false,hold:0,pending:0,stage:'EMPTY',spike:false}})+'\n'))},100)}
 async close(){clearInterval(this.timer);try{this.controller.close()}catch{}}
}
Object.defineProperty(window,'isSecureContext',{value:true,configurable:true});
Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>port=new MockPort()},configurable:true});
const nav=name=>fireEvent.click([...document.querySelectorAll('nav button')].find(b=>b.textContent.startsWith(name)));
const output=()=>screen.getByLabelText('Live remaining filament weight').textContent;
const selectCode=()=>{fireEvent.change(screen.getByLabelText('Manual spool code'),{target:{value:'PLA_WHITE_01'}});fireEvent.click(screen.getByRole('button',{name:'Select existing spool by code'}))};
const receiveGross=async()=>{await waitFor(()=>assert(!screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline').disabled));if(!screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline').checked)fireEvent.click(screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline'));await waitFor(()=>assert(!screen.getByLabelText(/I confirm empty-platform zeroing/).disabled));if(!screen.getByLabelText(/I confirm empty-platform zeroing/).checked)fireEvent.click(screen.getByLabelText(/I confirm empty-platform zeroing/));await waitFor(()=>assert.equal(output(),'657.0 g'))};
const review=()=>{fireEvent.click(screen.getByRole('button',{name:'Review & Save Estimate'}));fireEvent.click(screen.getByLabelText('I approve saving this manual UNVERIFIED estimate for this spool'))};
try{
 render(React.createElement(App));await screen.findByRole('button',{name:'Sign in'});
 fireEvent.change(screen.getByLabelText('Email'),{target:{value:'phase35-proxy@example.invalid'}});fireEvent.change(screen.getByLabelText('Password'),{target:{value:'Fixture-only-password-123!'}});fireEvent.click(screen.getByRole('button',{name:'Sign in'}));await screen.findByText('Studio API connected');
 assert(snapshot.state.spools.some(p=>p.id===fixture.id&&p.code==='PLA_WHITE_01'&&p.remaining===982));
 nav('NFC & scale');fireEvent.click(screen.getByRole('button',{name:'USB diagnostic fallback'}));selectCode();fireEvent.click(screen.getByRole('button',{name:'Connect USB'}));await receiveGross();
 const panel=screen.getByRole('region',{name:'Live remaining filament'});assert(within(panel).getByText('982 g'));assert(within(panel).getByText('65.7%'));assert.equal(writes.length,0);
 fireEvent.click(screen.getByRole('button',{name:'Review & Save Estimate'}));assert(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}).disabled);assert.equal(writes.length,0);
 fireEvent.click(screen.getByLabelText('I approve saving this manual UNVERIFIED estimate for this spool'));assert.equal(writes.length,0);
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}));
 await screen.findByText('Manual UNVERIFIED estimate saved. No scale measurement recorded.');
 assert.equal(writes.length,1);assert.equal(writes[0].status,200);assert.equal(writes[0].body.action.type,'manual-estimate');assert.equal(writes[0].body.action.id,fixture.id);assert.equal(writes[0].body.action.gross,'850.00');assert.equal(writes[0].body.action.tare,'193.00');
 assert(within(panel).getByText('657 g'));assert.equal(snapshot.state.spools.find(p=>p.id===fixture.id).measured,false);
 review();fireEvent.click(screen.getByRole('button',{name:'Disconnect'}));await waitFor(()=>assert(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}).disabled));assert.equal(output(),'Unavailable');assert.equal(writes.length,1);
 fireEvent.click(screen.getByRole('button',{name:'Connect USB'}));await waitFor(()=>assert(port&&port.seq>0));assert(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}).disabled);assert.equal(writes.length,1);
 // Switching discards the old frozen review, including after reconnect.
 const other=snapshot.state.spools.find(p=>p.id!==fixture.id);fireEvent.change(screen.getByLabelText('Spool for measurement'),{target:{value:other.id}});assert.equal(output(),'Unavailable');assert(!screen.queryByRole('button',{name:'Confirm & save UNVERIFIED estimate'}));selectCode();await receiveGross();assert.equal(writes.length,1);
 port.paused=true;await waitFor(()=>assert.equal(output(),'Unavailable'),{timeout:2000});assert.equal(writes.length,1);port.paused=false;await receiveGross();
 review();
 // An external fixture mutation advances revision; the frozen request must conflict.
 const r=await actualFetch(live+'/api/v1/stock',{method:'POST',headers:{Cookie:cookie,Origin:'http://127.0.0.1:5173','Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({revision:snapshot.revision,action:{type:'brand',brand:{name:'E2E concurrent '+Date.now(),active:true}}})});assert.equal(r.status,200);
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}));await screen.findAllByText(/Inventory changed in another session/);assert.equal(writes.length,2);assert.equal(writes[1].status,409);
 nav('Activity');await screen.findAllByText(/UNVERIFIED manual estimate; source live-preview-usb; captured/);assert.equal(commands.length,0);
 console.log('PASS: React app + simulated USB + real PHP/MariaDB: existing-code selection, automatic 657 g/65.7%, saved 982 separate, explicit manual save, saved balance/history refresh, disconnect/reconnect/stale/switch safety, concurrency conflict, zero calibration commands. Disposable DB only; no physical hardware claim.');
}finally{cleanup();clearInterval(port?.timer);globalThis.fetch=actualFetch;dom.window.close();}
