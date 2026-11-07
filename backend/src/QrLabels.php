<?php
declare(strict_types=1);
namespace DLoop;
final class QrLabels
{
 public function __construct(private \PDO $db,private string $actor=''){}
 public function available():bool{return (int)$this->db->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='qr_labels'")->fetchColumn()===1;}
 private function ready():void{if(!$this->available())throw new HttpError(409,'qr_schema_required','QR registry migration is pending.');}
 private function id(mixed $id):string{if(!is_string($id)||!preg_match('/^[a-f0-9]{32}$/D',$id))throw new HttpError(422,'invalid_qr','Malformed QR identifier.');return $id;}
 public function batches():array{$this->ready();return $this->db->query("SELECT b.batch_id AS id,b.label_count AS count,b.created_at AS createdAt,b.layout_version AS layoutVersion,SUM(l.state='UNUSED') AS unused,SUM(l.state='ASSIGNED') AS assigned,SUM(l.state='RETIRED') AS retired FROM qr_batches b JOIN qr_labels l ON l.batch_id=b.batch_id GROUP BY b.batch_id ORDER BY b.created_at DESC LIMIT 100")->fetchAll();}
 public function batch(string $id):array{
  $this->ready();$q=$this->db->prepare('SELECT batch_id AS id,label_count AS count,created_at AS createdAt,layout_version AS layoutVersion FROM qr_batches WHERE batch_id=?');$q->execute([$this->id($id)]);$batch=$q->fetch();if(!$batch)throw new HttpError(404,'unknown_batch','QR batch not found.');
  $q=$this->db->prepare('SELECT label_id AS id,ordinal,state,spool_id AS spoolId FROM qr_labels WHERE batch_id=? ORDER BY ordinal');$q->execute([$id]);$batch['labels']=$q->fetchAll();return $batch;
 }
 public function generate(array $body):array{
  $this->ready();Validation::keys($body,['count','requestKey','confirmed']);
  if(($body['confirmed']??false)!==true||!is_int($body['count']??null)||!in_array($body['count'],[50,100,250,500],true)||!is_string($body['requestKey']??null)||!preg_match('/^[a-zA-Z0-9_-]{8,100}$/D',$body['requestKey']))throw new HttpError(422,'validation_error','Confirm a supported batch size and retry key.');
  $this->db->beginTransaction();
  try{
   // Serialize batch requests for this actor; identical retries cannot create a second batch.
   $q=$this->db->prepare('SELECT id FROM users WHERE id=? AND active=1 FOR UPDATE');$q->execute([$this->actor]);if(!$q->fetchColumn())throw new HttpError(403,'unauthorized','Active operator required.');
   $q=$this->db->prepare('SELECT batch_id,label_count FROM qr_batches WHERE created_by=? AND request_key=?');$q->execute([$this->actor,$body['requestKey']]);$prior=$q->fetch();
   if($prior){if((int)$prior['label_count']!==$body['count'])throw new HttpError(409,'idempotency_conflict','This batch retry key used a different count.');$id=$prior['batch_id'];}
   else{
    $id=bin2hex(random_bytes(16));$this->db->prepare('INSERT INTO qr_batches(batch_id,request_key,label_count,created_by) VALUES(?,?,?,?)')->execute([$id,$body['requestKey'],$body['count'],$this->actor]);
    $q=$this->db->prepare('INSERT INTO qr_labels(label_id,batch_id,ordinal) VALUES(?,?,?)');for($n=1;$n<=$body['count'];$n++)$q->execute([bin2hex(random_bytes(16)),$id,$n]);
   }
   $result=$this->batch($id);$this->db->commit();return $result;
  }catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
 }
 public function resolve(string $id):array{
  $this->ready();$q=$this->db->prepare('SELECT l.label_id AS id,l.state,l.spool_id AS spoolId,s.code,s.status AS spoolStatus FROM qr_labels l LEFT JOIN spools s ON s.id=l.spool_id WHERE l.label_id=?');$q->execute([$this->id($id)]);$label=$q->fetch();if(!$label)throw new HttpError(404,'unknown_qr','Unknown QR identifier.');if($label['state']==='RETIRED')throw new HttpError(410,'retired_qr','QR identifier is retired and cannot be reused.');if($label['state']==='ASSIGNED'&&$label['spoolStatus']!=='active')throw new HttpError(409,'archived_spool','The assigned spool is archived.');return $label;
 }
 // Caller owns the inventory transaction, revision lock and explicit confirmation.
 public function assign(mixed $label,string $spool):void{
  $this->ready();if(!$this->db->inTransaction())throw new \RuntimeException('Inventory transaction required.');
  $q=$this->db->prepare('SELECT state FROM qr_labels WHERE label_id=? FOR UPDATE');$q->execute([$this->id($label)]);$state=$q->fetchColumn();if($state===false)throw new HttpError(404,'unknown_qr','Unknown QR identifier.');if($state!=='UNUSED')throw new HttpError(409,'qr_not_unused','QR is already assigned or retired.');
  $this->db->prepare("UPDATE qr_labels SET state='ASSIGNED',spool_id=?,assigned_at=CURRENT_TIMESTAMP(6) WHERE label_id=?")->execute([$spool,$label]);
  $this->event($label,'ASSIGNED');
 }
 public function retire(string $spool):string{
  $this->ready();if(!$this->db->inTransaction())throw new \RuntimeException('Inventory transaction required.');
  $q=$this->db->prepare("SELECT label_id FROM qr_labels WHERE active_spool_id=? FOR UPDATE");$q->execute([$spool]);$old=$q->fetchColumn();if(!$old)throw new HttpError(409,'no_active_qr','This spool has no active managed QR.');
  $this->db->prepare("UPDATE qr_labels SET state='RETIRED',retired_at=CURRENT_TIMESTAMP(6) WHERE label_id=?")->execute([$old]);$this->event($old,'RETIRED');return $old;
 }
 private function event(string $id,string $type):void{$this->db->prepare('INSERT INTO qr_label_events(label_id,actor_id,event_type) VALUES(?,?,?)')->execute([$id,$this->actor,$type]);}
}
