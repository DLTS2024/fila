<?php
declare(strict_types=1);
foreach(['Http','Validation','LocalAccess','WifiScale'] as $class)require __DIR__.'/../src/'.$class.'.php';
final class PreviewAgeRows extends PDOStatement {
 public function __construct(private array $row=[]){}
 public function fetchColumn(int $column=0): mixed{return 1;}
 public function fetch(int $mode=PDO::FETCH_DEFAULT,int $cursorOrientation=PDO::FETCH_ORI_NEXT,int $cursorOffset=0): mixed{return $this->row;}
}
final class PreviewAgeDatabase extends PDO {
 public array $row;
 public function __construct(){} // No PDO connection, credentials or configuration.
 public function query(string $query,?int $fetchMode=null,mixed ...$fetchModeArgs): PDOStatement|false {
  if(str_contains($query,'information_schema.tables'))return new PreviewAgeRows();
  if(!str_starts_with($query,'SELECT r.* FROM scale_live_readings'))throw new RuntimeException('Unexpected query');
  return new PreviewAgeRows($this->row);
 }
}
$db=new PreviewAgeDatabase();$service=new DLoop\WifiScale(['wifi_scale_enabled'=>true],$db);
$frame=['v'=>1,'deviceId'=>'DLOOP-SCALE-01','seq'=>1325,'grossG'=>null,'stable'=>false,'calibrated'=>false,'fault'=>'CALIBRATION_REQUIRED',
 'live'=>['raw'=>125300,'grams'=>null,'ageMs'=>100,'calibrated'=>false,'strictStable'=>false,'hold'=>0,'pending'=>0,'stage'=>'EMPTY','spike'=>false]];
$received=1793988082568;
$db->row=['received_ms'=>$received,'sent_ms'=>$received-493,'frame_json'=>json_encode($frame),'boot_id'=>'synthetic'];
$result=$service->latest($received+257);
if($result['reading']['frame']['live']['ageMs']!==850||$result['reading']['frame']['live']['raw']!==null||$result['reading']['ageMs']!==257)throw new RuntimeException('850 ms expiry regression');
if(json_decode($db->row['frame_json'],true)['live']['raw']!==125300)throw new RuntimeException('GET modified storage');
$frame['live']['ageMs']=0;$db->row['sent_ms']=$received-200;$db->row['frame_json']=json_encode($frame);
$fresh=$service->latest($received+100)['reading']['frame']['live'];
if($fresh['ageMs']!==300||$fresh['raw']!==125300||$fresh['calibrated']!==false||$fresh['grams']!==null)throw new RuntimeException('Fresh unverified raw regression');
$frame['live']['raw']=null;$db->row['frame_json']=json_encode($frame);
if($service->latest($received+100)['reading']['frame']['live']['raw']!==null)throw new RuntimeException('Cached raw resurrection');
$stage=['database'=>['name'=>'dltsin_fila_stage'],'allowed_origins'=>['https://staging-fila.dlts.in']];
if(!DLoop\WifiScale::stagingTimingEnabled($stage,['HTTP_HOST'=>'staging-fila.dlts.in']))throw new RuntimeException('Staging timing gate');
foreach([
 [array_replace($stage,['database'=>['name'=>'dltsin_fila']]),['HTTP_HOST'=>'staging-fila.dlts.in']],
 [$stage,['HTTP_HOST'=>'fila.dlts.in']],
 [array_replace($stage,['allowed_origins'=>['https://fila.dlts.in']]),['HTTP_HOST'=>'staging-fila.dlts.in']]
] as [$config,$server])if(DLoop\WifiScale::stagingTimingEnabled($config,$server))throw new RuntimeException('Timing identity isolation');
if(isset($service->latest($received+100)['timing']))throw new RuntimeException('Legacy response changed');
$timed=$service->latest($received+100,hrtime(true)-1700000000,1400);
if(($timed['timing']['version']??0)!==1||$timed['timing']['preSnapshotMs']<1700||$timed['timing']['authMs']!==1400||$timed['timing']['lookupMs']<0)throw new RuntimeException('Monotonic snapshot timing');
if(array_keys($timed['timing'])!==['version','preSnapshotMs','authMs','lookupMs'])throw new RuntimeException('Unexpected timing fields');
$stageService=new DLoop\WifiScale($stage+['wifi_scale_enabled'=>true],$db);
$frame['live']['raw']=125300;$frame['live']['ageMs']=100;$db->row['sent_ms']=$received-493;$db->row['frame_json']=json_encode($frame);
$delayed=$stageService->latest($received+257,hrtime(true)-1000000);
if($delayed['reading']['frame']['live']['raw']!==null||$delayed['observation']['raw']!==125300||$delayed['observation']['sampleAgeMs']!==850||$delayed['observation']['verification']!=='UNVERIFIED'||!$delayed['observation']['usable'])throw new RuntimeException('Delayed observation must not weaken verified preview');
if(isset($service->latest($received+257,hrtime(true)-1000000)['observation']))throw new RuntimeException('Observation leaked outside staging identity');
$frame['fault']='HX711_TIMEOUT';$db->row['frame_json']=json_encode($frame);
$fault=$stageService->latest($received+257,hrtime(true)-1000000)['observation'];
if($fault['raw']!==null||$fault['usable'])throw new RuntimeException('Faulty observation enabled');
echo "PASS: real GET reproduces 850 ms expiry/257 ms storage age, retains fresh uncalibrated raw, never resurrects nulls or writes storage. Synthetic timing split; no database connection.\n";
