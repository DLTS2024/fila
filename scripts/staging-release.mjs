import {mkdirSync,readFileSync,writeFileSync,readdirSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const identity={environment:'staging',release:'2.1-mobile-management',target:'https://staging-fila.dlts.in',publicDestination:'/home4/dltsin/public_html/staging-fila',privateDestination:'/home4/dltsin/fila-staging-private',deployed:false,credentialsIncluded:false,configurationIncluded:false,migrationsExecuted:false};
const migrations=['0000_schema_migrations.sql','0001_inventory_foundation.sql','0002_auth_and_installation.sql','0003_inventory_management.sql','0004_brand_tare_defaults.sql','0005_spool_tag_identity.sql','0006_wifi_scale.sql','0007_preprinted_qr.sql','0008_mobile_management.sql'];
const runtime=['Api.php','Auth.php','bootstrap.php','Config.php','Database.php','Http.php','Inventory.php','LocalAccess.php','QrLabels.php','SpoolSelection.php','Validation.php','WifiScale.php'];
const tools=['common.php','migrate.php','production-preflight.php','staging-readonly-preflight.php','validate-staging-config.php','diagnose-staging-config.php'];
export function walk(root){assert(!lstatSync(root).isSymbolicLink(),'Symlink root rejected');return readdirSync(root).sort().flatMap(name=>{const full=path.join(root,name),stat=lstatSync(full);assert(!stat.isSymbolicLink(),'Symlinks rejected');return stat.isDirectory()?walk(full).map(f=>name+'/'+f):[name]});}
function read(workspace,name){const full=path.join(workspace,name); // Verify every path component, not just the leaf.
 let cursor=path.resolve(workspace);assert(!lstatSync(cursor).isSymbolicLink());for(const part of name.split('/')){cursor=path.join(cursor,part);assert(!lstatSync(cursor).isSymbolicLink(),'Source symlink rejected');}return readFileSync(full);}
export function releaseInputs(workspace){
 const lock=JSON.parse(readFileSync(new URL('./staging-migrations.reviewed.json',import.meta.url),'utf8'));
 assert.deepEqual(Object.keys(lock),migrations,'Reviewed migration set must be exactly 0000-0008');
 assert.deepEqual(walk(path.join(workspace,'backend/migrations')),migrations,'Unexpected migration set');
 assert.deepEqual(walk(path.join(workspace,'backend/src')),runtime.slice().sort(),'Runtime dependency inventory changed; review allowlist');
 assert.deepEqual(walk(path.join(workspace,'backend/public')),['.htaccess','api/v1/index.php']);
 const result=new Map();
 for(const name of migrations){const bytes=read(workspace,'backend/migrations/'+name);assert.equal(hash(bytes),lock[name],'Reviewed migration checksum mismatch: '+name);result.set('private/migrations/'+name,bytes);}
 for(const name of runtime)result.set('private/src/'+name,read(workspace,'backend/src/'+name));
 for(const name of tools)result.set('private/bin/'+name,read(workspace,'backend/bin/'+name));
 for(const name of walk(path.join(workspace,'dist'))){if(name.startsWith('scale/'))continue;
  assert(name==='index.html'||name==='favicon.svg'||/^assets\/[A-Za-z0-9_.-]+\.(js|css|svg)$/.test(name),'Unexpected frontend path');
  assert(!/secret|fixture|config|\.map$|test[.-]/i.test(name),'Unsafe frontend path');
  const bytes=read(workspace,'dist/'+name);
  assert(!/cloudflare:workers|vinext\/|drizzle-orm|SCALE_DEVICE_TOKEN|DLOOP_DB_PASSWORD|node:async_hooks|-----BEGIN .*PRIVATE KEY-----/.test(bytes.toString()),'Unsafe public content');
  result.set('public/'+name,bytes);
 }
 assert(result.has('public/index.html')&&result.has('public/favicon.svg'));
 const html=result.get('public/index.html').toString();
 assert(/<script[^>]+src="\/assets\//.test(html)&&/href="\/assets\/[^\"]+\.css"/.test(html),'Built entry/assets required');
 for(const match of html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g))assert(result.has('public'+match[1]),'Missing referenced frontend asset');
 // Vite lazy imports and preload maps must resolve, not just index.html entry points.
 for(const [name,bytes] of result){if(!name.endsWith('.js')||!name.startsWith('public/assets/'))continue;
  for(const match of bytes.toString().matchAll(/["']((?:\.{1,2}\/|\/?assets\/)[^"'?#\s]+\.(?:js|css|svg))["']/g)){
   const ref=match[1];const target=ref.startsWith('assets/')?'public/'+ref:ref.startsWith('/')?'public'+ref:path.posix.normalize(path.posix.join(path.posix.dirname(name),ref));
   assert(result.has(target),'Missing referenced frontend chunk');
  }
 }
 let entry=read(workspace,'backend/public/api/v1/index.php').toString();
 const selector="$appRoot = getenv('DLOOP_APP_DIR') ?: dirname(__DIR__, 3);";
 assert.equal(entry.split(selector).length,2,'Unexpected API selector; review required');
 entry=entry.replace(selector,`if (strtolower($_SERVER['HTTP_HOST'] ?? '') !== 'staging-fila.dlts.in') { http_response_code(404); exit; }
    $appRoot = '/home4/dltsin/fila-staging-private';
    putenv('DLOOP_CONFIG_FILE='.$appRoot.'/config.local.php');`);
 result.set('public/api/v1/index.php',Buffer.from(entry));
 let access=read(workspace,'backend/public/.htaccess').toString();assert.equal(access.split('RewriteEngine On').length,2);
 access=access.replace('RewriteEngine On',`RewriteEngine On
# Refuse alternate hostnames before files, redirects or SPA fallback.
RewriteCond %{HTTP_HOST} !^staging-fila\\.dlts\\.in$ [NC]
RewriteRule ^ - [F,L]
RewriteCond %{HTTPS} !=on
RewriteRule ^ https://staging-fila.dlts.in%{REQUEST_URI} [R=308,L]
# Preserve device bearer header for the PHP handler; verify on LiteSpeed.
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]`);
 result.set('public/.htaccess',Buffer.from(access));
 return result;
}
export function validateRelease(workspace,root){
 const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8'));
 for(const [key,value] of Object.entries(identity))assert.equal(manifest[key],value,'Staging identity/flags mismatch');
 const inputs=releaseInputs(workspace),names=[...inputs.keys()].sort();
 assert.deepEqual(walk(root),[...names,'manifest.json'].sort(),'Unexpected/missing artifact file');
 assert.deepEqual(manifest.files.map(f=>f.path),names,'Manifest inventory mismatch');
 for(const file of manifest.files){assert(/^[a-f0-9]{64}$/.test(file.sha256));const bytes=read(root,file.path);assert.equal(hash(bytes),file.sha256,'Artifact checksum mismatch');assert(bytes.equals(inputs.get(file.path)),'Artifact differs from reviewed inputs');}
 const expected=migrations.map(name=>({path:'private/migrations/'+name,sha256:hash(inputs.get('private/migrations/'+name))}));
 assert.deepEqual(manifest.migrations,expected,'Migration manifest mismatch');
 return manifest;
}
export function prepareRelease(workspace,root){
 const inputs=releaseInputs(workspace); // All checks occur before creating an output tree.
 mkdirSync(root);for(const [name,bytes] of inputs){mkdirSync(path.dirname(path.join(root,name)),{recursive:true});writeFileSync(path.join(root,name),bytes,{flag:'wx'});}
 const files=[...inputs].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,bytes])=>({path:name,sha256:hash(bytes)}));
 const manifest={...identity,files,migrations:migrations.map(name=>files.find(f=>f.path==='private/migrations/'+name)),note:'Local review artifact only. Preserve deployed private configuration and secrets. Review routing, Config.php/profile compatibility, migration backup gate and staging grants before any separately approved deployment.'};
 writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 return validateRelease(workspace,root);
}
