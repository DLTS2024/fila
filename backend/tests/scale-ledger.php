<?php
declare(strict_types=1);
require dirname(__DIR__) . '/bin/common.php';
try {
    $config=cliConfig();
    if ($config['environment']!=='local'||!str_starts_with($config['database']['name'],'dloop_test_p4_p5a_')) {throw new RuntimeException('Phase 5A disposable DB required.');}
    $pdo=\DLoop\Database::connect($config);
    $server=json_decode(file_get_contents(dirname(__DIR__).'/var/phase5a/server-scale-results.json'),true,64,JSON_THROW_ON_ERROR);
    $ui=json_decode(file_get_contents(dirname(__DIR__).'/var/phase5a/ui-scale-results.json'),true,64,JSON_THROW_ON_ERROR);
    $checks=0;$assert=static function(bool $ok,string $label)use(&$checks){if(!$ok)throw new RuntimeException('Scale ledger mismatch: '.$label);$checks++;};
    foreach([[$server['physicalSequence'],'usb'],[$server['simulatorSequence'],'manual']] as [$seq,$source]){
        $q=$pdo->prepare('SELECT * FROM measurements WHERE spool_id=? AND device_id=? AND device_sequence=?');$q->execute([$server['target'],'DLOOP-SCALE-01',$seq]);$rows=$q->fetchAll();
        $assert(count($rows)===1,'one record per confirmed sequence');$r=$rows[0];$assert($r['source']===$source&&(int)$r['stable']===1,'provenance');$assert($r['gross_g']==='900.00'&&$r['effective_tare_g']==='220.00'&&$r['net_g']==='680.00','exact net mass');
    }
    $q=$pdo->prepare('SELECT * FROM measurements WHERE spool_id=? ORDER BY confirmed_at,id');$q->execute([$ui['spoolId']]);$rows=$q->fetchAll();
    $assert(count($rows)===2,'one simulator confirmation and one manual confirmation despite retries');
    $sim=array_values(array_filter($rows,static fn($r)=>$r['device_id']==='DLOOP-SCALE-01'));
    $manual=array_values(array_filter($rows,static fn($r)=>$r['device_id']===null));
    $assert(count($sim)===1&&$sim[0]['source']==='manual'&&$sim[0]['net_g']==='764.60','simulator never labelled physical USB');
    $assert(count($manual)===1&&$manual[0]['net_g']==='680.00','manual fallback');
    $q=$pdo->prepare("SELECT details_json FROM activity_events WHERE event_type='weigh' AND JSON_UNQUOTE(JSON_EXTRACT(details_json,'$.reading.connectionId'))=?");$q->execute([$server['connectionId']]);$events=$q->fetchAll();
    $assert(count($events)===2,'duplicate/stale frames do not add history');foreach($events as $event){$r=json_decode($event['details_json'],true)['reading'];$assert($r['calibrated']===true&&$r['stable']===true,'status proof in history');}
    echo "PASS: $checks read-only scale ledger assertions: exact masses, single writes/history, calibration flags, USB provenance, explicit simulator provenance and manual fallback.\n";
}catch(Throwable $e){cliFailure($e);}
