<?php
declare(strict_types=1);
require __DIR__.'/common.php';
try{
 $c=cliConfig();$db=\DLoop\Database::connect($c);
 $db->exec('SET TRANSACTION READ ONLY');$db->beginTransaction();
 $tables=$db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
 $ledger=in_array('schema_migrations',$tables,true)?$db->query('SELECT version,checksum FROM schema_migrations ORDER BY version')->fetchAll(PDO::FETCH_KEY_PAIR):[];
 $migrations=[];foreach(glob(dirname(__DIR__).'/migrations/*.sql') as $f){$name=basename($f);$migrations[$name]=isset($ledger[$name])?(hash_equals($ledger[$name],hash_file('sha256',$f))?'applied':'CHECKSUM_MISMATCH'):'pending';}
 $counts=[];foreach(['users','brands','spools','activity_events'] as $table)if(in_array($table,$tables,true))$counts[$table]=(int)$db->query('SELECT COUNT(*) FROM '.$table)->fetchColumn();
 $matches=null;if(in_array('spools',$tables,true)){$columns=$db->query('SHOW COLUMNS FROM spools')->fetchAll(PDO::FETCH_COLUMN);if(in_array('code',$columns,true)){$q=$db->prepare('SELECT COUNT(*) FROM spools WHERE code=?');$q->execute(['PLA_WHITE_01']);$matches=(int)$q->fetchColumn();}}
 $db->rollBack();echo json_encode(['phpVersion'=>PHP_VERSION,'integerBits'=>PHP_INT_SIZE*8,'pdoMysql'=>extension_loaded('pdo_mysql'),'database'=>$c['database']['name'],'accessMode'=>$c['access_mode']??'AUTHENTICATED','migrations'=>$migrations,'counts'=>$counts,'PLA_WHITE_01_matches'=>$matches,'untrackedExistingSchema'=>!$ledger&&count($tables)>0,'note'=>'Read-only; no assumption that target is empty. Apache/HTTPS routing must be checked separately.'],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL;
}catch(Throwable $e){cliFailure($e);}
