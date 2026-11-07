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
assert.equal(process.env.DLOOP_DISPOSABLE_TEST,'yes','Explicit disposable integration opt-in required.');
const live=process.env.DLOOP_TEST_URL||'http://127.0.0.1:5173';
assert(['127.0.0.1','localhost'].includes(new URL(live).hostname));
const React=await import('react');
const {render,screen,fireEvent,waitFor,cleanup}=await import('@testing-library/react');
const {default:App}=await import('../app/authenticated-studio.tsx');
const {writeFileSync}=await import('node:fs');
const actualFetch=globalThis.fetch;
let cookie,csrf,lastSnapshot,loseFirstAdd=true,loseFirstMeasurement=true,createdId;
const writes=[];
globalThis.fetch=async(url,options={})=>{
 const headers={...options.headers,...(cookie?{Cookie:cookie}:{}),...(options.method==='POST'?{Origin:'http://127.0.0.1:5173'}:{})};
 const response=await actualFetch(live+url,{...options,headers});
 if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
 const json=await response.clone().json();
 if(String(url).startsWith('/api/v1/auth/')&&json.data?.csrfToken)csrf=json.data.csrfToken;
 if(url==='/api/v1/stock'&&options.method==='GET'&&response.ok)lastSnapshot=json;
 if(url==='/api/v1/stock'&&options.method==='POST'){
  const body=JSON.parse(options.body);writes.push({key:headers['Idempotency-Key'],body,status:response.status});
  if(body.action.type==='add'&&response.ok&&loseFirstAdd){loseFirstAdd=false;createdId=json.state.spools.find(p=>p.name===body.action.spool.name)?.id;throw new TypeError('Simulated lost response AFTER the real server committed.');}
  if(body.action.type==='update'&&body.action.spool.mode==='gross'&&response.ok&&loseFirstMeasurement){loseFirstMeasurement=false;return new Response(JSON.stringify({error:'Simulated gateway failure after committed measurement.'}),{status:503,headers:{'Content-Type':'application/json'}});}
 }
 return response;
};
try{
 render(React.createElement(App));
 await screen.findByRole('button',{name:'Sign in'});
 fireEvent.change(screen.getByLabelText('Email'),{target:{value:process.env.DLOOP_TEST_EMAIL||'phase3-test@example.invalid'}});
 fireEvent.change(screen.getByLabelText('Password'),{target:{value:'Fixture-only-password-123!'}});
 fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
 await screen.findByText('Studio API connected');console.log('UI: authenticated inventory loaded');
 cleanup();render(React.createElement(App));
 await screen.findByText('Studio API connected');
 assert.equal(document.querySelectorAll('nav button').length,7);
 for(const page of ['Spool library','Catalogue','NFC & scale','Printers','Activity','Backup & help','Overview']){
  const button=[...document.querySelectorAll('nav button')].find(b=>b.textContent.startsWith(page));fireEvent.click(button);assert(button.classList.contains('active'));
 }
 const brand=lastSnapshot.state.brands.find(b=>b.name==='Verified Brand'&&b.active);assert(brand);
 const profile=lastSnapshot.state.profiles.find(p=>p.brandId===brand.id&&p.verified&&p.active&&p.spoolType==='Plastic 1 kg');assert(profile);
 const name='UI live spool '+Date.now();
 fireEvent.click(screen.getByRole('button',{name:'Add spool',exact:true}));
 assert.equal(screen.getByLabelText('Starting filament mass (g)').value,'');
 fireEvent.change(screen.getByLabelText('Spool name'),{target:{value:name}});
 fireEvent.change(screen.getByLabelText('Brand'),{target:{value:brand.id}});
 fireEvent.change(screen.getByLabelText('Colour name'),{target:{value:'UIBLACK'}});
 fireEvent.change(screen.getByLabelText('Starting filament mass (g)'),{target:{value:'1000'}});
 fireEvent.change(screen.getByLabelText('Remaining filament mass (g)'),{target:{value:'500'}});
 fireEvent.change(screen.getByLabelText('Empty spool profile'),{target:{value:profile.id}});
 fireEvent.change(screen.getByLabelText('Physical spool tare override (g)'),{target:{value:'220'}});
 fireEvent.click(screen.getByLabelText('I independently measured this individual spool tare'));
 assert.equal(writes.length,0);
 fireEvent.click(screen.getByRole('button',{name:'Review new spool'}));
 assert(screen.getByRole('button',{name:'Confirm & save spool'}).disabled);
 assert.equal(writes.length,0);
 fireEvent.click(screen.getByLabelText('I checked this physical spool, tare and proposed balance'));
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save spool'}));
 await screen.findAllByText(/Unable to reach the PHP API/);
 assert(createdId,'The real PHP server must have committed before response loss.');
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save spool'}));
 await waitFor(()=>assert.equal(screen.queryByRole('dialog')===null,true));
 console.log('UI: lost-response retry confirmed');assert.equal(writes.length,2);assert.equal(writes[0].key,writes[1].key);assert.deepEqual(writes[0].body,writes[1].body);
 assert.equal(lastSnapshot.state.spools.filter(p=>p.name===name).length,1);
 fireEvent.click(screen.getByRole('button',{name:'Update '+name}));
 fireEvent.change(screen.getByLabelText('Balance entry'),{target:{value:'gross'}});
 fireEvent.change(screen.getByLabelText('Gross weight on scale (g)'),{target:{value:'900'}});
 fireEvent.click(screen.getByRole('button',{name:'Review update'}));
 assert(screen.getByText('680.00 g'));
 fireEvent.click(screen.getByLabelText('I checked this physical spool, tare and proposed balance'));
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save spool'}));
 await screen.findAllByText(/Simulated gateway failure after committed measurement/);
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save spool'}));
 await waitFor(()=>assert.equal(screen.queryByRole('dialog')===null,true));
 assert.equal(lastSnapshot.state.spools.find(p=>p.id===createdId).remaining,680);
 const measurements=writes.filter(w=>w.body.action.type==='update'&&w.body.action.spool.mode==='gross');assert.equal(measurements.length,2);assert.equal(measurements[0].key,measurements[1].key);assert.deepEqual(measurements[0].body,measurements[1].body);
 fireEvent.click(screen.getByRole('button',{name:'Update '+name}));
 fireEvent.change(screen.getByLabelText('Remaining filament mass (g)'),{target:{value:'650'}});
 fireEvent.click(screen.getByRole('button',{name:'Review update'}));
 const p=lastSnapshot.state.spools.find(p=>p.id===createdId);
 const external={revision:lastSnapshot.revision,action:{type:'update',id:p.id,version:p.version,confirmed:true,spool:{name:p.name,brandId:p.brandId,material:p.material,colorName:p.colorName,color:p.color,spoolType:p.spoolType,capacity:p.capacity,initial:p.initial,remaining:'720',mode:'manual',registrationKind:p.registrationKind,profileId:p.profileId,tareOverride:p.tareOverride,location:p.location,catalogueId:p.catalogueId||null,status:p.status}}};
 const other=await actualFetch(live+'/api/v1/stock',{method:'POST',headers:{Cookie:cookie,Origin:'http://127.0.0.1:5173','Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(external)});assert.equal(other.status,200);
 fireEvent.click(screen.getByLabelText('I checked this physical spool, tare and proposed balance'));
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save spool'}));
 await screen.findAllByText(/Inventory changed in another session/);
 fireEvent.click(screen.getByRole('button',{name:'Reload stock'}));
 await screen.findByText(/This spool changed. Close and reopen/);
 assert(screen.getByRole('button',{name:'Confirm & save spool'}).disabled);
 fireEvent.click(screen.getByRole('button',{name:'Close dialog'}));
 fireEvent.click(screen.getByRole('button',{name:'Update '+name}));
 assert.equal(screen.getByLabelText('Remaining filament mass (g)').value,'720');
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 fireEvent.click(screen.getByRole('button',{name:'Sign out'}));
 await screen.findByRole('button',{name:'Sign in'});
 assert.equal(screen.getByLabelText('Password').value,'');
 writeFileSync('backend/var/phase4/ui-results.json',JSON.stringify({spoolId:createdId,retriedSameKey:true,retriedMeasurementKey:true,duplicateRegistrations:0,confirmedGrossNet:680,externalBalance:720,conflictProtected:true,sessionRestored:true,loggedOut:true,verifiedAt:new Date().toISOString()},null,2));
 console.log('PASS: real React/jsdom → Vite → PHP → MariaDB login/session restoration; seven views; two-step registration; lost-response retry creates one spool; gross correction; external conflict/reload protection; logout.');
}finally{cleanup();globalThis.fetch=actualFetch;dom.window.close();}
