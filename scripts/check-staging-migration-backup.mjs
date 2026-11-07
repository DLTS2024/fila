import {cpSync,mkdirSync,mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=mkdtempSync(path.resolve('work/backup-diagnostic-'));for(const dir of ['src','bin','var/backups','var/sessions'])mkdirSync(path.join(root,dir),{recursive:true});
for(const name of ['Config.php','Http.php','LocalAccess.php'])cpSync('backend/src/'+name,path.join(root,'src',name));
const script=path.join(root,'bin/diagnose-staging-migration-backup.php');cpSync('backend/bin/diagnose-staging-migration-backup.php',script);
const config=path.join(root,'config.local.php');const goodConfig=`<?php return ['environment'=>'production','access_mode'=>'AUTHENTICATED','app_key'=>'synthetic-private-marker-synthetic-private-marker','allowed_origins'=>['https://staging-fila.dlts.in'],'phone_nfc_origin'=>'https://staging-fila.dlts.in','session_dir'=>__DIR__.'/var/sessions','session_idle_seconds'=>1800,'session_absolute_seconds'=>28800,'wifi_scale_enabled'=>true,'database'=>['host'=>'localhost','port'=>3306,'name'=>'dltsin_fila_stage','user'=>'dltsin_fila_stage','password'=>'synthetic-secret']];`;
writeFileSync(config,goodConfig);const file=path.join(root,'var/backups/test.sql');writeFileSync(file,'-- synthetic backup fixture only\n'.repeat(10));
const manifest=path.join(root,'var/backups/verified-v21.json'),sha256=createHash('sha256').update(readFileSync(file)).digest('hex');
const good={database:'dltsin_fila_stage',backupFile:file,sha256,restoreVerified:true};let checks=0;
function run(expected,envPath=manifest){const before=readFileSync(file);const r=spawnSync(path.resolve('.tools/php/php.exe'),['-n',script],{encoding:'utf8',env:{...process.env,DLOOP_BACKUP_MANIFEST:envPath}});assert.equal(r.stdout.replaceAll('\r\n','\n'),expected+'\n',r.stderr);assert.equal(r.stderr,'');assert.equal(r.status,expected.startsWith('PASS')?0:1);assert(readFileSync(file).equals(before));for(const v of ['synthetic-private-marker','synthetic-secret',sha256])assert(!r.stdout.includes(v));checks++;}
writeFileSync(manifest,JSON.stringify(good));run('PASS: STAGING_BACKUP_GATE');run('FAIL: MANIFEST_ENV','');run('FAIL: MANIFEST_PATH',path.join(root,'missing'));
for(const [patch,category] of [[{database:'dltsin_fila'},'BACKUP_DATABASE'],[{restoreVerified:'true'},'RESTORE_ATTESTATION'],[{restoreVerified:false},'RESTORE_ATTESTATION'],[{backupFile:path.join(root,'missing.sql')},'BACKUP_PATH'],[{sha256:null},'BACKUP_HASH_TYPE'],[{sha256:'0'.repeat(64)},'BACKUP_HASH_MISMATCH']]){writeFileSync(manifest,JSON.stringify({...good,...patch}));run('FAIL: '+category);}
writeFileSync(manifest,'{bad');run('FAIL: MANIFEST_JSON');writeFileSync(manifest,JSON.stringify(good));writeFileSync(file,'short');run('FAIL: BACKUP_SIZE');
writeFileSync(config,goodConfig.replace("'name'=>'dltsin_fila_stage'","'name'=>'dltsin_fila'"));run('FAIL: STAGING_IDENTITY');
const source=readFileSync(script,'utf8');for(const text of ['Database::','new PDO','bootstrap.php','common.php','--apply','file_put_contents(','session_start(','exec('])assert(!source.includes(text));
console.log('PASS: '+checks+' offline backup diagnostic cases, output redaction, no database/migration imports and unchanged backup files.');
