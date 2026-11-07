import assert from 'node:assert/strict';
import {cpSync,mkdirSync,writeFileSync,readFileSync,mkdtempSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const php=path.resolve('.tools/php/php.exe');
const root=mkdtempSync(path.resolve('work/staging-config-test-'));
cpSync('backend/src',path.join(root,'src'),{recursive:true});
mkdirSync(path.join(root,'bin'));mkdirSync(path.join(root,'secrets'));mkdirSync(path.join(root,'var/sessions'),{recursive:true});
cpSync('backend/config.staging-file.example.php',path.join(root,'config.local.php'));
cpSync('backend/bin/validate-staging-config.php',path.join(root,'bin/validate-staging-config.php'));
const secret=path.join(root,'secrets/staging-secrets.json');
const good={databasePassword:'synthetic-test-password-only',appKey:'synthetic-test-key-'.repeat(3)};
const prelude=`if (class_exists('PDO') && PDO::getAvailableDrivers() !== []) throw new RuntimeException('Test requires no PDO drivers'); $target=$argv[1]; $argv=[$target]; require $target;`;
function run(ok){const r=spawnSync(php,['-n','-r',prelude,path.join(root,'bin/validate-staging-config.php')],{encoding:'utf8',env:{...process.env,DLOOP_CONFIG_FILE:'must-not-be-used',DLOOP_STAGING_DB_NAME:'dltsin_fila',DLOOP_STAGING_WIFI_SCALE_ENABLED:'1'}});assert.equal(r.status,ok?0:1,r.stderr+r.stdout);assert.equal(r.stdout,ok?'PASS: staging configuration valid; no database connection attempted.\n':'FAIL: staging configuration validation failed.\n');assert.equal(r.stderr,'');for(const value of Object.values(good))assert(!r.stdout.includes(value));}
run(false); // Missing file.
for(const value of ['{bad json',JSON.stringify({}),JSON.stringify({...good,appKey:'short'}),JSON.stringify({...good,databasePassword:''}),JSON.stringify({...good,extra:'unexpected'}),JSON.stringify({...good,appKey:123})]){writeFileSync(secret,value);run(false);}
writeFileSync(secret,JSON.stringify(good));run(true);
// Config validation must fail closed if the private session path is wrong.
let config=readFileSync(path.join(root,'config.local.php'),'utf8');
writeFileSync(path.join(root,'config.local.php'),config.replace("$root.'/var/sessions'","$root.'/missing-sessions'"));run(false);
writeFileSync(path.join(root,'config.local.php'),config);
// Both explicit profiles pass; identity and feature mismatches fail closed.
const configPath=path.join(root,'config.local.php');
const enabled=config.replace("$profile = 'disabled';", "$profile = 'wifi-enabled';");
writeFileSync(configPath,enabled);run(true);
for(const [from,to] of [
 ["'name'=>'dltsin_fila_stage'","'name'=>'dltsin_fila'"],
 ["'user'=>'dltsin_fila_stage'","'user'=>'dltsin_fila'"],
 ["https://staging-fila.dlts.in","https://fila.dlts.in"],
 ["'host'=>'localhost'","'host'=>'127.0.0.1'"],
 ["'access_mode'=>'AUTHENTICATED'","'access_mode'=>'LOCAL_SINGLE_USER'"],
 ["$profile = 'wifi-enabled';","$profile = 'unknown';"],
 ["'wifi_scale_enabled'=>$profile === 'wifi-enabled'","'wifi_scale_enabled'=>false"],
]){writeFileSync(configPath,enabled.replaceAll(from,to));run(false);}
writeFileSync(configPath,config.replace("'wifi_scale_enabled'=>$profile === 'wifi-enabled'","'wifi_scale_enabled'=>true"));run(false);
// Production template retains its separate opt-in and ignores staging switches.
const production=spawnSync(php,['-n','-r',`$c=require $argv[1]; if($c['wifi_scale_enabled']!==false || $c['database']['name']!=='dltsin_fila')exit(1);`,path.resolve('backend/config.production.example.php')],{encoding:'utf8',env:{...process.env,DLOOP_DB_NAME:'dltsin_fila',DLOOP_DB_PASSWORD:good.databasePassword,DLOOP_APP_KEY:good.appKey,DLOOP_WIFI_SCALE_ENABLED:'0',DLOOP_STAGING_WIFI_PROFILE:'wifi-enabled',DLOOP_STAGING_WIFI_SCALE_ENABLED:'1'}});
assert.equal(production.status,0,production.stderr);
// Environment-backed template also requires explicit staging identity and profile.
const envTemplate=path.resolve('backend/config.staging.example.php');
const envPrelude=`require $argv[1].'/src/bootstrap.php'; $c=require $argv[2]; $c['session_dir']=$argv[1].'/var/sessions'; file_put_contents($argv[1].'/env-fixture.php','<?php return '.var_export($c,true).';'); putenv('DLOOP_CONFIG_FILE='.$argv[1].'/env-fixture.php'); try {\\DLoop\\Config::load($argv[1]);} catch (Throwable $e) {exit(1);}`;
const stagingEnv={...process.env,DLOOP_STAGING_ORIGIN:'https://staging-fila.dlts.in',DLOOP_STAGING_DB_NAME:'dltsin_fila_stage',DLOOP_STAGING_DB_USER:'dltsin_fila_stage',DLOOP_STAGING_DB_PASSWORD:good.databasePassword,DLOOP_STAGING_APP_KEY:good.appKey,DLOOP_STAGING_WIFI_PROFILE:'wifi-enabled',DLOOP_STAGING_WIFI_SCALE_ENABLED:'1'};
for(const [override,ok] of [[{},true],[{DLOOP_STAGING_DB_NAME:'wrong_stage'},false],[{DLOOP_STAGING_DB_NAME:'dltsin_fila'},false],[{DLOOP_STAGING_ORIGIN:'https://fila.dlts.in'},false],[{DLOOP_STAGING_ORIGIN:'https://other.example'},false],[{DLOOP_STAGING_WIFI_PROFILE:'disabled'},false]]){
 const r=spawnSync(php,['-n','-d','display_errors=0','-r',envPrelude,root,envTemplate],{encoding:'utf8',env:{...stagingEnv,...override}});assert.equal(r.status===0,ok,r.stderr);
}
writeFileSync(configPath,config);
const legacy=readFileSync('outputs/staging-config-overlay-2026-11-06T03-24-48-958Z/private/config.local.php','utf8');
writeFileSync(configPath,legacy);run(true);
const legacyEnabled=legacy.replace("'wifi_scale_enabled'=>false,","'wifi_scale_enabled'=>true,");
writeFileSync(configPath,legacyEnabled);run(true);
for(const [from,to] of [["'name'=>'dltsin_fila_stage'","'name'=>'dltsin_fila'"],["'user'=>'dltsin_fila_stage'","'user'=>'dltsin_fila'"],["https://staging-fila.dlts.in","https://fila.dlts.in"],["'wifi_scale_enabled'=>true","'wifi_scale_enabled'=>'true'"]]){writeFileSync(configPath,legacyEnabled.replaceAll(from,to));run(false);}
writeFileSync(configPath,config);
// A web-context public root containing the config/secrets must be rejected.
const webPrelude=`$_SERVER['DOCUMENT_ROOT']=$argv[1]; require $argv[2];`;
const publicTest=spawnSync(php,['-n','-r',webPrelude,root,path.join(root,'bin/validate-staging-config.php')],{encoding:'utf8'});
assert.equal(publicTest.status,1);assert.equal(publicTest.stdout,'FAIL: staging configuration validation failed.\n');
const audit=spawnSync(php,['-n','backend/tests/bootstrap-declarations.php'],{encoding:'utf8'});assert.equal(audit.status,0,audit.stderr);process.stdout.write(audit.stdout);
console.log('PASS: file-backed staging identity; inherited overrides ignored; missing/malformed/invalid secrets and public/session paths fail closed; output contains only PASS/FAIL; run with no PDO drivers. Synthetic fixtures only.');
