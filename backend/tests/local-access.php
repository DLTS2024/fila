<?php
declare(strict_types=1);
require dirname(__DIR__) . '/src/bootstrap.php';
$checks=0;
function checkLocal(bool $ok):void{global $checks;if(!$ok)throw new RuntimeException('Local access regression');++$checks;}
$config=['environment'=>'local','access_mode'=>'LOCAL_SINGLE_USER','local_bridge_token'=>str_repeat('a',64),'local_user_id'=>'1','allowed_origins'=>['http://localhost:5173','http://127.0.0.1:5173']];
\DLoop\LocalAccess::validate($config);
$request=['REMOTE_ADDR'=>'127.0.0.1','SERVER_ADDR'=>'127.0.0.1','HTTP_HOST'=>'localhost:5173','HTTP_X_DLOOP_LOCAL_BRIDGE'=>str_repeat('a',64),'HTTP_ORIGIN'=>'http://localhost:5173','HTTP_SEC_FETCH_SITE'=>'same-origin'];
\DLoop\LocalAccess::check($config,$request);checkLocal(true);
foreach([
 ['REMOTE_ADDR'=>'192.168.1.4'],['REMOTE_ADDR'=>'203.0.113.4'],['REMOTE_ADDR'=>'127.0.0.2'],['SERVER_ADDR'=>'0.0.0.0'],['SERVER_ADDR'=>'192.168.1.2'],
 ['HTTP_HOST'=>'attacker.invalid:5173'],['HTTP_HOST'=>'localhost.attacker.invalid'],['HTTP_HOST'=>'127.0.0.1.attacker.invalid'],['HTTP_HOST'=>'localhost:99999'],['HTTP_HOST'=>'localhost:5173@evil'],
 ['HTTP_ORIGIN'=>'null'],['HTTP_ORIGIN'=>'https://attacker.invalid'],['HTTP_ORIGIN'=>'http://localhost:9999'],['HTTP_X_FORWARDED_FOR'=>'127.0.0.1'],['HTTP_FORWARDED'=>'for=127.0.0.1'],
 ['HTTP_X_FORWARDED_HOST'=>'localhost'],['HTTP_X_REAL_IP'=>'127.0.0.1'],['HTTP_X_FORWARDED_PROTO'=>'http'],['HTTP_SEC_FETCH_SITE'=>'cross-site'],['HTTP_SEC_FETCH_SITE'=>'same-site'],
 ['HTTP_X_DLOOP_LOCAL_BRIDGE'=>'wrong'],['HTTP_X_DLOOP_LOCAL_BRIDGE'=>''],['HTTP_REFERER'=>'https://evil.invalid/'],
] as $patch){try{\DLoop\LocalAccess::check($config,array_replace($request,$patch));checkLocal(false);}catch(\DLoop\HttpError $e){checkLocal($e->status===403);}}
foreach([['environment'=>'production'],['local_bridge_token'=>''],['local_user_id'=>'0'],['allowed_origins'=>['http://192.168.1.2:5173']],['access_mode'=>'unknown']] as $patch){
 try{\DLoop\LocalAccess::validate(array_replace($config,$patch));throw new LogicException('Invalid configuration accepted');}catch(RuntimeException $e){checkLocal(true);}
}
\DLoop\LocalAccess::check(['access_mode'=>'AUTHENTICATED'],['REMOTE_ADDR'=>'203.0.113.1']);checkLocal(true);
echo "PASS: $checks local backend policy/configuration checks; no database or active config changes.\n";
