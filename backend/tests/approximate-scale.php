<?php
declare(strict_types=1);
require dirname(__DIR__) . '/src/bootstrap.php';
// No PDO or database: exercise early validation only, before any query/write.
$inventory=(new ReflectionClass(DLoop\Inventory::class))->newInstanceWithoutConstructor();
$method=new ReflectionMethod(DLoop\Inventory::class,'scaleReading');
$cases=[
    [['mode'=>'APPROXIMATE'], 'Approximate readings require explicit acknowledgement.'],
    [['mode'=>'APPROXIMATE','approximateAcknowledged'=>false], 'Approximate readings require explicit acknowledgement.'],
    [['mode'=>'APPROXIMATE','approximateAcknowledged'=>'true'], 'Approximate readings require explicit acknowledgement.'],
    [['mode'=>'STRICT','approximateAcknowledged'=>true], 'Approximate readings require explicit acknowledgement.'],
    [['mode'=>null], 'Approximate readings require explicit acknowledgement.'],
    [['approximateAcknowledged'=>true], 'Approximate readings require explicit acknowledgement.'],
    [['mode'=>'APPROXIMATE','approximateAcknowledged'=>true], 'A stable, calibrated version 1 reading matching the confirmed gross mass is required.'],
];
foreach($cases as [$input,$expected]){
    try{$method->invoke($inventory,$input,'1000.00');throw new RuntimeException('Invalid context accepted');}
    catch(DLoop\HttpError $e){if($e->status!==422||$e->getMessage()!==$expected)throw $e;}
}
// Exercise valid context, freshness and existing eligibility with an empty read
// result. This is a PDO stub, not an integration/database persistence claim.
class EmptyScaleStatement extends PDOStatement {
    public function execute(?array $params=null):bool{return true;}
    public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array{return [];}
}
class EmptyScalePDO extends PDO {
    public function __construct(){}
    public function prepare(string $query,array $options=[]):PDOStatement|false{return new EmptyScaleStatement();}
}
$inventory=new DLoop\Inventory(new EmptyScalePDO());
$valid=['v'=>1,'deviceId'=>'DLOOP-SCALE-01','seq'=>1,'grossG'=>975,'stable'=>true,'calibrated'=>true,
    'receivedAt'=>(new DateTimeImmutable('now',new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z'),
    'connectionId'=>'00000000-0000-4000-8000-000000000001','transport'=>'usb',
    'mode'=>'APPROXIMATE','approximateAcknowledged'=>true];
$accepted=$method->invoke($inventory,$valid,'975.00');
if($accepted!==$valid)throw new RuntimeException('Approximate provenance was altered');
foreach([['stable'=>false],['calibrated'=>false],['grossG'=>1000],['receivedAt'=>'2000-01-01T00:00:00.000Z']] as $patch){
    try{$method->invoke($inventory,array_replace($valid,$patch),'975.00');throw new RuntimeException('Unsafe context accepted');}
    catch(DLoop\HttpError $e){if($e->status!==422)throw $e;}
}
echo "PASS: 12 approximate mode/acknowledgement, provenance, stability, calibration, gross-match and freshness cases. PDO read stub only; no database accessed.\n";
