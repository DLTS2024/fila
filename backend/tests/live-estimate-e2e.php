<?php
declare(strict_types=1);
require dirname(__DIR__).'/bin/common.php';
$c=cliConfig();if(!str_starts_with($c['database']['name'],'dloop_test_local_mode_'))throw new RuntimeException('Disposable fixture required.');
$db=\DLoop\Database::connect($c);$i=new \DLoop\Inventory($db,'1');
$receipt=dirname(__DIR__,2).'/work/local-single-user-test/live-estimate-e2e.json';
if(($argv[1]??'')==='--prepare'){
 $s=$i->snapshot();if(array_filter($s['state']['brands'],fn($b)=>$b['name']==='Numaker'))throw new RuntimeException('Fresh fixture required.');
 $save=static fn($a)=>$i->mutate(['revision'=>$i->snapshot()['revision'],'action'=>$a],bin2hex(random_bytes(16)));
 $s=$save(['type'=>'brand','brand'=>['name'=>'Numaker','active'=>true,'defaultTare'=>'193','defaultTareVerified'=>false]]);
 $b=array_values(array_filter($s['state']['brands'],fn($b)=>$b['name']==='Numaker'))[0];
 $s=$save(['type'=>'add','confirmed'=>true,'spool'=>['name'=>'E2E Numaker White','brandId'=>$b['id'],'material'=>'PLA+','colorName'=>'White','color'=>'#ffffff','spoolType'=>'Unknown','capacity'=>'1000','initial'=>'982','remaining'=>'982','mode'=>'manual','registrationKind'=>'partial','profileId'=>null,'tareOverride'=>null,'location'=>'','catalogueId'=>null]]);
 $p=array_values(array_filter($s['state']['spools'],fn($p)=>$p['brandId']===$b['id']))[0];if($p['code']!=='PLA_WHITE_01')throw new RuntimeException();
 file_put_contents($receipt,json_encode(['database'=>$c['database']['name'],'id'=>$p['id'],'measurements'=>(int)$db->query('SELECT COUNT(*) FROM measurements')->fetchColumn(),'spools'=>count($s['state']['spools'])],JSON_THROW_ON_ERROR));
 echo "Prepared disposable Numaker live-save fixture; personal inventory untouched.\n";exit;
}
if(($argv[1]??'')!=='--verify')throw new RuntimeException();
$r=json_decode(file_get_contents($receipt),true,512,JSON_THROW_ON_ERROR);if($r['database']!==$c['database']['name'])throw new RuntimeException();
$s=$i->snapshot();$p=array_values(array_filter($s['state']['spools'],fn($p)=>$p['id']===$r['id']))[0];
if($p['remaining']!==657.0||$p['initial']!==982.0||$p['tare']!==193.0||!$p['tareProvisional']||$p['measured']||$p['gross']!==null||!str_contains($p['estimateNote'],'live-preview-usb')||count($s['state']['spools'])!==$r['spools']||(int)$db->query('SELECT COUNT(*) FROM measurements')->fetchColumn()!==$r['measurements'])throw new RuntimeException('End-to-end preservation failed.');
echo "PASS: real frontend save persisted 657 g as manual UNVERIFIED estimate with source/timestamp; initial 982 g, tare 193 g, spool count and measurement count preserved. Disposable database only.\n";
