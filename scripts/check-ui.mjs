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
  assert(screen.getByRole('button', {name: 'Save spool'}).disabled);
  await waitFor(() => assert.equal(document.querySelectorAll('nav button').length, 7));
  assert(calls.every(c => c.method === 'GET'));
  console.log('PASS: all seven view headings and navigation states; populated spool/catalogue/activity rendering; disconnected notice and disabled inventory saves. Fixtures only, no D1 access.');
} finally {
  cleanup(); globalThis.fetch = originalFetch; dom.window.close();
}
