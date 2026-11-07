<?php
declare(strict_types=1);
require dirname(__DIR__).'/bin/common.php';
try{
 $c=cliConfig();if(!str_starts_with($c['database']['name'],'dloop_test_local_mode_'))throw new RuntimeException('Disposable database required.');$db=\DLoop\Database::connect($c);$db->exec('SET TRANSACTION READ ONLY');$db->beginTransaction();
 $unused=(int)$db->query("SELECT COUNT(*) FROM qr_labels WHERE state='UNUSED'")->fetchColumn();if($unused<1)throw new RuntimeException('No existing UNUSED fixture QR available; do not generate labels automatically.');
 echo json_encode(['database'=>$c['database']['name'],'existingUnusedLabels'=>$unused,'migrationCount'=>(int)$db->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn(),'labelCount'=>(int)$db->query('SELECT COUNT(*) FROM qr_labels')->fetchColumn(),'measurementCount'=>(int)$db->query('SELECT COUNT(*) FROM measurements')->fetchColumn()]).PHP_EOL;$db->rollBack();
}catch(Throwable $e){cliFailure($e);}
