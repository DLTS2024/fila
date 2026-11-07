<?php
declare(strict_types=1);
require dirname(__DIR__).'/bin/common.php';
$c=cliConfig();if(!str_starts_with($c['database']['name'],'dloop_test_local_mode_'))throw new RuntimeException('Disposable fixture only.');
$db=\DLoop\Database::connect($c);$i=new \DLoop\Inventory($db,'1');$checks=0;
$check=static function($ok)use(&$checks){if(!$ok)throw new RuntimeException('Estimate regression');$checks++;};
$save=static function($a,$revision=null)use($i){return $i->mutate(['revision'=>$revision??$i->snapshot()['revision'],'action'=>$a],bin2hex(random_bytes(16)));};
$reject=static function($a,$code,$revision=null)use($save,$check){try{$save($a,$revision);throw new RuntimeException('Expected rejection');}catch(\DLoop\HttpError $e){$check($e->errorCode===$code);}};
$brandName='Remaining test '.bin2hex(random_bytes(4));
$s=$save(['type'=>'brand','brand'=>['name'=>$brandName,'active'=>true,'defaultTare'=>'193','defaultTareVerified'=>false]]);$b=end($s['state']['brands']);
// Find the uniquely generated brand without relying on alphabetical order.
$brands=array_values(array_filter($s['state']['brands'],fn($v)=>$v['name']===$brandName));$b=end($brands);
$s=$save(['type'=>'add','confirmed'=>true,'spool'=>['name'=>'Estimate fixture '.$b['id'],'brandId'=>$b['id'],'material'=>'PLA+','colorName'=>'White','color'=>'#ffffff','spoolType'=>'Unknown','capacity'=>'1000','initial'=>'982','remaining'=>'982','mode'=>'manual','registrationKind'=>'partial','profileId'=>null,'tareOverride'=>null,'location'=>'','catalogueId'=>null]]);
$p=array_values(array_filter($s['state']['spools'],fn($p)=>$p['brandId']===$b['id']))[0];
$measurements=(int)$db->query('SELECT COUNT(*) FROM measurements')->fetchColumn();
$action=static fn($p,$gross)=>['type'=>'manual-estimate','id'=>$p['id'],'version'=>$p['version'],'confirmed'=>true,'gross'=>$gross,'tare'=>'193','capturedAt'=>gmdate('Y-m-d\TH:i:s').'.000Z','source'=>'live-preview-usb'];
$a=$action($p,'850');$reject(array_replace($a,['confirmed'=>false]),'confirmation_required');$reject(array_replace($a,['version'=>$p['version']+1]),'version_conflict');$reject($a,'revision_conflict',$s['revision']-1);
$reject(array_replace($a,['tare'=>'194']),'tare_changed');$reject(array_replace($a,['capturedAt'=>'2000-01-01T00:00:00.000Z']),'stale_estimate');
foreach(['0','192','10001','1500'] as $gross)$reject(array_replace($a,['gross'=>$gross]),'invalid_mass');
foreach(['-1','NaN','Infinity'] as $gross)$reject(array_replace($a,['gross'=>$gross]),'validation_error');
$s=$save($a);$p=array_values(array_filter($s['state']['spools'],fn($v)=>$v['id']===$p['id']))[0];$check($p['remaining']===657.0&&!$p['measured']&&$p['tareProvisional']&&$p['gross']===null&&str_contains($p['estimateNote'],'captured'));
$s=$save($action($p,'1175'));$p=array_values(array_filter($s['state']['spools'],fn($v)=>$v['id']===$p['id']))[0];$check($p['remaining']===982.0&&$p['initial']===982.0&&$p['tare']===193.0);
$check((int)$db->query('SELECT COUNT(*) FROM measurements')->fetchColumn()===$measurements);
$reject(array_replace($action($p,'850'),['source'=>'verified-scale']),'validation_error');
$wifi=$action($p,'850');$wifi['source']='live-preview-wifi';$s=$save($wifi);$p=array_values(array_filter($s['state']['spools'],fn($v)=>$v['id']===$p['id']))[0];$check($p['remaining']===657.0&&!$p['measured']&&str_contains($p['estimateNote'],'live-preview-wifi'));
$s=$save(['type'=>'brand','brand'=>array_replace($b,['defaultTare'=>null,'defaultTareVerified'=>false])]);
$s=$save($action($p,'850'));$saved=array_values(array_filter($s['state']['spools'],fn($v)=>$v['id']===$p['id']))[0];$check($saved['remaining']===657.0&&$saved['tare']===193.0); // Brand changes preserve the physical spool snapshot.
echo "PASS: $checks manual UNVERIFIED estimate checks: arithmetic, timestamp/provenance, no measurements, confirmation, stale/version/revision/tare conflicts and invalid masses. Disposable database only.\n";
