<?php
declare(strict_types=1);
require dirname(__DIR__).'/bin/common.php';
$c=cliConfig();if(!str_starts_with($c['database']['name'],'dloop_test_local_mode_'))throw new RuntimeException('Isolated fixture required.');
$db=\DLoop\Database::connect($c);$id=$db->query("SELECT id FROM spools WHERE status='active' LIMIT 1")->fetchColumn();if(!$id)throw new RuntimeException();
$before=(new \DLoop\Inventory($db))->snapshot();$checks=0;
$check=static function($ok)use(&$checks){if(!$ok)throw new RuntimeException('Sync regression');$checks++;};
$deny=static function($config,$server)use($db,$id,$check){try{(new \DLoop\SpoolSelection($config,$db))->exchange('1',$server,$id);throw new RuntimeException('Expected refusal');}catch(\DLoop\HttpError $e){$check($e->status===403);}};
$https=['HTTPS'=>'on'];
$deny(array_replace($c,['access_mode'=>'LOCAL_SINGLE_USER','phone_nfc_origin'=>'https://studio.example.invalid']),$https);
$deny($c,$https);
$secure=array_replace($c,['access_mode'=>'AUTHENTICATED','phone_nfc_origin'=>'https://studio.example.invalid','app_key'=>bin2hex(random_bytes(32))]);
$deny($secure,[]);
$service=new \DLoop\SpoolSelection($secure,$db);$paths=[];
foreach(['1','2'] as $actor)$paths[]=$secure['session_dir'].'/spool-selection-'.hash_hmac('sha256',$actor,$secure['app_key']).'.json';
try{
 $check($service->exchange('1',$https)['selection']===null);
 $sent=$service->exchange('1',$https,$id)['selection'];$check($sent['spoolId']===$id&&$sent['expiresAt']<=time()+120);
 $check($service->exchange('1',$https)['selection']===$sent);
 $check($service->exchange('2',$https)['selection']===null);
 $expired=$sent;$expired['expiresAt']=time()-1;file_put_contents($paths[0],json_encode($expired));$check($service->exchange('1',$https)['selection']===null);
 try{$service->exchange('1',$https,'unknown');throw new RuntimeException();}catch(\DLoop\HttpError $e){$check($e->errorCode==='unknown_spool');}
 $check((new \DLoop\Inventory($db))->snapshot()==$before);
 echo "PASS: $checks sync checks: local/HTTP/unconfigured refusal, same-account exchange, account isolation, expiry, invalid spool and unchanged inventory. HTTPS request state simulated; no phone or TLS deployment claimed.\n";
}finally{foreach($paths as $path)if(is_file($path))unlink($path);}
