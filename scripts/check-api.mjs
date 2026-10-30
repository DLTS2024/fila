import ts from 'typescript';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const code = ts.transpile(readFileSync('lib/api.ts', 'utf8'), {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022});
const {studioApi, setCsrfToken, ApiError} = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const original = globalThis.fetch;
try {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/stock');
    assert.equal(options.credentials, 'same-origin');
    return new Response(JSON.stringify({revision: 0, state: {spools: [], history: [], slots: {}}}), {headers: {'Content-Type': 'application/json'}});
  };
  await studioApi.getStock();
  setCsrfToken('test-csrf');
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/stock'); assert.equal(options.method, 'POST');
    assert.equal(options.headers['X-CSRF-Token'], 'test-csrf');
    assert.deepEqual(JSON.parse(options.body), {revision: 4, action: {type: 'weigh'}});
    return new Response(JSON.stringify({error: 'Conflict'}), {status: 409, headers: {'Content-Type': 'application/json'}});
  };
  await assert.rejects(studioApi.updateStock(4, {type: 'weigh'}), e => e instanceof ApiError && e.status === 409);
  globalThis.fetch = async () => new Response('<html>SPA fallback</html>', {headers: {'Content-Type': 'text/html'}});
  await assert.rejects(studioApi.getStock(), /expected JSON/);
  globalThis.fetch = async () => new Response(JSON.stringify({revision: 0}), {headers: {'Content-Type': 'application/json'}});
  await assert.rejects(studioApi.getStock(), /invalid response/);
  globalThis.fetch = async () => {throw Error('offline')};
  await assert.rejects(studioApi.getStock(), /Unable to reach/);
  console.log('PASS: relative API URL, same-origin credentials, CSRF header, mutation payload, conflict, HTML fallback, invalid response and network errors.');
} finally {globalThis.fetch = original;}
