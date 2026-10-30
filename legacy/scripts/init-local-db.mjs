import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {configureToolEnvironment} from './tool-environment.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
configureToolEnvironment(root);
const cli=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
// Bootstrap exported projects, including databases initialized before Wi-Fi support.
// Only additive, idempotent migrations are accepted here; never reset existing stock.
const sql=['0000_nosy_thunderbolts.sql','0001_scale_readings.sql'].map(name=>
 readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8').replace(/CREATE TABLE (?!IF NOT EXISTS)/g,'CREATE TABLE IF NOT EXISTS ')
).join('\n');
const result=spawnSync(process.execPath,[cli,'d1','execute','site-creator-d1','--local','--config','wrangler.local.json','--persist-to','.wrangler/state','--command',sql],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
