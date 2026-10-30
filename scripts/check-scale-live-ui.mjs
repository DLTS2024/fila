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
const base=process.env.DLOOP_TEST_URL||'http://127.0.0.1:5173';assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const React=await import('react');
const {render,screen,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react');
const {default:App}=await import('../app/authenticated-studio.tsx');
const {writeFileSync,mkdirSync}=await import('node:fs');
const actualFetch=globalThis.fetch;
let cookie,csrf,snapshot,loseFirst=true;
const measurementRequests=[];
globalThis.fetch=async(url,options={})=>{
 const response=await actualFetch(base+url,{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{}),...(options.method==='POST'?{Origin:'http://127.0.0.1:5173'}:{})}});
 if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
 const data=await response.clone().json();
 if(String(url).startsWith('/api/v1/auth/')&&data.data?.csrfToken)csrf=data.data.csrfToken;
 if(url==='/api/v1/stock'&&response.ok&&options.method==='GET')snapshot=data;
 if(/\/measurements$/.test(url)&&options.method==='POST'){
  const body=JSON.parse(options.body);measurementRequests.push({path:url,key:options.headers['Idempotency-Key'],body,status:response.status});
  if(response.ok&&loseFirst&&body.reading?.transport==='simulator'){loseFirst=false;throw new TypeError('Lost acknowledgement after real simulator confirmation committed.');}
 }
 return response;
};
try{
 render(React.createElement(App));await screen.findByRole('button',{name:'Sign in'});
 fireEvent.change(screen.getByLabelText('Email'),{target:{value:'phase35-proxy@example.invalid'}});fireEvent.change(screen.getByLabelText('Password'),{target:{value:'Fixture-only-password-123!'}});fireEvent.click(screen.getByRole('button',{name:'Sign in'}));await screen.findByText('Studio API connected');
 const name='Scale UI '+Date.now(),brand=snapshot.state.brands.find(b=>b.active);assert(brand);
 const setup=await actualFetch(base+'/api/v1/stock',{method:'POST',headers:{Cookie:cookie,Origin:'http://127.0.0.1:5173','Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({revision:snapshot.revision,action:{type:'add',confirmed:true,spool:{name,brandId:brand.id,material:'PLA',colorName:'SCALEUI',color:'#333333',spoolType:'Scale test only',capacity:'1000',initial:'1000',remaining:'800',mode:'manual',registrationKind:'partial',profileId:null,tareOverride:'220',location:'Disposable test',catalogueId:null}}})});assert.equal(setup.status,200);
 const created=(await setup.json()).state.spools.find(p=>p.name===name);assert(created&&created.nfc==='');
 cleanup();render(React.createElement(App));await screen.findByText('Studio API connected');
 const initialRevision=snapshot.revision;
 fireEvent.click([...document.querySelectorAll('nav button')].find(b=>b.textContent.startsWith('NFC & scale')));
 fireEvent.change(screen.getByLabelText('Spool for measurement'),{target:{value:created.id}});assert.equal(screen.getByLabelText('Optional NFC UID').value,'');
 fireEvent.click(screen.getByRole('button',{name:'Simulator (no hardware)'}));fireEvent.click(screen.getByRole('button',{name:'Start scale simulator'}));
 await screen.findByText('984.60 g');assert.equal(measurementRequests.length,0);
 fireEvent.click(screen.getByLabelText('Simulator stable'));await screen.findByText('Unstable');assert(screen.getByRole('button',{name:'Review scale measurement'}).disabled);
 fireEvent.click(screen.getByLabelText('Simulator calibrated'));await screen.findByText('Not calibrated');assert(screen.getByRole('button',{name:'Review scale measurement'}).disabled);
 fireEvent.click(screen.getByLabelText('Simulator sensor fault'));await screen.findByText('Sensor fault');assert(screen.getByRole('button',{name:'Review scale measurement'}).disabled);
 fireEvent.click(screen.getByLabelText('Simulator sensor fault'));fireEvent.click(screen.getByLabelText('Simulator calibrated'));fireEvent.click(screen.getByLabelText('Simulator stable'));await screen.findByText('Stable · calibrated');
 fireEvent.click(screen.getByLabelText('Pause simulator stream'));
 fireEvent.click(screen.getByRole('button',{name:'Review scale measurement'}));assert.equal(measurementRequests.length,0);fireEvent.click(screen.getByLabelText('I understand simulated data will update the selected inventory record'));
 await waitFor(()=>assert(screen.getByRole('button',{name:'Confirm & save measurement'}).disabled),{timeout:7000});assert.equal(measurementRequests.length,0);
 fireEvent.click(screen.getByRole('button',{name:'Cancel review'}));
 fireEvent.change(screen.getByLabelText('Custom simulator frame'),{target:{value:'{broken'}});fireEvent.click(screen.getByRole('button',{name:'Send simulator frame'}));await screen.findByText('Invalid protocol data');assert.equal(measurementRequests.length,0);
 fireEvent.click(screen.getByLabelText('Pause simulator stream'));await screen.findByText('Stable · calibrated');
 fireEvent.click(screen.getByRole('button',{name:'Review scale measurement'}));assert(screen.getByText('764.60 g'));assert(screen.getByText('-35.40 g'));assert.equal(measurementRequests.length,0);
 fireEvent.click(screen.getByLabelText('I understand simulated data will update the selected inventory record'));fireEvent.click(screen.getByRole('button',{name:'Confirm & save measurement'}));
 await screen.findAllByText(/Unable to reach the PHP API/);assert.equal(measurementRequests.length,1);
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5100));});
 assert(!screen.getByRole('button',{name:'Retry this confirmation'}).disabled);
 fireEvent.click(screen.getByRole('button',{name:'Retry this confirmation'}));
 await waitFor(()=>assert.equal(screen.queryByText('Frozen measurement preview')===null,true));
 assert.equal(measurementRequests.length,2);assert.equal(measurementRequests[0].key,measurementRequests[1].key);assert.deepEqual(measurementRequests[0].body,measurementRequests[1].body);assert.equal(measurementRequests[0].body.reading.uid,undefined);assert.equal(measurementRequests[0].body.reading.transport,'simulator');
 assert.equal(snapshot.state.spools.find(p=>p.id===created.id).remaining,764.6);assert.equal(snapshot.revision,initialRevision+1);
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,600));});assert.equal(measurementRequests.length,2);
 fireEvent.click(screen.getByRole('button',{name:'Disconnect'}));await screen.findByText('disconnected');
 fireEvent.change(screen.getByLabelText('Manual gross weight (g)'),{target:{value:'900'}});fireEvent.click(screen.getByRole('button',{name:'Review manual measurement'}));assert(screen.getByText('680.00 g'));
 fireEvent.click(screen.getByLabelText('I checked this spool, tare and proposed balance'));fireEvent.click(screen.getByRole('button',{name:'Confirm & save measurement'}));
 await waitFor(()=>assert.equal(screen.queryByText('Frozen measurement preview')===null,true));assert.equal(measurementRequests.length,3);assert.equal(measurementRequests[2].body.reading,undefined);assert.equal(snapshot.state.spools.find(p=>p.id===created.id).remaining,680);assert.equal(snapshot.revision,initialRevision+2);
 fireEvent.click(screen.getByRole('button',{name:'Start scale simulator'}));await screen.findByText('Simulator connected');await screen.findByText('984.60 g');assert.equal(measurementRequests.length,3);
 fireEvent.click([...document.querySelectorAll('nav button')].find(b=>b.textContent.startsWith('Overview')));fireEvent.click(screen.getByRole('button',{name:'Sign out'}));await screen.findByRole('button',{name:'Sign in'});
 mkdirSync('backend/var/phase5a',{recursive:true});writeFileSync('backend/var/phase5a/ui-scale-results.json',JSON.stringify({spoolId:created.id,zeroWritesBeforeConfirmation:true,replayedAfterExpiry:true,requests:3,committedMeasurements:2,simulatorNet:764.6,manualNet:680,revisionDelta:2,noNFC:true,verifiedAt:new Date().toISOString()},null,2));
 console.log('PASS: real simulator → React → Vite → existing PHP measurement endpoint → MariaDB; no NFC, zero pre-confirmation writes, unsafe/stale/malformed blocking, frozen preview, lost acknowledgement replay after expiry without duplicate write, disconnect/reconnect, manual fallback and logout.');
}finally{cleanup();globalThis.fetch=actualFetch;dom.window.close();}
