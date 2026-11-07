import {mkdirSync,cpSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--private-only'))throw Error('Unknown overlay option.');
const privateOnly=args.includes('--private-only');
const base=path.resolve('outputs/staging-fila-2026-11-06T01-55-50-807Z');
const root=path.resolve('outputs/staging-config-overlay-'+new Date().toISOString().replace(/[:.]/g,'-'));
const files=[];
function copy(source,target){const dest=path.join(root,target);mkdirSync(path.dirname(dest),{recursive:true});cpSync(source,dest);files.push(target);}
copy('backend/config.staging-file.example.php','private/config.local.php');
copy('backend/bin/validate-staging-config.php','private/bin/validate-staging-config.php');
// The secrets example is deliberately NOT uploaded to the live secrets filename.
if(!privateOnly)copy('backend/staging-secrets.example.json','review-only/staging-secrets.example.json');
if(!privateOnly){
const originalEntry=path.join(base,'public/api/v1/index.php');
const baseManifest=JSON.parse(readFileSync(path.join(base,'manifest.json'),'utf8'));
const recorded=baseManifest.files.find(f=>f.path==='public/api/v1/index.php');
if(!recorded||createHash('sha256').update(readFileSync(originalEntry)).digest('hex')!==recorded.sha256)throw Error('Base API checksum mismatch.');
let entry=readFileSync(originalEntry,'utf8');
const before="$appRoot = getenv('DLOOP_APP_DIR'); if (!$appRoot) { throw new RuntimeException('Private application path required.'); }";
if(!entry.includes(before))throw Error('Unexpected staged API entry; stop for review.');
entry=entry.replace(before,`if (strtolower($_SERVER['HTTP_HOST'] ?? '') !== 'staging-fila.dlts.in') { http_response_code(404); exit; }
    $appRoot = '/home4/dltsin/fila-staging-private';
    putenv('DLOOP_CONFIG_FILE='.$appRoot.'/config.local.php');`);
const publicEntry='future-public-only/api/v1/index.php';mkdirSync(path.dirname(path.join(root,publicEntry)),{recursive:true});writeFileSync(path.join(root,publicEntry),entry);files.push(publicEntry);
}
writeFileSync(path.join(root,'manifest.json'),JSON.stringify({target:'https://staging-fila.dlts.in',deployed:false,credentialsIncluded:false,baseArtifact:path.basename(base),purpose:privateOnly?'Private configuration and validator only; no public deployment':'Review-only file-backed staging configuration overlay; public entry requires separate approval',files:files.map(file=>({path:file,sha256:createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex')}))},null,2));
console.log(root);
