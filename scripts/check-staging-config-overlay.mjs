import assert from 'node:assert/strict';
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(process.argv[2]??'');
assert(process.argv[2],'Supply private-only overlay directory');
const expected=new Map([
 ['private/config.local.php','backend/config.staging-file.example.php'],
 ['private/bin/validate-staging-config.php','backend/bin/validate-staging-config.php'],
]);
const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.equal(manifest.target,'https://staging-fila.dlts.in');assert.equal(manifest.deployed,false);assert.equal(manifest.credentialsIncluded,false);
assert.equal(manifest.files.length,2);
const found=[];
function walk(dir){for(const name of readdirSync(dir)){const file=path.join(dir,name);const stat=lstatSync(file);assert(!stat.isSymbolicLink());if(stat.isDirectory())walk(file);else found.push(path.relative(root,file).replaceAll('\\','/'));}}
walk(root);assert.deepEqual(found.sort(),[...expected.keys(),'manifest.json'].sort());
assert.deepEqual(manifest.files.map(f=>f.path).sort(),[...expected.keys()].sort());
for(const file of manifest.files){const bytes=readFileSync(path.join(root,file.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);assert(bytes.equals(readFileSync(expected.get(file.path))),'Overlay differs from reviewed template');}
const loader=readFileSync(path.join(root,'private/config.local.php'),'utf8');
assert(loader.includes("$values['databasePassword']"));assert(loader.includes("$values['appKey']"));
console.log('PASS: exact two-file private overlay; complete SHA-256 coverage; byte-identical reviewed code; no secrets JSON, archives, public files or executable binaries packaged.');
