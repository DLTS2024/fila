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
assert.equal(process.env.DLOOP_DISPOSABLE_TEST,'yes');
const base=process.env.DLOOP_TEST_URL;
assert(base==='http://127.0.0.1:8122','Dedicated disposable server required');
assert(process.env.DLOOP_PHASE9_DB?.startsWith('dloop_test_local_mode_'),'Guarded existing disposable database required');
const {mkdirSync,writeFileSync}=await import('node:fs');
const React=await import('react');
const {render,screen,fireEvent,waitFor,cleanup,act,within}=await import('@testing-library/react');
const {default:App}=await import('../app/authenticated-studio.tsx');
const actual=globalThis.fetch;
let cookie='',csrf='',snapshot,seq=0,wifiMode='fresh',authenticated=false,dropNextEstimateResponse=false;
const writes=[],stockSnapshots=[],safety={};
const frame=()=>({v:1,deviceId:'DLOOP-SCALE-01',seq:seq++,grossG:null,stable:false,calibrated:false,fault:'CALIBRATION_REQUIRED',live:{raw:wifiMode==='stale'?null:850*213.656,grams:null,ageMs:wifiMode==='stale'?501:0,calibrated:false,strictStable:false,hold:0,pending:0,stage:'EMPTY',spike:false}});
async function request(path,body){
 assert(!(path==='/qr-batches'&&body),'Phase 9 must not generate another QR batch');
 const r=await actual(base+'/api/v1'+path,{method:body?'POST':'GET',headers:{...(cookie?{Cookie:cookie}:{}),...(body?{Origin:'http://127.0.0.1:5173','Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':crypto.randomUUID()}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
 const data=await r.json();if(data.data?.csrfToken)csrf=data.data.csrfToken;
 return {status:r.status,data};
}
async function real(path,body){const r=await request(path,body);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
const fill=(label,value)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
const nav=name=>fireEvent.click([...document.querySelectorAll('nav button')].find(b=>b.textContent.startsWith(name)));
const target=(stock,id)=>stock.state.spools.find(p=>p.id===id);
const historyFor=(stock,id)=>stock.state.history.filter(e=>e.changes.some(c=>c.id===id));
const review=()=>{fireEvent.click(screen.getByRole('button',{name:'Review & Save Estimate'}));fireEvent.click(screen.getByLabelText('I approve saving this manual UNVERIFIED estimate for this spool'));};
const cancelReview=()=>{const b=screen.queryByRole('button',{name:'Cancel estimate review'});if(b)fireEvent.click(b);};
async function acknowledgeGross(){

 const raw=()=>screen.getByLabelText('I confirm the displayed raw counts are tared to the empty-platform baseline');
 await waitFor(()=>assert(!raw().disabled),{timeout:5000});if(!raw().checked)fireEvent.click(raw());
 const gross=()=>screen.getByLabelText(/I confirm empty-platform zeroing/);
 await waitFor(()=>assert(!gross().disabled),{timeout:5000});if(!gross().checked)fireEvent.click(gross());
 await waitFor(()=>assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'657.0 g'));
}
try{
 await real('/auth/session');const login=await real('/auth/login',{email:'phase35-proxy@example.invalid',password:'Fixture-only-password-123!'});authenticated=login.data.authenticated;assert(authenticated);
 const anonymous=await actual(base+'/api/v1/scale-reading');assert.equal(anonymous.status,401);
 await real('/scale-reading'); // Existing authenticated PHP read boundary; device-auth tests are prior evidence.
 const old=await real('/stock');const brand=old.state.brands.find(b=>b.name==='Numaker');assert(brand&&brand.active&&brand.defaultTare===193&&!brand.defaultTareVerified,'Reuse the existing fixture brand without creating one');
 const batchList=(await real('/qr-batches')).data;const existing=batchList.find(b=>Number(b.unused)>0);assert(existing,'Existing disposable UNUSED labels required; do not regenerate');
 const batch=(await real('/qr-batches/'+existing.id)).data;const label=batch.labels.find(l=>l.state==='UNUSED')?.id;assert(label);
 const labelIds=batch.labels.map(l=>l.id);const brandBefore=structuredClone(brand),protectedSpool=structuredClone(old.state.spools.find(p=>p.code==='PLA_WHITE_01'));
 const next=Math.max(0,...old.state.spools.filter(p=>/^PLA_WHITE_\d+$/.test(p.code)).map(p=>Number(p.code.split('_').at(-1))))+1;
 const expectedCode='PLA_WHITE_'+String(next).padStart(2,'0');
 globalThis.fetch=async(url,options={})=>{
  if(url==='/api/v1/scale-reading'){
   assert(authenticated&&cookie,'Wi-Fi API simulation only after real user authentication');
   if(wifiMode==='network-error')throw new TypeError('Simulated Wi-Fi API network disconnect');
   const age=wifiMode==='stale'?501:0;
   return new Response(JSON.stringify({configured:true,online:true,reading:{frame:frame(),bootId:'a'.repeat(32),receivedAtMs:Date.now()-age,ageMs:age}}),{headers:{'Content-Type':'application/json'}});
  }
  const method=(options.method??'GET').toUpperCase();
  assert(!(url==='/api/v1/qr-batches'&&method==='POST'),'No QR generation in combined verification');
  const r=await actual(base+url,{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{}),...(method==='POST'?{Origin:'http://127.0.0.1:5173'}:{})}});
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
  const data=await r.clone().json();if(data.data?.csrfToken)csrf=data.data.csrfToken;
  // Root-cause fix: the API client explicitly sets GET; omitted method is GET too.
  if(url==='/api/v1/stock'&&method==='GET'&&r.ok){assert(Number.isInteger(data.revision)&&Array.isArray(data.state?.spools),'Stock snapshot response contract');snapshot=data;stockSnapshots.push(data.revision);}
  if(url==='/api/v1/stock'&&method==='POST'){
   const body=JSON.parse(options.body);const entry={body,status:r.status,key:options.headers['Idempotency-Key'],responseLost:false};writes.push(entry);
   if(dropNextEstimateResponse&&body.action.type==='manual-estimate'&&r.ok){dropNextEstimateResponse=false;entry.responseLost=true;throw new TypeError('Simulated lost inventory response after database commit');}
  }
  return r;
 };
 render(React.createElement(App));await screen.findByText('Studio API connected');assert(snapshot,'Initial explicit GET stock snapshot captured');
 fireEvent.click(screen.getByRole('button',{name:'Add spool',exact:true}));fill('Scanned QR text or spool code','DL3D:LABEL:'+label);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Select from QR text'})));await screen.findByText(/UNUSED label verified: QL-/);
 fill('Spool name','QR WiFi Phase9 '+label.slice(0,8));fill('Brand',brand.id);fill('Material','PLA+');fill('Colour name','White');fill('Spool type','Unknown');fill('Starting filament mass (g)','982');fill('Remaining filament mass (g)','982');
 fireEvent.click(screen.getByRole('button',{name:'Review new spool'}));assert.equal(writes.length,0);
 fireEvent.click(screen.getByLabelText('I checked this physical spool, tare and proposed balance'));fireEvent.click(screen.getByRole('button',{name:'Confirm & save spool'}));
 await waitFor(()=>assert(!screen.queryByRole('dialog')));
 assert.equal(writes.length,1);assert.equal(writes[0].status,200);assert.equal(writes[0].body.action.qrLabelId,label);
 let p=snapshot.state.spools.find(p=>p.qrLabelId===label);
 assert(p&&p.code===expectedCode&&p.remaining===982&&!p.measured);assert(!old.state.spools.some(previous=>previous.id===p.id||previous.code===p.code));
 const id=p.id,total=snapshot.state.spools.length;assert.equal(total,old.state.spools.length+1);assert.equal(snapshot.revision,old.revision+1);
 assert.equal((await real('/qr-labels/'+label)).data.spoolId,id);
 nav('NFC & scale');await screen.findByText('Wi-Fi online');fill('Scanned QR text or spool code','DL3D:LABEL:'+label);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Select from QR text'})));await screen.findByText(`Selected ${expectedCode}. Inventory unchanged.`);
 await acknowledgeGross();
 const panel=()=>screen.getByRole('region',{name:'Live remaining filament'});
 assert(within(panel()).getByText('982 g'));assert(within(panel()).getByText('65.7%'));assert(screen.getByText('UNVERIFIED ESTIMATE - FILAMENT'));assert.equal(writes.length,1);
 const registeredRevision=snapshot.revision,registeredHistory=historyFor(snapshot,id).length;
 fireEvent.click(screen.getByRole('button',{name:'Review & Save Estimate'}));assert(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}).disabled);assert.equal(writes.length,1);
 fireEvent.click(screen.getByLabelText('I approve saving this manual UNVERIFIED estimate for this spool'));assert.equal(writes.length,1);
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}));await screen.findByText('Manual UNVERIFIED estimate saved. No scale measurement recorded.');
 assert.equal(writes.length,2);assert.equal(writes[1].status,200);assert.equal(writes[1].body.action.source,'live-preview-wifi');
 p=target(snapshot,id);assert.equal(p.remaining,657);assert.equal(p.tare,193);assert(p.tareProvisional&&!p.measured&&p.gross===null);assert.equal(snapshot.state.spools.length,total);assert(within(panel()).getByText('657 g'));
 assert.equal(snapshot.revision,registeredRevision+1);assert.equal(historyFor(snapshot,id).length,registeredHistory+1);assert(historyFor(snapshot,id).some(e=>e.note.includes('UNVERIFIED manual estimate; source live-preview-wifi; captured')));
 // Duplicate assignment: real API rejection must leave all state/revision/history intact.
 const beforeDuplicate=await real('/stock');let duplicate;
 await act(async()=>{duplicate=await request('/stock',{revision:beforeDuplicate.revision,action:writes[0].body.action});});
 assert.equal(duplicate.status,409);assert.equal(duplicate.data.code,'qr_not_unused');assert.deepEqual(await real('/stock'),beforeDuplicate);safety.duplicateQr=true;
 // Freshness failure blocks confirmation and never posts a hidden update.
 review();const beforeStale=await real('/stock');wifiMode='stale';await waitFor(()=>assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'Unavailable'));
 assert(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}).disabled);assert.equal(writes.length,2);assert.deepEqual(await real('/stock'),beforeStale);cancelReview();safety.stale=true;
 wifiMode='fresh';await acknowledgeGross();
 // Network loss invalidates the frozen review; recovery does not save it.
 review();wifiMode='network-error';await waitFor(()=>assert.equal(screen.getByLabelText('Live remaining filament weight').textContent,'Unavailable'));
 assert(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}).disabled);assert.equal(writes.length,2);
 wifiMode='fresh';await screen.findByText('Wi-Fi online',{}, {timeout:5000});assert(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}).disabled);cancelReview();await acknowledgeGross();assert.equal(writes.length,2);safety.networkDisconnect=true;
 // Two clients submit confirmed saves for the same frozen version/revision.
 const beforeRace=await real('/stock');const raceP=target(beforeRace,id);review();let competing;
 await act(async()=>{
  const other=request('/stock',{revision:beforeRace.revision,action:{type:'manual-estimate',id,version:raceP.version,confirmed:true,gross:'900.00',tare:'193.00',capturedAt:new Date().toISOString(),source:'live-preview-wifi'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}));competing=await other;
 });
 await waitFor(()=>assert.equal(writes.length,3));await waitFor(()=>assert(!screen.getByRole('button',{name:'Review & Save Estimate'}).disabled));
 assert.deepEqual([writes[2].status,competing.status].sort(),[200,409]);
 const afterRace=await real('/stock');assert.equal(afterRace.revision,beforeRace.revision+1);assert.equal(target(afterRace,id).version,raceP.version+1);assert.equal(target(afterRace,id).remaining,writes[2].status===200?657:707);assert.equal(historyFor(afterRace,id).length,historyFor(beforeRace,id).length+1);safety.concurrentSaves=true;
 const reload=screen.queryByRole('button',{name:'Reload stock'});if(reload){fireEvent.click(reload);await waitFor(()=>assert.equal(snapshot.revision,afterRace.revision));}
 cancelReview();
 // Explicit stock reload intentionally remounts the page and clears selection.
 if(!screen.getByLabelText('Spool for measurement').value){fill('Scanned QR text or spool code','DL3D:LABEL:'+label);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Select from QR text'})));await screen.findByText(`Selected ${expectedCode}. Inventory unchanged.`);}
 await acknowledgeGross();
 // A committed POST with a lost response may be retried only with the same key.
 const beforeLost=await real('/stock');review();dropNextEstimateResponse=true;
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}));await screen.findAllByText(/Unable to reach the PHP API/);
 assert.equal(writes.length,4);assert(writes[3].responseLost);const committed=await real('/stock');assert.equal(committed.revision,beforeLost.revision+1);assert.equal(target(committed,id).remaining,657);
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save UNVERIFIED estimate'}));await screen.findByText('Manual UNVERIFIED estimate saved. No scale measurement recorded.');
 assert.equal(writes.length,5);assert.equal(writes[3].key,writes[4].key);assert.deepEqual(writes[3].body,writes[4].body);
 const final=await real('/stock');assert.equal(final.revision,committed.revision);assert.equal(historyFor(final,id).length,historyFor(beforeLost,id).length+1);assert.equal(final.state.spools.length,total);assert.equal(target(final,id).remaining,657);assert(!target(final,id).measured&&target(final,id).gross===null);safety.lostResponseRetry=true;
 if(protectedSpool)assert.deepEqual(final.state.spools.find(p=>p.id===protectedSpool.id),protectedSpool,'Pre-existing fixture PLA_WHITE_01 must not be modified');
 assert.deepEqual(final.state.brands.find(b=>b.id===brand.id),brandBefore);assert.deepEqual((await real('/qr-batches/'+batch.id)).data.labels.map(l=>l.id),labelIds);assert.equal((await real('/qr-batches')).data.length,batchList.length);
 nav('Activity');await screen.findAllByText(/UNVERIFIED manual estimate; source live-preview-wifi; captured/);
 mkdirSync('test-results',{recursive:true});writeFileSync('test-results/phase9-qr-wifi.json',JSON.stringify({passed:true,disposableDatabase:process.env.DLOOP_PHASE9_DB,newFixtureSpoolCode:expectedCode,initialRevision:old.revision,finalRevision:final.revision,safety,explicitGetSnapshots:stockSnapshots.length,qrBatchRegenerated:false,migrationsApplied:false,wifiTransport:'simulated API boundary after real user authentication',physicalHardwareTested:false},null,2));
 console.log('PASS: combined QR + Wi-Fi + inventory E2E with real React/PHP/MySQL and existing disposable labels: atomic add/bind, assigned rescan same spool, 850-193=657 / 65.7%, UNVERIFIED explicit save, history/revisions, duplicate/stale/disconnect guards, concurrent save conflict and same-key lost-response retry. No batch generation, migrations, credential changes or real hardware.');
}finally{cleanup();globalThis.fetch=actual;dom.window.close();}
