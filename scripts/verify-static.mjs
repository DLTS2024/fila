import { globSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const files = globSync('dist/**/*', { exclude: p => p.includes('node_modules') }).filter(p => /\.[^/\\]+$/.test(p));
assert(files.some(p => p.replaceAll('\\', '/') === 'dist/index.html'));
for (const file of files) {
  assert(/\.(html|css|js|svg|ino|md|h)$/.test(file), `Unexpected deployment file: ${file}`);
  assert(!/(server|node_modules|wrangler|secrets(?!\.example))/i.test(file), `Unsafe deployment path: ${file}`);
  if (/\.(js|html)$/.test(file)) assert(!/cloudflare:workers|vinext\/|drizzle-orm|SCALE_DEVICE_TOKEN|node:async_hooks/.test(readFileSync(file, 'utf8')), `Server dependency or secret in ${file}`);
}
console.log(`PASS: ${files.length} static files; no server bundle, Worker/D1 imports or device token identifiers.`);
