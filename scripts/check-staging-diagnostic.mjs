import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,cpSync,readdirSync,statSync,existsSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const php=path.resolve('.tools/php/php.exe');
const root=mkdtempSync(path.resolve('work/staging-diagnostic-test-'));
mkdirSync(path.join(root,'bin'));mkdirSync(path.join(root,'src'));mkdirSync(path.join(root,'secrets'));mkdirSync(path.join(root,'var/sessions'),{recursive:true});
const diagnostic=path.join(root,'bin/diagnose-staging-config.php');
cpSync('backend/bin/diagnose-staging-config.php',diagnostic);
for(const f of ['Config.php','LocalAccess.php'])cpSync('backend/src/'+f,path.join(root,'src',f));
const config=readFileSync('backend/config.staging-file.example.php','utf8');
const good=JSON.stringify({databasePassword:'synthetic-private-marker',appKey:'synthetic-key-marker-'.repeat(3)});
const configFile=path.join(root,'config.local.php'),secretFile=path.join(root,'secrets/staging-secrets.json');
function reset(){writeFileSync(configFile,config);writeFileSync(secretFile,good);}
reset();
// These shims exist ONLY in this local test harness. The shipped diagnostic has no test switches.
const harness=path.join(root,'harness.php');
writeFileSync(harness,`<?php
namespace DLoop\\StagingDiagnostic {
 function function_exists($name){return $GLOBALS['scenario']==='RUNTIME'&&$name==='json_decode'?false:\\function_exists($name);}
 function fileowner($file){if($GLOBALS['scenario']==='PRIVATE_OWNERSHIP'&&str_ends_with($file,'staging-secrets.json'))return 1002;return 1001;}
 function fileperms($file){return $GLOBALS['scenario']==='PRIVATE_PERMISSIONS'?0777:0700;}
 function file_get_contents($file,...$args){if($GLOBALS['scenario']==='JSON_READ'&&str_ends_with($file,'staging-secrets.json'))throw new \\RuntimeException('synthetic-private-marker');return \\file_get_contents($file,...$args);}
 function is_writable($file){return $GLOBALS['scenario']==='SESSION_DIRECTORY'?false:\\is_writable($file);}
 function putenv($value){return $GLOBALS['scenario']==='CONFIGURATION_LOAD'?false:\\putenv($value);}
}
namespace DLoop {
 function getenv($name){
  if($GLOBALS['scenario']==='UNEXPECTED_OUTPUT')echo 'synthetic-private-marker';
  if($GLOBALS['scenario']==='STAGING_IDENTITY')return __DIR__.'/alternate.php';
  return \\getenv($name);
 }
}
namespace {
 $GLOBALS['scenario']=$argv[1];$target=__DIR__.'/bin/diagnose-staging-config.php';
 $argv=$GLOBALS['scenario']==='INVOCATION'?[$target,'extra']:[$target];
 require $target;
}
`);
writeFileSync(path.join(root,'alternate.php'),`<?php $c=require __DIR__.'/config.local.php'; $c['database']['name']='other_staging'; return $c;`);
function snapshot(){const items=new Map();function walk(dir){for(const name of readdirSync(dir)){const file=path.join(dir,name);if(statSync(file).isDirectory()){items.set(file,null);walk(file);}else items.set(file,readFileSync(file));}}walk(root);return items;}
let checks=0;
function run(scenario,expected=scenario){const before=snapshot();const r=spawnSync(php,['-n',harness,scenario],{encoding:'utf8',timeout:15000});assert.equal(r.error,undefined);assert.equal(r.stdout,expected==='PASS'?'PASS: STAGING_CONFIGURATION\n':'FAIL: '+expected+'\n',r.stderr);assert.equal(r.status,expected==='PASS'?0:1);assert.equal(r.stderr,'');const after=snapshot();assert.deepEqual([...after.keys()],[...before.keys()]);for(const [file,bytes] of before)assert.deepEqual(after.get(file),bytes,'Diagnostic changed a fixture');for(const value of ['synthetic-private-marker','synthetic-key-marker',root])assert(!r.stdout.includes(value));checks++;}
run('PASS');
writeFileSync(configFile,config.replace("$profile = 'disabled';", "$profile = 'wifi-enabled';"));run('PASS');reset();
const legacy=readFileSync('outputs/staging-config-overlay-2026-11-06T03-24-48-958Z/private/config.local.php','utf8');
for(const enabled of [false,true]){writeFileSync(configFile,legacy.replace("'wifi_scale_enabled'=>false,",`'wifi_scale_enabled'=>${enabled},`));run('PASS');}reset();
writeFileSync(configFile,legacy.replace("'wifi_scale_enabled'=>false,","'wifi_scale_enabled'=>true,").replace("'name'=>'dltsin_fila_stage'","'name'=>'dltsin_fila'"));run('CONFIGURATION_VERSION');reset();
writeFileSync(configFile,config.replace("'staging_wifi_profile'=>$profile","'staging_wifi_profile'=>'disabled'").replace("'wifi_scale_enabled'=>$profile === 'wifi-enabled'","'wifi_scale_enabled'=>true"));run('CONFIGURATION_VERSION');reset();
for(const code of ['RUNTIME','INVOCATION','PRIVATE_OWNERSHIP','PRIVATE_PERMISSIONS','JSON_READ','SESSION_DIRECTORY','CONFIGURATION_LOAD','STAGING_IDENTITY','UNEXPECTED_OUTPUT'])run(code,code==='STAGING_IDENTITY'?'CONFIGURATION_LOAD':code);
unlinkSync(secretFile);run('CONFIGURATION_PATH');reset();
for(const bytes of ['{invalid','\ufeff'+good,'{"appKey":"bad\u0000text"}']){writeFileSync(secretFile,bytes);run('JSON_SYNTAX');}reset();
for(const value of [{},[],{databasePassword:'',appKey:'a'.repeat(64)},{databasePassword:'synthetic',appKey:'short'},{databasePassword:'synthetic',appKey:123},{databasePassword:'synthetic',appKey:'a'.repeat(64),extra:1},{databasePassword:'synthetic',appKey:'a'.repeat(40)+'\0'}]){writeFileSync(secretFile,JSON.stringify(value));run('JSON_SCHEMA');}reset();
writeFileSync(secretFile,' '.repeat(8193));run('JSON_READ');reset();
writeFileSync(configFile,config+'\n// changed source\n');run('CONFIGURATION_VERSION');reset();
const cgi=path.resolve('.tools/php/php-cgi.exe');assert(existsSync(cgi));
const web=spawnSync(cgi,['-n'],{env:{...process.env,REDIRECT_STATUS:'200',REQUEST_METHOD:'GET',SCRIPT_FILENAME:diagnostic,SCRIPT_NAME:'/diagnostic.php',GATEWAY_INTERFACE:'CGI/1.1',SERVER_PROTOCOL:'HTTP/1.1'},encoding:'utf8',timeout:15000});
assert.equal(web.error,undefined);assert(web.stdout.includes('Status: 404'));assert.equal(web.stdout.split(/\r?\n\r?\n/).slice(1).join(''),'');assert.equal(web.stderr,'');checks++;
// Enforce absence of mutation/network/dynamic-execution constructs in shipped source.
const source=readFileSync(diagnostic,'utf8');
for(const forbidden of ['file_put_contents(', 'fopen(', 'fwrite(', 'unlink(', 'rename(', 'chmod(', 'chown(', 'mkdir(', 'curl_', 'fsockopen(', 'stream_socket_', 'exec(', 'shell_exec(', 'system(', 'eval(', 'Database::', 'new PDO', 'session_start(', 'bootstrap.php', 'common.php'])assert(!source.includes(forbidden),forbidden);
assert(source.includes("PHP_SAPI !== 'cli'"));
const nativePreflight=readFileSync('backend/bin/production-preflight.php','utf8');assert(!source.includes(nativePreflight));
console.log('PASS: '+checks+' diagnostic cases; every output category, CGI denial, secret/error redaction and unchanged fixture contents. POSIX metadata modeled on Windows; no databases, network, chmod or credential operations.');
