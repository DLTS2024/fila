<?php
declare(strict_types=1);
require __DIR__.'/common.php';
try{
 $c=cliConfig();if(\DLoop\LocalAccess::enabled($c))throw new RuntimeException();
 $mode=$argv[1]??'';$id=$argv[2]??'';
 if(!in_array($mode,['--register','--rotate','--revoke'],true)||$id!=='DLOOP-SCALE-01')throw new RuntimeException('Invalid arguments.');
 $db=\DLoop\Database::connect($c);
 if($mode==='--revoke'){
  $q=$db->prepare('UPDATE scale_devices SET enabled=0,active_boot=NULL,updated_at=CURRENT_TIMESTAMP(6) WHERE device_id=?');$q->execute([$id]);
  if($q->rowCount()!==1)throw new RuntimeException();echo "Device revoked; inventory untouched.\n";exit;
 }
 // Token is never printed: exclusive private output file, never command args.
 $out=$argv[3]??'';$parent=realpath(dirname($out));$sessions=realpath($c['session_dir']);
 if(!$parent||!$sessions||$parent!==$sessions||file_exists($out))throw new RuntimeException('Use a new private file in the configured session directory.');
 $token=bin2hex(random_bytes(32));$file=fopen($out,'x');if(!$file)throw new RuntimeException();chmod($out,0600);
 try{
  if(fwrite($file,"DLOOP_DEVICE_ID=$id\nDLOOP_DEVICE_TOKEN=$token\n")===false)throw new RuntimeException();fflush($file);
  $db->beginTransaction();
  if($mode==='--register')$db->prepare('INSERT INTO scale_devices(device_id,token_hash) VALUES(?,?)')->execute([$id,hash('sha256',$token)]);
  else{$q=$db->prepare('UPDATE scale_devices SET token_hash=?,credential_version=credential_version+1,enabled=1,active_boot=NULL,updated_at=CURRENT_TIMESTAMP(6) WHERE device_id=?');$q->execute([hash('sha256',$token),$id]);if($q->rowCount()!==1)throw new RuntimeException();}
  $db->commit();
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();fclose($file);unlink($out);throw $e;}
 fclose($file);unset($token);echo "Device credential saved to the approved private file; no token printed. Inventory untouched.\n";
}catch(Throwable $e){cliFailure($e);}
