<?php
declare(strict_types=1);
namespace DLoop;

final class WifiScale
{
 public function __construct(private array $config,private \PDO $db){}
 public static function stagingTimingEnabled(array $config,array $server):bool {
  return ($config['database']['name']??'')==='dltsin_fila_stage'&&
   ($config['allowed_origins']??[])===['https://staging-fila.dlts.in']&&
   ($server['HTTP_HOST']??'')==='staging-fila.dlts.in';
 }
 public function available():bool{
  if(!($this->config['wifi_scale_enabled']??false)||LocalAccess::enabled($this->config))return false;
  return (int)$this->db->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='scale_live_readings'")->fetchColumn()===1;
 }
 public function ingest(array $body,string $authorization,array $server,?int $now=null):array{
  if(!$this->available())throw new HttpError(403,'wifi_disabled','Wi-Fi scale ingestion is not enabled.');
  if(($server['HTTPS']??'')!=='on'&&(int)($server['SERVER_PORT']??0)!==443)throw new HttpError(400,'https_required','HTTPS is required.');
  Validation::keys($body,['bootId','sentAtMs','frame']);
  if(!preg_match('/^Bearer ([a-f0-9]{64})$/D',$authorization,$match))throw new HttpError(401,'device_unauthorized','Device authentication required.');
  $frame=$body['frame']??null;
  if($frame instanceof \stdClass)$frame=(array)$frame;
  if(!is_array($frame)||array_is_list($frame))throw new HttpError(422,'invalid_frame','A v1 frame is required.');
  Validation::keys($frame,['v','deviceId','seq','grossG','stable','calibrated','fault','mode','live','uid']);
  if(($frame['v']??null)!==1||($frame['deviceId']??null)!=='DLOOP-SCALE-01'||!is_int($frame['seq']??null)||$frame['seq']<0||$frame['seq']>4294967295||!is_bool($frame['stable']??null)||!is_bool($frame['calibrated']??null))throw new HttpError(422,'invalid_frame','Invalid v1 identity, sequence or flags.');
  if(isset($frame['uid'])&&(!is_string($frame['uid'])||!preg_match('/^(?:[a-f0-9]{8}|[a-f0-9]{14}|[a-f0-9]{20})$/iD',$frame['uid'])))throw new HttpError(422,'invalid_frame','Invalid UID.');
  if(isset($frame['mode'])&&$frame['mode']!=='APPROXIMATE')throw new HttpError(422,'invalid_frame','Invalid mode.');
  if(isset($frame['fault'])){
   if(!is_string($frame['fault'])||!preg_match('/^[A-Z0-9_]{1,48}$/D',$frame['fault'])||($frame['grossG']??null)!==null||$frame['stable'])throw new HttpError(422,'invalid_frame','Invalid fault frame.');
  }elseif(!is_numeric($frame['grossG']??null)||!is_int($frame['grossG'])&&!is_float($frame['grossG'])||!is_finite((float)$frame['grossG'])||$frame['grossG']<0||$frame['grossG']>100000)throw new HttpError(422,'invalid_frame','Invalid gross mass.');
  if(isset($frame['live'])){
   $p=(array)$frame['live'];Validation::keys($p,['raw','grams','ageMs','calibrated','strictStable','hold','pending','stage','spike']);
   if(count($p)!==9||!is_bool($p['calibrated']??null)||!is_bool($p['strictStable']??null)||!is_bool($p['spike']??null)||!is_int($p['ageMs']??null)||$p['ageMs']<0||$p['ageMs']>4294967295||!is_int($p['hold']??null)||$p['hold']<0||$p['hold']>4||!is_int($p['pending']??null)||$p['pending']<0||$p['pending']>15||!in_array($p['stage']??null,['EMPTY','LOAD','VERIFY','ACCEPT','DONE','STRICT_REQUIRED'],true))throw new HttpError(422,'invalid_preview','Invalid preview flags.');
   foreach(['raw'=>8388600,'grams'=>100000] as $key=>$limit)if(($p[$key]??null)!==null&&((!is_int($p[$key])&&!is_float($p[$key]))||!is_finite((float)$p[$key])||abs($p[$key])>=$limit))throw new HttpError(422,'invalid_preview','Invalid preview mass/counts.');
   if((!$p['calibrated']&&$p['grams']!==null)||($p['calibrated']&&(!$frame['calibrated']||isset($frame['mode'])))||($p['grams']!==null&&$p['raw']===null)||($p['ageMs']>500&&($p['raw']!==null||$p['grams']!==null)))throw new HttpError(422,'invalid_preview','Unsafe preview calibration/freshness.');
  }
  $now??=(int)floor(microtime(true)*1000);$sent=$body['sentAtMs']??null;$boot=$body['bootId']??null;
  if(!is_int($sent)||$sent>$now+1000||$now-$sent>5000||!is_string($boot)||!preg_match('/^[a-f0-9]{32}$/D',$boot))throw new HttpError(422,'stale_upload','Invalid boot ID or upload clock/age.');
  $json=json_encode($frame,JSON_THROW_ON_ERROR);if(strlen($json)>1024)throw new HttpError(413,'frame_too_large','Frame too large.');
  $this->db->beginTransaction();
  try{
   $q=$this->db->prepare('SELECT * FROM scale_devices WHERE device_id=? FOR UPDATE');$q->execute([$frame['deviceId']]);$device=$q->fetch();
   if(!$device||!$device['enabled']||!hash_equals($device['token_hash'],hash('sha256',$match[1])))throw new HttpError(401,'device_unauthorized','Device authentication failed.');
   $q=$this->db->prepare('SELECT last_sequence FROM scale_device_boots WHERE device_id=? AND boot_id=?');$q->execute([$frame['deviceId'],$boot]);$previous=$q->fetchColumn();
   if($previous!==false&&($device['active_boot']!==$boot||$frame['seq']<=(int)$previous))throw new HttpError(409,'duplicate_or_retired','Duplicate/out-of-order or retired boot rejected.');
   if($previous===false){$this->db->prepare('INSERT INTO scale_device_boots(device_id,boot_id,last_sequence) VALUES(?,?,?)')->execute([$frame['deviceId'],$boot,$frame['seq']]);}
   else $this->db->prepare('UPDATE scale_device_boots SET last_sequence=? WHERE device_id=? AND boot_id=?')->execute([$frame['seq'],$frame['deviceId'],$boot]);
   $this->db->prepare('UPDATE scale_devices SET active_boot=? WHERE device_id=?')->execute([$boot,$frame['deviceId']]);
   $this->db->prepare('INSERT INTO scale_live_readings(device_id,boot_id,sequence_number,credential_version,frame_json,received_ms,sent_ms) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE boot_id=VALUES(boot_id),sequence_number=VALUES(sequence_number),credential_version=VALUES(credential_version),frame_json=VALUES(frame_json),received_ms=VALUES(received_ms),sent_ms=VALUES(sent_ms),received_at=CURRENT_TIMESTAMP(6)')->execute([$frame['deviceId'],$boot,$frame['seq'],$device['credential_version'],$json,$now,$sent]);
   $this->db->commit();return ['accepted'=>true,'seq'=>$frame['seq'],'receivedAtMs'=>$now];
  }catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
 }
 public function latest(?int $now=null,?int $requestStartedNs=null,?int $authMs=null):array{
  $lookupStartedNs=hrtime(true);
  if(!$this->available())return ['reading'=>null,'configured'=>false,'online'=>false];
  $row=$this->db->query("SELECT r.* FROM scale_live_readings r JOIN scale_devices d ON d.device_id=r.device_id WHERE d.enabled=1 AND r.credential_version=d.credential_version AND d.active_boot=r.boot_id AND r.device_id='DLOOP-SCALE-01'")->fetch();
  if(!$row)return ['reading'=>null,'configured'=>true,'online'=>false];
  $snapshotNs=hrtime(true); // Before wall-clock age snapshot, never after it.
  $now??=(int)floor(microtime(true)*1000);$age=max(0,$now-(int)$row['received_ms']);$frame=json_decode($row['frame_json'],true,512,JSON_THROW_ON_ERROR);
  $observation=null;
  if(isset($frame['live'])){$p=&$frame['live'];$p['ageMs']=min(4294967295,$p['ageMs']+abs((int)$row['received_ms']-(int)$row['sent_ms'])+$age);
   if($requestStartedNs!==null&&($this->config['database']['name']??'')==='dltsin_fila_stage'&&($this->config['allowed_origins']??[])===['https://staging-fila.dlts.in']){
    $raw=$p['raw']??null;
    $usable=($frame['calibrated']??true)===false&&!isset($frame['mode'])&&($frame['fault']??'')==='CALIBRATION_REQUIRED'&&is_numeric($raw)&&is_finite((float)$raw)&&abs((float)$raw)<8388600;
    $observation=['version'=>1,'verification'=>'UNVERIFIED','seq'=>$frame['seq'],'raw'=>$usable?$raw:null,'sampleAgeMs'=>$p['ageMs'],'sampledAtMs'=>max(1,$now-$p['ageMs']),'usable'=>$usable];
   }
   if($p['ageMs']>500){$p['raw']=null;$p['grams']=null;}}
  $result=['configured'=>true,'online'=>$age<=10000,'reading'=>['frame'=>$frame,'bootId'=>$row['boot_id'],'receivedAtMs'=>(int)$row['received_ms'],'ageMs'=>$age]];
  if($observation!==null)$result['observation']=$observation;
  if($requestStartedNs!==null&&$requestStartedNs>0&&$requestStartedNs<=$snapshotNs){
   $result['timing']=['version'=>1,'preSnapshotMs'=>(int)floor(($snapshotNs-$requestStartedNs)/1000000),
    'authMs'=>max(0,$authMs??0),'lookupMs'=>(int)floor(($snapshotNs-$lookupStartedNs)/1000000)];
  }
  return $result;
 }
}
