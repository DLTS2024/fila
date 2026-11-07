<?php
declare(strict_types=1);
require dirname(__DIR__).'/src/bootstrap.php';
// No PDO constructor, credentials, sockets or databases. Exercise real service methods.
final class ManagementStatement extends PDOStatement {
    private array $rows=[];
    public function __construct(private ManagementPDO $db,private string $sql){}
    public function execute(?array $params=null):bool{$this->rows=$this->db->dispatch($this->sql,$params??[]);return true;}
    public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array{return $this->rows;}
}
final class ManagementPDO extends PDO {
    public bool $management=true;public array $tables=[];public array $writes=[];public bool $occupied=false;public bool $dependent=false;public bool $tx=false;public bool $rolledBack=false;
    public array $record=['id'=>'1','name'=>'Anycubic Kobra 3','version'=>2,'active'=>1,'status'=>'active','spool_type'=>'Fixture','tag_token'=>null];
    public function __construct(){}
    public function prepare(string $query,array $options=[]):PDOStatement|false{return new ManagementStatement($this,$query);}
    public function beginTransaction():bool{$this->tx=true;return true;}
    public function inTransaction():bool{return $this->tx;}
    public function rollBack():bool{$this->tx=false;$this->rolledBack=true;return true;}
    public function lastInsertId(?string $name=null):string|false{return '3';}
    public function dispatch(string $sql,array $params):array{
        if(str_contains($sql,'information_schema.columns'))return [['n'=>str_contains($sql,"table_name='catalogue_products'")?($this->management?2:0):(str_contains($sql,"table_name='printers'")?($this->management?1:0):1)]];
        if(str_contains($sql,'SELECT revision'))return [['revision'=>7]];
        if(str_contains($sql,'FROM idempotency_keys'))return [];
        if(str_contains($sql,'SELECT next_number'))return [['next_number'=>1]];
        if(preg_match('/SELECT \* FROM ([a-z_]+)/',$sql,$m))return isset($this->tables[$m[1]])?[$this->tables[$m[1]]]:[$this->record];
        if(str_contains($sql,'information_schema.key_column_usage'))return [['TABLE_NAME'=>'activity_changes','COLUMN_NAME'=>'spool_id']];
        if(str_starts_with($sql,'SELECT 1 FROM'))return $this->dependent?[[1]]:[];
        if(str_contains($sql,'FROM printer_slots')&&str_contains($sql,'SELECT id'))return $this->occupied?[['id'=>1]]:[];
        if(str_starts_with($sql,'SELECT'))return [];
        $this->writes[]=[$sql,$params];return [];
    }
}
$db=new ManagementPDO();$service=new DLoop\Inventory($db,'1');$checks=0;
function ok(bool $v):void{global $checks;if(!$v)throw new RuntimeException('Management regression');$checks++;}
function callMethod(string $name,mixed ...$args):mixed{global $service;return (new ReflectionMethod(DLoop\Inventory::class,$name))->invoke($service,...$args);}
function reject(callable $fn,string $code):void{global $db;$before=count($db->writes);try{$fn();throw new RuntimeException('Expected rejection '.$code);}catch(DLoop\HttpError $e){ok($e->errorCode===$code);ok(count($db->writes)===$before);}}
$p=['id'=>'1','version'=>2,'brand'=>'Anycubic','model'=>'Kobra 3','nickname'=>'Bench','mode'=>'single','slotCount'=>1,'active'=>true];
reject(fn()=>callMethod('printer',['printer'=>$p]),'confirmation_required');
foreach([0,33,1.5,'2'] as $n)reject(fn()=>callMethod('printer',['confirmed'=>true,'printer'=>array_replace($p,['slotCount'=>$n])]),'validation_error');
reject(fn()=>callMethod('printer',['confirmed'=>true,'printer'=>array_replace($p,['slotCount'=>2])]),'validation_error');
reject(fn()=>callMethod('printer',['confirmed'=>true,'printer'=>array_replace($p,['version'=>1])]),'version_conflict');
$db->occupied=true;
reject(fn()=>callMethod('printer',['confirmed'=>true,'printer'=>$p]),'occupied_slots');
reject(fn()=>callMethod('printer',['confirmed'=>true,'printer'=>array_replace($p,['active'=>false])]),'occupied_slots');
$db->occupied=false;callMethod('printer',['confirmed'=>true,'printer'=>$p]);ok(count($db->writes)>0);
foreach($db->writes as [$sql,$params])if(str_starts_with($sql,'DELETE'))ok(str_contains($sql,'spool_id IS NULL'));
$a=['entity'=>'spool','id'=>'00000000-0000-4000-8000-000000000001','version'=>2,'operation'=>'delete','confirmed'=>true];
$db->dependent=true;reject(fn()=>callMethod('recordState',$a),'dependent_record');
$db->dependent=false;$db->occupied=true;reject(fn()=>callMethod('recordState',array_replace($a,['operation'=>'archive'])),'occupied_slots');
$db->occupied=false;reject(fn()=>callMethod('recordState',array_replace($a,['version'=>1])),'version_conflict');
reject(fn()=>callMethod('recordState',array_replace($a,['confirmed'=>false])),'confirmation_required');
callMethod('recordState',array_replace($a,['operation'=>'archive']));ok(str_contains($db->writes[count($db->writes)-2][0],'UPDATE spools'));
$e=['source'=>'live-preview-wifi','unverified'=>true,'gross'=>'271.99','tare'=>'193.00','remaining'=>'78.99','capturedAt'=>'2026-01-01T00:00:00.000Z'];
$note=callMethod('registrationEstimate',$e,'193.00',7899,'manual');ok(str_contains($note,'78.99 g'));ok(str_contains($note,'UNVERIFIED'));ok(str_contains($note,'Historical accepted draft'));
foreach([['tare'=>'180.00'],['remaining'=>'78.98'],['gross'=>'78.99']] as $change)reject(fn()=>callMethod('registrationEstimate',array_replace($e,$change),'193.00',7899,'manual'),'estimate_changed');
reject(fn()=>callMethod('registrationEstimate',$e,'193.00',7899,'gross'),'validation_error');
reject(fn()=>callMethod('registrationEstimate',array_replace($e,['unverified'=>false]),'193.00',7899,'manual'),'validation_error');
reject(fn()=>callMethod('registrationEstimate',array_replace($e,['capturedAt'=>'bad']),'193.00',7899,'manual'),'validation_error');
reject(fn()=>$service->mutate(['revision'=>6,'action'=>['type'=>'printer','confirmed'=>true,'printer'=>$p]],'offline-test-key'),'revision_conflict');ok($db->rolledBack);
reject(fn()=>$service->mutate(['revision'=>7,'action'=>['type'=>'printer','confirmed'=>false,'printer'=>$p]],'offline-test-key'),'confirmation_required');ok($db->rolledBack);
$auth=new DLoop\Auth(['allowed_origins'=>['https://staging-fila.dlts.in'],'access_mode'=>'AUTHENTICATED'],static function(){throw new RuntimeException('No DB connection permitted');});
$_SESSION=['csrf'=>'synthetic-csrf'];$_SERVER=['HTTP_ORIGIN'=>'https://staging-fila.dlts.in','HTTP_X_CSRF_TOKEN'=>'synthetic-csrf'];$auth->csrf();ok(true);
reject(fn()=>$auth->requireAdmin(),'unauthenticated');
$_SERVER['HTTP_ORIGIN']='https://fila.dlts.in';reject(fn()=>$auth->csrf(),'csrf_failed');
$_SERVER['HTTP_ORIGIN']='https://staging-fila.dlts.in';$_SERVER['HTTP_X_CSRF_TOKEN']='wrong';reject(fn()=>$auth->csrf(),'csrf_failed');
// Exercise real registration: independent original mass, manual provenance and no measurement insert.
$db->tables['brands']=['id'=>'1','name'=>'Numaker','active'=>1,'default_tare_g'=>'193.00','default_tare_verified'=>0];
$input=['name'=>'Fixture spool','brandId'=>'1','material'=>'PLA','colorName'=>'White','color'=>'#ffffff','spoolType'=>'Unknown','capacity'=>'1000','initial'=>'1000','remaining'=>'78.99','mode'=>'manual','registrationKind'=>'partial','profileId'=>null,'tareOverride'=>null,'location'=>'Shelf','catalogueId'=>null,'estimateCapture'=>$e];
$v=callMethod('spoolValues',$input);ok($v['initial']==='1000.00');ok($v['remaining']==='78.99');ok(!$v['measured']);ok($v['gross']===null);ok($v['provisional']);
$before=count($db->writes);callMethod('register',['confirmed'=>true,'spool'=>$input]);$writes=array_slice($db->writes,$before);$found=false;
foreach($writes as [$sql,$params]){ok(!str_starts_with($sql,'INSERT INTO measurements'));if(str_starts_with($sql,'INSERT INTO spools')){$found=true;ok($params[14]==='1000.00'&&$params[15]==='78.99'&&$params[16]===null&&$params[17]===0);}}
ok($found);
$db->tables['brands']['default_tare_g']='180.00';
$old=['brand_id'=>'1','tare_profile_id'=>null,'tare_default_g'=>'193.00','tare_provisional'=>1,'estimate_note'=>'','catalogue_product_id'=>null];
$existing=$input;unset($existing['estimateCapture']);$v=callMethod('spoolValues',$existing,$old);ok($v['tare']==='193.00');ok($v['remaining']==='78.99');
// Unused deletion succeeds without deleting related records; referenced deletion already rejected above.
$db->dependent=false;$before=count($db->writes);callMethod('recordState',$a);$writes=array_slice($db->writes,$before);ok(str_starts_with($writes[0][0],'DELETE FROM spools WHERE id='));ok(count($writes)===2);
// Existing authenticated/CSRF route boundary is reused, not a new public management endpoint.
$api=file_get_contents(dirname(__DIR__).'/src/Api.php');ok(strpos($api,'$auth->requireAdmin()')<strpos($api,'->mutate('));ok(str_contains($api,'Http::body('));
echo "PASS: $checks offline service assertions: slot preservation, dependency rejection, explicit confirmation, stale versions/revisions, rollback and draft provenance. No real database/migration executed.\n";
