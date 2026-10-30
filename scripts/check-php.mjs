import {existsSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const portable=path.resolve('.tools/php/php.exe');
const php=process.env.DLOOP_PHP || (existsSync(portable)?portable:'php');
function run(args) {
  const r=spawnSync(php,args,{encoding:'utf8'});
  if(r.error){console.error('PHP executable unavailable. Install PHP or set DLOOP_PHP. No PHP checks passed.');process.exit(1);}
  process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
  if(r.status!==0)process.exit(r.status||1);
}
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.name.endsWith('.php')?[path.join(dir,e.name)]:[]);}
for(const file of walk('backend').filter(p=>!p.includes(path.sep+'var'+path.sep)))run(['-l',file]);
run(['backend/tests/unit.php']);
