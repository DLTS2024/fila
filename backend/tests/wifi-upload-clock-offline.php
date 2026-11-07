<?php
declare(strict_types=1);
// No configuration, bootstrap, credentials or database connection is loaded.
foreach (['Http','Validation','LocalAccess','WifiScale'] as $class) require __DIR__.'/../src/'.$class.'.php';
final class UploadValidationComplete extends RuntimeException {}
final class OfflineAvailability extends PDOStatement {
 public function __construct() {}
 public function fetchColumn(int $column=0): mixed {return 1;}
}
final class OfflineUploadDatabase extends PDO {
 public function __construct() {} // Intentionally never initializes a PDO connection.
 public function query(string $query, ?int $fetchMode=null, mixed ...$fetchModeArgs): PDOStatement|false {
  if(!str_contains($query,'information_schema.tables')) throw new RuntimeException('Unexpected query');
  return new OfflineAvailability();
 }
 public function beginTransaction(): bool {throw new UploadValidationComplete();}
}
$service=new DLoop\WifiScale(['wifi_scale_enabled'=>true,'access_mode'=>'AUTHENTICATED'],new OfflineUploadDatabase());
$frame=['v'=>1,'deviceId'=>'DLOOP-SCALE-01','seq'=>12,'grossG'=>null,'stable'=>false,'calibrated'=>false,'fault'=>'CALIBRATION_REQUIRED',
 'live'=>['raw'=>12345,'grams'=>null,'ageMs'=>20,'calibrated'=>false,'strictStable'=>false,'hold'=>0,'pending'=>0,'stage'=>'EMPTY','spike'=>false]];
$now=1800000000000;$checks=0;
$check=static function(int $sent,string $expected,?array $custom=null)use($service,$frame,$now,&$checks):void{
 try {
  $service->ingest(['bootId'=>str_repeat('a',32),'sentAtMs'=>$sent,'frame'=>$custom??$frame],
   'Bearer '.str_repeat('0',64),['HTTPS'=>'on'],$now);
  throw new RuntimeException('Unexpected write path');
 }catch(UploadValidationComplete){$actual='validated';}
 catch(DLoop\HttpError $e){$actual=$e->errorCode;}
 if($actual!==$expected)throw new RuntimeException('Offline upload validation regression');
 ++$checks;
};
// A 6-second handshake ages the OLD frame, not a newly captured post-TLS frame.
$check($now-6500,'stale_upload');
$check($now-250,'validated');
$check($now-5442,'stale_upload');
$check($now-5000,'validated');$check($now-5001,'stale_upload');
$check($now+1000,'validated');$check($now+1001,'stale_upload');
$stale=$frame;$stale['live']['ageMs']=501;
$check($now,'invalid_preview',$stale); // A fresh envelope cannot refresh stale raw data.
$stale['live']['raw']=null;$check($now,'validated',$stale); // Honest fault/status only.
$unsupported=$frame;$unsupported['mode']='SINGLE_POINT';$check($now,'invalid_frame',$unsupported);
$invented=$frame;$invented['live']['grams']=1802;$check($now,'invalid_preview',$invented);
$falseStable=$frame;$falseStable['stable']=true;$check($now,'invalid_frame',$falseStable);
echo "PASS: $checks offline API clock/freshness cases; no database connection or writes.\n";
