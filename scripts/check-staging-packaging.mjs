import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,renameSync,unlinkSync,symlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {prepareRelease,validateRelease} from './staging-release.mjs';
const root=mkdtempSync(path.resolve('work/staging-release-test-')),workspace=path.join(root,'input');mkdirSync(workspace);
for(const name of ['backend/src','backend/public','backend/migrations','dist']){mkdirSync(path.dirname(path.join(workspace,name)),{recursive:true});cpSync(name,path.join(workspace,name),{recursive:true});}
mkdirSync(path.join(workspace,'backend/bin'));for(const name of ['common.php','migrate.php','production-preflight.php','staging-readonly-preflight.php','validate-staging-config.php','diagnose-staging-config.php'])cpSync('backend/bin/'+name,path.join(workspace,'backend/bin',name));
const output=path.join(root,'release');const m=prepareRelease(workspace,output);let checks=1;
assert(m.files.some(f=>f.path==='private/src/Inventory.php'));assert.equal(m.migrations.length,9);assert(!m.files.some(f=>/config.local|secrets|fixtures|public\/scale\//.test(f.path)));
function rejected(fn){assert.throws(fn);checks++;}
function alter(file,change,fn){const old=readFileSync(file);try{writeFileSync(file,change(old));fn();}finally{writeFileSync(file,old);}}
const manifest=path.join(output,'manifest.json');
for(const patch of [{target:'https://fila.dlts.in'},{privateDestination:'/home4/dltsin/production'},{deployed:true},{configurationIncluded:true}])alter(manifest,bytes=>JSON.stringify({...JSON.parse(bytes),...patch}),()=>rejected(()=>validateRelease(workspace,output)));
alter(manifest,bytes=>{const v=JSON.parse(bytes);v.files[0].path='../escape';return JSON.stringify(v)},()=>rejected(()=>validateRelease(workspace,output)));
alter(path.join(output,'private/src/Inventory.php'),b=>Buffer.concat([b,Buffer.from('tamper')]),()=>rejected(()=>validateRelease(workspace,output)));
writeFileSync(path.join(output,'private/config.local.php'),'synthetic fixture');rejected(()=>validateRelease(workspace,output));unlinkSync(path.join(output,'private/config.local.php'));
for(const file of ['0000_schema_migrations.sql','0008_mobile_management.sql'])alter(path.join(workspace,'backend/migrations',file),b=>Buffer.concat([b,Buffer.from('\n-- changed')]),()=>rejected(()=>prepareRelease(workspace,path.join(root,'must-not-exist-'+checks))));
const extra=path.join(workspace,'backend/migrations/0009_unreviewed.sql');writeFileSync(extra,'SELECT 1;');rejected(()=>prepareRelease(workspace,path.join(root,'extra')));unlinkSync(extra);
const migration=path.join(workspace,'backend/migrations/0008_mobile_management.sql');renameSync(migration,migration+'.missing');rejected(()=>prepareRelease(workspace,path.join(root,'missing')));renameSync(migration+'.missing',migration);
alter(path.join(workspace,'dist/index.html'),b=>b.toString().replace('/assets/index-', '/assets/missing-'),()=>rejected(()=>prepareRelease(workspace,path.join(root,'missing-asset'))));
const lazy=m.files.find(f=>f.path.startsWith('public/assets/browser-')).path.replace('public/','dist/');const lazyPath=path.join(workspace,lazy);renameSync(lazyPath,path.join(root,'lazy-backup'));rejected(()=>prepareRelease(workspace,path.join(root,'missing-lazy')));renameSync(path.join(root,'lazy-backup'),lazyPath);
writeFileSync(path.join(workspace,'dist/secrets.json'),'synthetic fixture');rejected(()=>prepareRelease(workspace,path.join(root,'public-secret')));unlinkSync(path.join(workspace,'dist/secrets.json'));
const asset=m.files.find(f=>f.path.startsWith('public/assets/')&&f.path.endsWith('.js')).path.replace('public/','dist/');alter(path.join(workspace,asset),b=>Buffer.concat([b,Buffer.from('SCALE_DEVICE_TOKEN')]),()=>rejected(()=>prepareRelease(workspace,path.join(root,'token'))));
const linked=path.join(output,'unexpected-link');symlinkSync(path.join(root,'input'),linked,process.platform==='win32'?'junction':'dir');rejected(()=>validateRelease(workspace,output));unlinkSync(linked);
const cli=spawnSync(process.execPath,['scripts/prepare-staging-public.mjs','--production'],{encoding:'utf8'});assert.notEqual(cli.status,0);checks++;
validateRelease(workspace,output);checks++;
console.log('PASS: '+checks+' staging packaging cases: reviewed nine migrations, exact runtime/frontend, tamper/missing/extra files, secrets/config exclusion, missing assets, symlink and production override rejection. Local fixtures only.');
