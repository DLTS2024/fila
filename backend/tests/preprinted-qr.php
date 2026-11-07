<?php
declare(strict_types=1);
require dirname(__DIR__).'/bin/common.php';
$c=cliConfig();if(!str_starts_with($c['database']['name'],'dloop_test_local_mode_'))throw new RuntimeException('Disposable QR fixture required.');
$db=\DLoop\Database::connect($c);$i=new \DLoop\Inventory($db,'1');$qr=new \DLoop\QrLabels($db,'1');
if(($argv[1]??'')==='--race'){
 $body=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR);try{$i->mutate($body,bin2hex(random_bytes(16)));echo json_encode(['ok'=>true]);}catch(\DLoop\HttpError $e){echo json_encode(['ok'=>false,'code'=>$e->errorCode]);}exit;
}
$checks=0;$check=static function($ok,string $why)use(&$checks){if(!$ok)throw new RuntimeException($why);$checks++;};
$save=static fn($a)=>$i->mutate(['revision'=>$i->snapshot()['revision'],'action'=>$a],bin2hex(random_bytes(16)));
$reject=static function($run,$code)use($check){try{$run();throw new RuntimeException('Expected refusal');}catch(\DLoop\HttpError $e){$check($e->errorCode===$code,'Unexpected refusal '.$e->errorCode);}};
$sqlReject=static function($sql,$values)use($db,$check){try{$db->prepare($sql)->execute($values);throw new RuntimeException('Invalid lifecycle SQL succeeded');}catch(PDOException $e){$check(in_array((int)($e->errorInfo[1]??0),[1062,1644,3819,4025],true),'Expected constraint/trigger refusal');}};
$key=bin2hex(random_bytes(16));$batch=$qr->generate(['count'=>100,'requestKey'=>$key,'confirmed'=>true]);$labels=array_column($batch['labels'],'id');
$check(count(array_unique($labels))===100&&count(array_filter($batch['labels'],fn($l)=>$l['state']==='UNUSED'))===100,'100 unique unused labels');
$check($qr->generate(['count'=>100,'requestKey'=>$key,'confirmed'=>true])==$batch,'Batch retry must return same IDs');
$check($qr->batch($batch['id'])==$batch,'Re-download keeps same ordered IDs');
$reject(fn()=>$qr->generate(['count'=>50,'requestKey'=>$key,'confirmed'=>true]),'idempotency_conflict');
$reject(fn()=>$qr->generate(['count'=>101,'requestKey'=>bin2hex(random_bytes(16)),'confirmed'=>true]),'validation_error');
$name='QR test '.bin2hex(random_bytes(4));$s=$save(['type'=>'brand','brand'=>['name'=>$name,'active'=>true,'defaultTare'=>'193','defaultTareVerified'=>false]]);$brand=array_values(array_filter($s['state']['brands'],fn($b)=>$b['name']===$name))[0];
$template=['name'=>'QR spool '.$brand['id'],'brandId'=>$brand['id'],'material'=>'PLA+','colorName'=>'QRLABEL','color'=>'#ffffff','spoolType'=>'Unknown','capacity'=>'1000','initial'=>'982','remaining'=>'982','mode'=>'manual','registrationKind'=>'partial','profileId'=>null,'tareOverride'=>null,'location'=>'','catalogueId'=>null];
$before=$i->snapshot();$bad=$template;$bad['remaining']='2000';$reject(fn()=>$save(['type'=>'add','confirmed'=>true,'qrLabelId'=>$labels[0],'spool'=>$bad]),'invalid_mass');$check($qr->resolve($labels[0])['state']==='UNUSED'&&$i->snapshot()==$before,'Failed save rolls back and keeps QR unused');
$s=$save(['type'=>'add','confirmed'=>true,'qrLabelId'=>$labels[0],'spool'=>$template]);$p=array_values(array_filter($s['state']['spools'],fn($p)=>$p['qrLabelId']===$labels[0]))[0];
$check($qr->resolve($labels[0])['spoolId']===$p['id'],'Assigned scan resolves same existing spool');
$before=$i->snapshot();$reject(fn()=>$save(['type'=>'add','confirmed'=>true,'qrLabelId'=>$labels[0],'spool'=>$template]),'qr_not_unused');$check($i->snapshot()==$before,'Duplicate creation rolls back entirely');
$s=$save(['type'=>'add','confirmed'=>true,'spool'=>array_replace($template,['name'=>'Other QR spool '.$brand['id']])]);$other=array_values(array_filter($s['state']['spools'],fn($p)=>$p['name']==='Other QR spool '.$brand['id']))[0];
$sqlReject('UPDATE qr_labels SET spool_id=? WHERE label_id=?',[$other['id'],$labels[0]]);
$sqlReject('UPDATE qr_labels SET label_id=? WHERE label_id=?',[bin2hex(random_bytes(16)),$labels[0]]);
$sqlReject('DELETE FROM qr_labels WHERE label_id=?',[$labels[0]]);
$s=$save(['type'=>'qr-bind','id'=>$p['id'],'version'=>$p['version'],'qrLabelId'=>$labels[1],'replace'=>true,'confirmed'=>true]);$p=array_values(array_filter($s['state']['spools'],fn($v)=>$v['id']===$p['id']))[0];
$reject(fn()=>$qr->resolve($labels[0]),'retired_qr');$check($p['qrLabelId']===$labels[1]&&$p['remaining']===982.0&&$p['tare']===193.0,'Replacement preserves spool and weights');
$sqlReject("UPDATE qr_labels SET state='ASSIGNED',retired_at=NULL WHERE label_id=?",[$labels[0]]);
$s=$save(['type'=>'qr-bind','id'=>$other['id'],'version'=>$other['version'],'qrLabelId'=>$labels[2],'replace'=>false,'confirmed'=>true]);
$before=$i->snapshot();$reject(fn()=>$save(['type'=>'qr-bind','id'=>$p['id'],'version'=>$p['version'],'qrLabelId'=>$labels[2],'replace'=>true,'confirmed'=>true]),'qr_not_unused');$check($i->snapshot()==$before&&$qr->resolve($labels[1])['state']==='ASSIGNED','Failed replacement restores original QR and history');
$q=$db->prepare("UPDATE qr_labels SET state='ASSIGNED',spool_id=?,assigned_at=CURRENT_TIMESTAMP(6) WHERE label_id=?");
$sqlReject("UPDATE qr_labels SET state='ASSIGNED',spool_id=?,assigned_at=CURRENT_TIMESTAMP(6) WHERE label_id=?",[$other['id'],$labels[3]]);
$s=$save(['type'=>'qr-retire','id'=>$p['id'],'version'=>$p['version'],'confirmed'=>true]);$p=array_values(array_filter($s['state']['spools'],fn($v)=>$v['id']===$p['id']))[0];$check($p['qrLabelId']===null&&$p['remaining']===982.0,'Retirement keeps inventory');
$reject(fn()=>$qr->resolve(str_repeat('f',32)),'unknown_qr');$reject(fn()=>$qr->resolve('forged'),'invalid_qr');
$beforeFailure=$i->snapshot();$failedAfterBind=false;try{(new \DLoop\Inventory($db,'999999999'))->mutate(['revision'=>$beforeFailure['revision'],'action'=>['type'=>'add','confirmed'=>true,'qrLabelId'=>$labels[3],'spool'=>$template]],bin2hex(random_bytes(16)));}catch(PDOException $e){$failedAfterBind=(int)($e->errorInfo[1]??0)===1452;}
$check($failedAfterBind,'Injected post-bind FK failure');$check($qr->resolve($labels[3])['state']==='UNUSED'&&$i->snapshot()==$beforeFailure,'Post-bind database failure rolls back QR, spool, revision and history');
$before=$i->snapshot();$body=['revision'=>$before['revision'],'action'=>['type'=>'add','confirmed'=>true,'qrLabelId'=>$labels[4],'spool'=>array_replace($template,['name'=>'Concurrent QR spool '.$brand['id']])]];
$jobs=[];for($n=0;$n<2;$n++){$process=proc_open([PHP_BINARY,__FILE__,'--race'],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);fwrite($pipes[0],json_encode($body));fclose($pipes[0]);$jobs[]=[$process,$pipes];}
$results=[];foreach($jobs as [$process,$pipes]){$results[]=json_decode(stream_get_contents($pipes[1]),true,512,JSON_THROW_ON_ERROR);stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);$check(proc_close($process)===0,'Race subprocess failed');}
$check(count(array_filter($results,fn($r)=>$r['ok']))===1,'Exactly one concurrent assignment succeeds');$check(count($i->snapshot()['state']['spools'])===count($before['state']['spools'])+1,'No concurrent duplicate spool');
$check($qr->resolve($labels[4])['state']==='ASSIGNED','Concurrent winner has one binding');
file_put_contents(dirname(__DIR__,2).'/work/qr-test-batch.json',json_encode($qr->batch($batch['id']),JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
echo "PASS: $checks pre-printed QR checks: 100 unique labels, idempotent batch/re-download, atomic registration/rollback, assigned scan, SQL lifecycle/uniqueness, replacement/retirement/history, forged IDs and two-process assignment race. Disposable DB only.\n";
