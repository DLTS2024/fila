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
const React = await import('react');
const {render, screen, fireEvent, waitFor, cleanup} = await import('@testing-library/react');
const {default: Studio} = await import('../app/page.tsx');
const {default: AuthenticatedStudio} = await import('../app/authenticated-studio.tsx');
const fixture = {
  revision: 1,
  state: {
    spools: [{id: 'test-spool', name: 'Test Black PLA', brand: 'Test Brand', material: 'PLA', color: '#222222', initial: 1000, remaining: 680, tare: 220, location: 'Shelf', measured: true}],
    history: [{id: 'test-event', date: '2026-10-29T10:00:00Z', type: 'weigh', name: 'Test measurement', printer: '', note: 'Fixture only', changes: [{id: 'test-spool', before: 700, after: 680, measuredBefore: false, measuredAfter: true}]}],
    slots: {'kobra-1': 'test-spool'},
    catalogue: [{id: 'test-product', name: 'Test product', brand: 'Test Brand', material: 'PLA', color: '#222222', diameter: 1.75, temperature: 210, bed: 60, tare: 220, price: 1000}],
  },
};
const originalFetch = globalThis.fetch;
const calls = [];
try {
  globalThis.fetch = async (url, options) => {
    calls.push({url, method: options.method});
    assert.equal(options.method, 'GET');
    return new Response(JSON.stringify(url.endsWith('/stock') ? fixture : {reading: null}), {headers: {'Content-Type': 'application/json'}});
  };
  render(React.createElement(Studio));
  await screen.findByText('Studio API connected');
  const pages = [
    ['Overview', 'A little less guesswork.'],
    ['Spool library', 'Every spool, accounted for.'],
    ['Catalogue', 'Your material reference.'],
    ['NFC & scale', 'The right roll. The right weight.'],
    ['Printers', 'Your print corner.'],
    ['Activity', 'The story of your stock.'],
    ['Backup & help', 'Your studio, backed up.'],
  ];
  for (const [name, heading] of pages) {
    const nav = document.querySelector('nav');
    const button = [...nav.querySelectorAll('button')].find(b => b.textContent.startsWith(name));
    assert(button, `Missing navigation: ${name}`);
    fireEvent.click(button);
    await screen.findByRole('heading', {level: 1, name: heading});
    assert(button.classList.contains('active'), `Navigation did not activate ${name}`);
    if (name === 'Spool library') assert(screen.getByText('Test Black PLA'));
    if (name === 'Catalogue') assert(screen.getByText('Test product'));
    if (name === 'Activity') assert(screen.getByText('Fixture only'));
  }
  cleanup();
  globalThis.fetch = async () => new Response('No PHP backend', {status: 404, headers: {'Content-Type': 'text/html'}});
  render(React.createElement(Studio));
  await screen.findByText('Inventory offline');
  assert(screen.getByRole('button', {name: 'Add spool'}).disabled);
  assert(screen.getByText(/Inventory has not been loaded/));
  fireEvent.click(screen.getByRole('button', {name: 'Add your first spool'}));
  assert(screen.getByRole('button', {name: 'Review new spool'}).disabled);
  await waitFor(() => assert.equal(document.querySelectorAll('nav button').length, 7));
  assert(calls.every(c => c.method === 'GET'));
  cleanup();
  const localCalls=[];
  const localSession={authenticated:false,user:null,csrfToken:'a'.repeat(64),accessMode:'LOCAL_SINGLE_USER'};
  globalThis.fetch=async(url,options)=>{
    localCalls.push({url,method:options.method});
    if(url.endsWith('/auth/session'))return new Response(JSON.stringify({data:localSession}),{headers:{'Content-Type':'application/json'}});
    if(url.endsWith('/auth/local-bootstrap')){
      assert.equal(options.method,'POST');assert.equal(options.headers['X-CSRF-Token'],localSession.csrfToken);
      return new Response(JSON.stringify({data:{...localSession,authenticated:true,user:{id:'1',email:'fixture@example.invalid',role:'admin'},csrfToken:'b'.repeat(64)}}),{headers:{'Content-Type':'application/json'}});
    }
    assert(url.endsWith('/stock'));assert.equal(options.method,'GET');
    return new Response(JSON.stringify(fixture),{headers:{'Content-Type':'application/json'}});
  };
  render(React.createElement(AuthenticatedStudio));await screen.findByText('Studio API connected');
  assert.equal(screen.queryByLabelText('Email'),null);assert.equal(screen.queryByLabelText('Password'),null);assert.equal(screen.queryByRole('button',{name:'Sign out'}),null);
  assert(screen.getByText('Local company workspace'));assert.equal(document.querySelectorAll('nav button').length,7);
  assert.equal(localCalls.filter(c=>c.method!=='GET').length,1);assert(localCalls.some(c=>c.url.endsWith('/auth/local-bootstrap')));
  cleanup();
  globalThis.fetch=async(url)=>new Response(JSON.stringify(url.endsWith('/auth/session')?{data:localSession}:{error:'Local session denied'}),{status:url.endsWith('/auth/session')?200:403,headers:{'Content-Type':'application/json'}});
  render(React.createElement(AuthenticatedStudio));await screen.findByText('Local session denied');assert.equal(screen.queryByLabelText('Password'),null);assert(screen.getByRole('button',{name:'Retry local session'}));
  cleanup();
  globalThis.fetch=async()=>new Response(JSON.stringify({data:{...localSession,accessMode:'AUTHENTICATED'}}),{headers:{'Content-Type':'application/json'}});
  render(React.createElement(AuthenticatedStudio));await screen.findByRole('button',{name:'Sign in'});assert(screen.getByLabelText('Email'));assert(screen.getByLabelText('Password'));
  console.log('PASS: seven dashboard views and inventory rendering; LOCAL_SINGLE_USER CSRF bootstrap without login/logout screen, fail-closed bootstrap error, normal authenticated login preserved. No inventory writes.');
} finally {
  cleanup(); globalThis.fetch = originalFetch; dom.window.close();
}
