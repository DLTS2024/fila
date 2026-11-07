import {readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.argv[2];assert(root,'Supply a prepared review artifact directory.');
const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.equal(manifest.deployed,false);assert.equal(manifest.credentialsIncluded,false);
let count=0;
for(const file of manifest.files){const name=path.resolve(root,file.path);assert(name.startsWith(path.resolve(root)+path.sep));assert.equal(createHash('sha256').update(readFileSync(name)).digest('hex'),file.sha256);count++;}
const files=[];function walk(dir){for(const f of readdirSync(dir)){const n=path.join(dir,f);if(statSync(n).isDirectory())walk(n);else files.push(n)}}walk(root);
const forbidden=[];
try{for(const line of readFileSync('.dev.vars','utf8').split(/\r?\n/)){const m=line.match(/^\s*(?:SCALE_DEVICE_TOKEN|DLOOP_DB_PASSWORD)\s*=\s*["']?([^"'\r\n]+?)["']?\s*$/);if(m&&m[1].length>=16)forbidden.push(m[1]);}}catch{}
for(const name of files){assert(!/(?:wifi_private\.h|\.env|\.dev\.vars|\.bin|\.elf|\.sql\.gz)$/.test(name));const content=readFileSync(name,'utf8');for(const secret of forbidden)assert(!content.includes(secret),'Private local secret detected in artifact; value withheld.');}
assert(readFileSync(path.join(root,'private/config.local.php'),'utf8').includes("'access_mode'=>'AUTHENTICATED'"));
assert(readFileSync(path.join(root,'public/api/v1/index.php'),'utf8').includes('Private application path required.'));
assert(!files.some(f=>path.relative(root,f).replaceAll('\\','/').startsWith('public/scale/')));
assert.equal(files.length,manifest.files.length+1,'Manifest must cover every artifact file except itself');
for(const file of readdirSync('backend/migrations').filter(f=>f.endsWith('.sql'))){
 assert.equal(readFileSync(path.join(root,'private/migrations',file),'utf8'),readFileSync('backend/migrations/'+file,'utf8'));
}
const expected=manifest.environment==='staging'?'backend/config.staging.example.php':'backend/config.production.example.php';
assert.equal(manifest.configTemplate,expected);
assert.equal(readFileSync(path.join(root,'private/config.local.php'),'utf8'),readFileSync(expected,'utf8'));
assert.equal(manifest.target,manifest.environment==='staging'?'https://staging-fila.dlts.in':'https://fila.dlts.in');
console.log(`PASS: ${count} artifact checksums; allowlisted public/private layout; authenticated environment template; no private headers/binaries/local secret values. No deployment performed.`);
