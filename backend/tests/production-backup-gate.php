<?php
declare(strict_types=1);
require dirname(__DIR__).'/bin/common.php';
$c=cliConfig();if(!str_starts_with($c['database']['name'],'dloop_test_local_mode_'))throw new RuntimeException('Disposable fixture only.');
$dir=dirname(__DIR__).'/var/backups';if(!is_dir($dir))mkdir($dir,0700,true);
$tag='test-'.bin2hex(random_bytes(5));$config=dirname($c['session_dir']).'/'.$tag.'.config.local.php';$sql=$dir.'/'.$tag.'.sql';$manifest=$dir.'/'.$tag.'.json';
$c['environment']='production';$c['allowed_origins']=['https://fila.dlts.in'];$c['access_mode']='AUTHENTICATED';
file_put_contents($config,"<?php return ".var_export($c,true).';');chmod($config,0600);file_put_contents($sql,str_repeat('-- disposable fixture backup-gate test only'.PHP_EOL,10));
$run=static function($m)use($config){$env=getenv();$env['DLOOP_CONFIG_FILE']=$config;$env['DLOOP_BACKUP_MANIFEST']=$m;$p=proc_open([PHP_BINARY,dirname(__DIR__).'/bin/migrate.php','--apply'],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,null,$env);fclose($pipes[0]);stream_get_contents($pipes[1]);stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);return proc_close($p);};
try{
 if($run('')===0)throw new RuntimeException('Missing backup accepted.');
 $m=['database'=>$c['database']['name'],'backupFile'=>realpath($sql),'sha256'=>str_repeat('0',64),'restoreVerified'=>true];file_put_contents($manifest,json_encode($m));
 if($run($manifest)===0)throw new RuntimeException('Tampered backup accepted.');
 $m['sha256']=hash_file('sha256',$sql);$m['restoreVerified']=false;file_put_contents($manifest,json_encode($m));if($run($manifest)===0)throw new RuntimeException('Missing restore attestation accepted.');
 $m['restoreVerified']=true;file_put_contents($manifest,json_encode($m));if($run($manifest)!==0)throw new RuntimeException('Valid fixture attestation rejected.');
 echo "PASS: production migration backup gate refuses missing/tampered/unattested backup; accepts matching private fixture manifest with all migrations already applied. No actual backup restoration or production access claimed.\n";
}finally{foreach([$config,$sql,$manifest] as $file)if(is_file($file))unlink($file);}
