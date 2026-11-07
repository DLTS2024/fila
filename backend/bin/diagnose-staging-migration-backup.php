<?php
declare(strict_types=1);
namespace DLoop\MigrationBackupDiagnostic;
// Private CLI, no application bootstrap, database adapter, sessions or migration execution.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
ini_set('display_errors','0');ini_set('display_startup_errors','0');ini_set('log_errors','0');
$stage='RUNTIME';$sent=false;$level=ob_get_level();ob_start(static fn(string $s):string=>'');
$finish=static function(string $result,int $status)use(&$sent,$level):never{$sent=true;while(ob_get_level()>$level)ob_end_clean();echo $result,PHP_EOL;exit($status);};
register_shutdown_function(static function()use(&$sent,&$stage,$level){if($sent)return;while(ob_get_level()>$level)ob_end_clean();echo 'FAIL: ',$stage,PHP_EOL;});
set_error_handler(static function():never{throw new \RuntimeException();});
try{
 if(PHP_VERSION_ID<80300||PHP_INT_SIZE!==8)throw new \RuntimeException();
 $stage='INVOCATION';if(count($argv)!==1)throw new \RuntimeException();
 $root=dirname(__DIR__);$stage='CONFIGURATION';
 if(!putenv('DLOOP_CONFIG_FILE='.$root.'/config.local.php'))throw new \RuntimeException();
 require_once $root.'/src/Http.php';require_once $root.'/src/LocalAccess.php';require_once $root.'/src/Config.php';
 $c=\DLoop\Config::load($root);$stage='STAGING_IDENTITY';
 if($c['environment']!=='production'||($c['access_mode']??'')!=='AUTHENTICATED'||$c['database']['name']!=='dltsin_fila_stage'||$c['database']['user']!=='dltsin_fila_stage'||$c['database']['host']!=='localhost'||$c['database']['port']!==3306||$c['allowed_origins']!==['https://staging-fila.dlts.in']||($c['phone_nfc_origin']??'')!=='https://staging-fila.dlts.in')throw new \RuntimeException();
 $stage='MANIFEST_ENV';$path=getenv('DLOOP_BACKUP_MANIFEST');if(!is_string($path)||$path==='')throw new \RuntimeException();
 $inside=static fn(string $p,string $dir):bool=>str_starts_with(str_replace('\\','/',$p),rtrim(str_replace('\\','/',$dir),'/').'/');
 $stage='MANIFEST_PATH';$base=realpath($root.'/var/backups');$real=realpath($path);if(!$base||!$real||!$inside($real,$base)||!is_file($real))throw new \RuntimeException();
 $stage='MANIFEST_READ';if(!is_readable($real)||($bytes=file_get_contents($real))===false)throw new \RuntimeException();
 $stage='MANIFEST_JSON';$backup=json_decode($bytes,true,512,JSON_THROW_ON_ERROR);unset($bytes);if(!is_array($backup))throw new \RuntimeException();
 $stage='BACKUP_DATABASE';if(($backup['database']??null)!==$c['database']['name'])throw new \RuntimeException();
 $stage='RESTORE_ATTESTATION';if(($backup['restoreVerified']??false)!==true)throw new \RuntimeException();
 $stage='BACKUP_PATH';$file=realpath($backup['backupFile']??'');if(!$file||!$inside($file,$base)||!is_file($file))throw new \RuntimeException();
 $stage='BACKUP_READ';if(!is_readable($file))throw new \RuntimeException();
 $stage='BACKUP_SIZE';if(filesize($file)<100)throw new \RuntimeException();
 $stage='BACKUP_HASH_TYPE';if(!is_string($backup['sha256']??null))throw new \RuntimeException();
 $stage='BACKUP_HASH_READ';$hash=hash_file('sha256',$file);if(!is_string($hash))throw new \RuntimeException();
 $stage='BACKUP_HASH_MISMATCH';if(!hash_equals($backup['sha256'],$hash))throw new \RuntimeException();
 $stage='UNEXPECTED_OUTPUT';if(ob_get_length()!==0)throw new \RuntimeException();
 $finish('PASS: STAGING_BACKUP_GATE',0);
}catch(\Throwable $e){$finish('FAIL: '.$stage,1);}
