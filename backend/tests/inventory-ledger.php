<?php
declare(strict_types=1);
require dirname(__DIR__) . '/bin/common.php';
try {
    $config=cliConfig();
    if ($config['environment']!=='local'||!str_starts_with($config['database']['name'],'dloop_test_p4_')) {throw new RuntimeException('Phase 4 disposable DB required.');}
    $pdo=\DLoop\Database::connect($config);$checks=0;
    $assert=static function(bool $ok,string $label)use(&$checks):void{if(!$ok)throw new RuntimeException('Ledger mismatch: '.$label);$checks++;};
    $scalar=static function(string $sql)use($pdo){return $pdo->query($sql)->fetchColumn();};
    $revision=(int)$scalar('SELECT revision FROM studio_revision WHERE id=1');
    $keys=(int)$scalar('SELECT COUNT(*) FROM idempotency_keys');
    $assert($revision===$keys,'one committed key per revision');
    $assert((int)$scalar('SELECT COALESCE(MAX(OCTET_LENGTH(response_json)),0) FROM idempotency_keys')<100,'compact retry ledger');
    $assert((int)$scalar('SELECT COUNT(*) FROM measurements')===4,'exactly four confirmed measurements despite retries');
    $assert((int)$scalar('SELECT COUNT(*) FROM measurements WHERE gross_g-effective_tare_g<>net_g OR confirmed_by IS NULL')===0,'measurement arithmetic and actor');
    $assert((int)$scalar('SELECT COUNT(*) FROM activity_events WHERE actor_id IS NULL')===0,'all new activity has an actor');
    $assert((int)$scalar("SELECT COUNT(*) FROM activity_events WHERE name='Must roll back'")===0,'failed usage rolled back fully');
    $assert((int)$scalar('SELECT COUNT(*) FROM (SELECT code FROM spools GROUP BY code HAVING COUNT(*)>1) duplicates')===0,'unique physical codes');
    $assert((int)$scalar("SELECT COUNT(*) FROM spools WHERE code='PLA_BLACK_03' AND status='archived'")===1,'archived ID retained');
    $assert((int)$scalar("SELECT COUNT(*) FROM spools WHERE name='Sealed Black' AND code='PLA_BLACK_02' AND material='PETG'")===1,'immutable code after material edit');
    foreach($pdo->query('SELECT prefix,next_number FROM spool_code_sequences')->fetchAll() as $sequence){
        $max=0;foreach($pdo->query('SELECT code FROM spools')->fetchAll(PDO::FETCH_COLUMN) as $code){if(str_starts_with($code,$sequence['prefix'].'_')&&preg_match('/^'.preg_quote($sequence['prefix'],'/').'_(\d+)$/D',$code,$m))$max=max($max,(int)$m[1]);}
        $assert((int)$sequence['next_number']>$max,'monotonic sequence '.$sequence['prefix']);
    }
    $events=(int)$scalar('SELECT COUNT(*) FROM activity_events');$assert($events>=$revision,'history for every mutation');
    $result=['checks'=>$checks,'revision'=>$revision,'idempotencyKeys'=>$keys,'measurements'=>4,'events'=>$events,'spools'=>(int)$scalar('SELECT COUNT(*) FROM spools'),'verifiedAt'=>gmdate('c')];
    file_put_contents(dirname(__DIR__).'/var/phase4/ledger-results.json',json_encode($result,JSON_PRETTY_PRINT));
    echo "PASS: $checks read-only ledger assertions; exact measurement count, compact idempotency, actor/history, rollback, immutable/archived codes and monotonic counters.\n";
}catch(Throwable $e){cliFailure($e);}
