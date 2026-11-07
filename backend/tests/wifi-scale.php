<?php
declare(strict_types=1);
require dirname(__DIR__).'/bin/common.php';
$c=cliConfig();if(!str_starts_with($c['database']['name'],'dloop_test_local_mode_'))throw new RuntimeException('Disposable fixture required.');
$db=\DLoop\Database::connect($c);$before=(new \DLoop\Inventory($db))->snapshot();$c['wifi_scale_enabled']=true;$service=new \DLoop\WifiScale($c,$db);$checks=0;
$check=static function($ok)use(&$checks){if(!$ok)throw new RuntimeException('Wi-Fi regression');$checks++;};
$reject=static function($run,$code)use($check){try{$run();throw new RuntimeException('Expected rejection');}catch(\DLoop\HttpError $e){$check($e->errorCode===$code);}};
$token=bin2hex(random_bytes(32));$db->prepare('INSERT INTO scale_devices(device_id,token_hash) VALUES(?,?)')->execute(['DLOOP-SCALE-01',hash('sha256',$token)]);
$f=json_decode(file_get_contents(dirname(__DIR__,2).'/scripts/fixtures/usb-preview-upload-evidence.json'),true)['frames'][0];
$now=(int)floor(microtime(true)*1000);$body=['bootId'=>bin2hex(random_bytes(16)),'sentAtMs'=>$now,'frame'=>$f];$https=['HTTPS'=>'on'];$auth='Bearer '.$token;
$reject(fn()=>$service->ingest($body,'',$https,$now),'device_unauthorized');
$reject(fn()=>$service->ingest($body,'Bearer '.str_repeat('a',64),$https,$now),'device_unauthorized');
$reject(fn()=>$service->ingest($body,$auth,[],$now),'https_required');
$reject(fn()=>(new \DLoop\WifiScale(array_replace($c,['access_mode'=>'LOCAL_SINGLE_USER']),$db))->ingest($body,$auth,$https,$now),'wifi_disabled');
$reject(fn()=>$service->ingest(array_replace($body,['sentAtMs'=>$now-5001]),$auth,$https,$now),'stale_upload');
$bad=$body;$bad['frame']['live']['calibrated']=true;$reject(fn()=>$service->ingest($bad,$auth,$https,$now),'invalid_preview');
$check($service->ingest($body,$auth,$https,$now)['accepted']);
$check($service->latest($now)['reading']['frame']['live']['raw']===$f['live']['raw']);
$check($service->latest($now+501)['reading']['frame']['live']['raw']===null);
$check(!$service->latest($now+10001)['online']);
$reject(fn()=>$service->ingest($body,$auth,$https,$now),'duplicate_or_retired');
$older=$body;$older['frame']['seq']--;$reject(fn()=>$service->ingest($older,$auth,$https,$now),'duplicate_or_retired');
$new=$body;$new['bootId']=bin2hex(random_bytes(16));$new['frame']['seq']=0;$check($service->ingest($new,$auth,$https,$now)['accepted']);
$old=$body;$old['frame']['seq']++;$reject(fn()=>$service->ingest($old,$auth,$https,$now),'duplicate_or_retired');
$future=$new;$future['bootId']=bin2hex(random_bytes(16));$future['sentAtMs']=$now+300;$service->ingest($future,$auth,$https,$now);
$check($service->latest($now+300)['reading']['frame']['live']['raw']===null); // Future clock cannot freeze/rejuvenate freshness.
$out=$c['session_dir'].'/wifi-credential-test-'.bin2hex(random_bytes(4));
$cli=static function($mode,$file=null){$cmd=[PHP_BINARY,dirname(__DIR__).'/bin/device-credential.php',$mode,'DLOOP-SCALE-01'];if($file)$cmd[]=$file;$p=proc_open($cmd,[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);fclose($pipes[0]);stream_get_contents($pipes[1]);stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);if(proc_close($p)!==0)throw new RuntimeException('Credential CLI failed.');};
try{
 $cli('--rotate',$out);$reject(fn()=>$service->ingest($new,$auth,$https,$now),'device_unauthorized');
 $check(!$service->latest($now)['online']);preg_match('/DLOOP_DEVICE_TOKEN=([a-f0-9]{64})/',file_get_contents($out),$m);$newAuth='Bearer '.$m[1];unset($m);
 $new['bootId']=bin2hex(random_bytes(16));$check($service->ingest($new,$newAuth,$https,$now)['accepted']);
 $cli('--revoke');$reject(fn()=>$service->ingest($new,$newAuth,$https,$now),'device_unauthorized');$check(!$service->latest($now)['online']);
 $check((new \DLoop\Inventory($db))->snapshot()==$before);
 echo "PASS: $checks device auth/HTTPS/replay/retired-boot/staleness/power-cycle/rotation/revocation and inventory-isolation checks. HTTPS metadata and power cycle simulated; no production or radio test.\n";
}finally{if(is_file($out))unlink($out);}
