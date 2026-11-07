<?php
declare(strict_types=1);
require dirname(__DIR__).'/src/Inventory.php';
$method=new ReflectionMethod(\DLoop\Inventory::class,'savedTare');
foreach ([null,'0.00','200.00'] as $brand) {
    $spool=['tare_override_g'=>null,'tare_default_g'=>'193.00','default_tare_g'=>$brand];
    if($method->invoke(null,$spool)!=='193.00')throw new RuntimeException('Brand change altered saved tare');
    $spool['tare_override_g']='0.00';
    if($method->invoke(null,$spool)!=='0.00')throw new RuntimeException('Zero override lost');
}
if($method->invoke(null,['tare_override_g'=>null,'tare_default_g'=>null,'default_tare_g'=>'200.00'])!==null)throw new RuntimeException('Unknown snapshot silently adopted brand');
echo "PASS: backend saved tare survives brand change/removal, zero override and unknown snapshot. No database used.\n";
