<?php
declare(strict_types=1);
// Reuse the established no-connection PDO double and safety regression suite.
require __DIR__.'/mobile-management-offline.php';
$db->management=false;$db->occupied=false;$db->dependent=false;
$id='00000000-0000-4000-8000-000000000002';
$product=['id'=>$id,'brand_id'=>'1','tare_profile_id'=>null,'name'=>'Original','material'=>'PLA','color_name'=>'White','color_hex'=>'#ffffff','diameter_mm'=>'1.75','nozzle_c'=>210,'bed_c'=>60,'price'=>'500.00','updated_at'=>'2026-01-01 00:00:00.000000'];
$db->tables['catalogue_products']=$product;$db->tables['brands']=['id'=>'1','name'=>'Numaker','active'=>1,'default_tare_g'=>'193.00','default_tare_verified'=>0];
$token=callMethod('productEditToken',$product);
$f=['id'=>$id,'version'=>1,'editToken'=>$token,'name'=>'Updated','brandId'=>'1','profileId'=>null,'material'=>'PETG','colorName'=>'Blue','color'=>'#0000ff','diameter'=>'1.75','temperature'=>'240','bed'=>'80','price'=>'650.00','active'=>true];
$before=count($db->writes);callMethod('catalogue',$f);$writes=array_slice($db->writes,$before);ok(count($writes)===2);ok(str_contains($writes[0][0],'UPDATE catalogue_products'));ok(!str_contains($writes[0][0],'version='));ok(!str_contains($writes[0][0],'active='));ok($writes[0][1][2]==='Updated');
foreach($writes as [$sql,$params])ok(!preg_match('/(?:UPDATE|DELETE FROM) (?:spools|printer_slots|qr_labels|measurements|scale_live_readings)/',$sql));
$db->tables['catalogue_products']['price']='501.00';reject(fn()=>callMethod('catalogue',$f),'version_conflict');
$db->tables['catalogue_products']=$product;$missing=$f;unset($missing['editToken']);reject(fn()=>callMethod('catalogue',$missing),'version_conflict');
reject(fn()=>callMethod('catalogue',array_replace($f,['temperature'=>'501'])),'validation_error');
reject(fn()=>callMethod('catalogue',array_replace($f,['active'=>false])),'confirmation_required');
reject(fn()=>callMethod('recordState',['entity'=>'product','id'=>$id,'version'=>1,'operation'=>'archive','confirmed'=>true]),'schema_required');
// Archive/restore spools on the old schema without touching balance, identity or assignments.
$spoolId='00000000-0000-4000-8000-000000000003';$db->tables['spools']=array_replace($db->record,['id'=>$spoolId]);
$a=['entity'=>'spool','id'=>$spoolId,'version'=>2,'operation'=>'archive','confirmed'=>true];$before=count($db->writes);callMethod('recordState',$a);$writes=array_slice($db->writes,$before);ok($writes[0][1]===['archived',$spoolId]);ok(!str_contains($writes[0][0],'remaining_g'));ok(!str_contains($writes[0][0],'measured'));callMethod('recordState',array_replace($a,['operation'=>'restore']));
$db->occupied=true;reject(fn()=>callMethod('recordState',$a),'occupied_slots');$db->occupied=false;
reject(fn()=>callMethod('recordState',array_replace($a,['version'=>1])),'version_conflict');
// Metadata-only spool edit preserves saved measurement instead of inserting a new one.
$spool=['id'=>$spoolId,'version'=>2,'brand_id'=>'1','catalogue_product_id'=>null,'tare_profile_id'=>null,'tare_override_g'=>null,'tare_default_g'=>'193.00','tare_provisional'=>1,'estimate_note'=>'','name'=>'Spool','material'=>'PLA','color_name'=>'White','color_hex'=>'#ffffff','spool_type'=>'Unknown','registration_kind'=>'partial','nominal_capacity_g'=>'1000.00','initial_filament_g'=>'1000.00','remaining_g'=>'78.99','last_gross_g'=>'271.99','measured'=>1,'location'=>'Shelf','status'=>'active'];
$db->tables['spools']=$spool;$draft=$input;unset($draft['estimateCapture']);$draft['name']='Renamed spool';$draft['estimateNote']='';
$before=count($db->writes);callMethod('update',['type'=>'update','id'=>$spoolId,'version'=>2,'confirmed'=>true,'spool'=>$draft]);$writes=array_slice($db->writes,$before);
ok($writes[0][1][13]==='78.99');ok($writes[0][1][14]==='271.99');ok($writes[0][1][15]===1);foreach($writes as [$sql,$params])ok(!str_starts_with($sql,'INSERT INTO measurements'));
// Modern schema remains version-protected and uses the modern columns.
$db->management=true;$db->tables['catalogue_products']=array_replace($product,['active'=>1,'version'=>2]);reject(fn()=>callMethod('catalogue',$f),'version_conflict');$before=count($db->writes);callMethod('catalogue',array_replace($f,['version'=>2]));ok(str_contains($db->writes[$before][0],'version=version+1'));
echo "PASS: catalogue/spool hotfix on 0000-0007 and modern schema; $checks total assertions. No database, migration or scale API accessed.\n";
