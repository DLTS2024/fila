<?php
declare(strict_types=1);

namespace DLoop;

final class Inventory
{
    public function __construct(private \PDO $db, private string $actor = '') {}

    private function rows(string $sql, array $params = []): array
    {
        $q = $this->db->prepare($sql); $q->execute($params); return $q->fetchAll();
    }

    private function execute(string $sql, array $params = []): void
    {
        $this->db->prepare($sql)->execute($params);
    }

    private static function uuid(): string
    {
        $bytes = random_bytes(16); $bytes[6] = chr((ord($bytes[6]) & 15) | 64); $bytes[8] = chr((ord($bytes[8]) & 63) | 128);
        $h = bin2hex($bytes); return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20);
    }

    private static function object(mixed $value): array
    {
        if ($value instanceof \stdClass) { return (array) $value; }
        if (is_array($value) && !array_is_list($value)) { return $value; }
        throw new HttpError(422, 'validation_error', 'An object is required.');
    }

    private static function text(mixed $value, int $max = 150, bool $required = true): string
    {
        $s = Validation::text($value, $max);
        if ($required && $s === '') { throw new HttpError(422, 'validation_error', 'Required text cannot be blank.'); }
        return $s;
    }

    private function row(string $table, mixed $id, bool $active = false): array
    {
        $numeric = in_array($table, ['brands','tare_profiles','printers'], true);
        $valid = $numeric
            ? ((is_string($id) || is_int($id)) && preg_match('/^[1-9][0-9]{0,8}$/D', (string) $id))
            : (is_string($id) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iD', $id));
        if (!$valid) { throw new HttpError(422, 'validation_error', 'Invalid record ID.'); }
        // Table names are only internal constants supplied by this service.
        $rows = $this->rows('SELECT * FROM ' . $table . ' WHERE id = ? FOR UPDATE', [$id]);
        if (!$rows) { throw new HttpError(404, 'not_found', 'Record not found.'); }
        if ($active && (int) $rows[0]['active'] !== 1) { throw new HttpError(422, 'inactive_brand', 'Choose an active brand or profile.'); }
        return $rows[0];
    }

    private function spool(mixed $id, array $action, bool $archived = false): array
    {
        $row = $this->row('spools', $id);
        $versions = isset($action['versions']) ? self::object($action['versions']) : [];
        if (Validation::version($versions[$row['id']] ?? $action['version'] ?? null) !== (int) $row['version']) {
            throw new HttpError(409, 'version_conflict', 'This spool changed. Reload and review the new balance before saving.');
        }
        if (!$archived && $row['status'] !== 'active') { throw new HttpError(422, 'archived_spool', 'This spool is archived.'); }
        return $row;
    }

    private static function confirmed(array $action): void
    {
        if (($action['confirmed'] ?? null) !== true) { throw new HttpError(422, 'confirmation_required', 'Review and explicitly confirm the proposed inventory change.'); }
    }

    private static function canonical(mixed $value): mixed
    {
        if ($value instanceof \stdClass) { $value = (array) $value; }
        if (is_array($value)) { if (!array_is_list($value)) { ksort($value); } return array_map([self::class, 'canonical'], $value); }
        return $value;
    }

    public function mutate(array $body, string $key): array
    {
        Validation::keys($body, ['revision', 'action']);
        if (!is_int($body['revision'] ?? null) || $body['revision'] < 0 || !preg_match('/^[A-Za-z0-9_-]{8,100}$/D', $key)) {
            throw new HttpError(422, 'validation_error', 'An inventory revision and a valid Idempotency-Key are required.');
        }
        $action = self::object($body['action'] ?? null);
        $hash = hash('sha256', json_encode(self::canonical($body), JSON_THROW_ON_ERROR));
        $this->db->beginTransaction();
        try {
            $revision = (int) $this->rows('SELECT revision FROM studio_revision WHERE id = 1 FOR UPDATE')[0]['revision'];
            $previous = $this->rows('SELECT request_hash, response_json FROM idempotency_keys WHERE user_id = ? AND request_key = ? FOR UPDATE', [$this->actor, $key]);
            if ($previous) {
                if (!hash_equals($previous[0]['request_hash'], $hash)) { throw new HttpError(409, 'idempotency_conflict', 'This retry key was used for a different operation.'); }
                // Replays return current inventory without reapplying the operation.
                // Do not retain an ever-growing full inventory copy for every key.
                $response = $this->snapshot();
                $this->db->commit(); return $response;
            }
            if ($body['revision'] !== $revision) { throw new HttpError(409, 'revision_conflict', 'Inventory changed in another session. Reload and review before retrying.'); }
            $this->apply($action);
            $this->execute('UPDATE studio_revision SET revision = revision + 1 WHERE id = 1');
            $response = $this->snapshot();
            $this->execute("INSERT INTO idempotency_keys (user_id, request_key, route, request_hash, response_status, response_json, expires_at) VALUES (?, ?, '/inventory', ?, 200, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 1 DAY))", [$this->actor, $key, $hash, json_encode(['revision' => $response['revision']], JSON_THROW_ON_ERROR)]);
            $this->db->commit(); return $response;
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) { $this->db->rollBack(); }
            if ($e instanceof \PDOException && (int) ($e->errorInfo[1] ?? 0) === 1451) { throw new HttpError(409,'dependent_record','Record has dependencies; archive it instead.'); }
            if ($e instanceof \PDOException && (int) ($e->errorInfo[1] ?? 0) === 1062) { throw new HttpError(409, 'duplicate_record', 'A printer, product, brand, profile, tag or spool code identity already exists.'); }
            throw $e;
        }
    }

    private function apply(array $a): void
    {
        $type = $a['type'] ?? '';
        $allowed = match ($type) {
            'printer'=>['printer','confirmed'], 'record-state'=>['entity','id','version','operation','confirmed'],
            'brand' => ['brand','confirmed'], 'profile' => ['profile','confirmed'], 'add' => ['spool', 'confirmed','qrLabelId'],
            'update' => ['id', 'spool', 'confirmed', 'version'],
            'weigh' => ['id', 'gross', 'tare', 'confirmed', 'version', 'reading'],
            'manual-estimate'=>['id','version','confirmed','gross','tare','capturedAt','source'],
            'qr-bind'=>['id','version','confirmed','qrLabelId','replace'], 'qr-retire'=>['id','version','confirmed'],
            'print' => ['name', 'printer', 'note', 'lines', 'status', 'confirmed'],
            'assign' => ['slot', 'id', 'confirmed'], 'undo' => ['id', 'confirmed'],
            'catalogue' => ['filament'], 'link' => ['id', 'uid', 'confirmed'], 'tag-url'=>['id','version','confirmed','replace'], 'tag-unlink'=>['id','version','confirmed'],
            default => throw new HttpError(422, 'unknown_action', 'Unsupported inventory action.'),
        };
        Validation::keys($a, array_merge(['type', 'versions'], $allowed));
        match ($type) {
            'printer'=>$this->printer($a), 'record-state'=>$this->recordState($a),
            'brand' => $this->brand(self::object($a['brand'] ?? null),($a['confirmed']??false)===true),
            'profile' => $this->profile(self::object($a['profile'] ?? null),($a['confirmed']??false)===true),
            'add' => $this->register($a), 'update', 'weigh' => $this->update($a),
            'manual-estimate'=>$this->manualEstimate($a),
            'qr-bind','qr-retire'=>$this->managedQr($a),
            'print' => $this->printJob($a), 'assign' => $this->assign($a),
            'undo' => $this->undo($a), 'catalogue' => $this->catalogue(self::object($a['filament'] ?? null)),
            'link' => $this->link($a), 'tag-url'=>$this->tagUrl($a), 'tag-unlink'=>$this->unlinkTag($a),
        };
    }

    private function event(string $type, string $name, array $changes = [], string $note = '', array $details = [], ?string $undoOf = null): string
    {
        $id = self::uuid();
        $this->execute('INSERT INTO activity_events (id, actor_id, event_type, name, note, details_json, undo_of) VALUES (?, ?, ?, ?, ?, ?, ?)', [$id, $this->actor, $type, $name, $note, json_encode($details, JSON_THROW_ON_ERROR), $undoOf]);
        foreach ($changes as $c) {
            $this->execute('INSERT INTO activity_changes (event_id, spool_id, before_g, after_g, measured_before, measured_after) VALUES (?, ?, ?, ?, ?, ?)', [$id, $c['id'], $c['before'], $c['after'], $c['measuredBefore'] ? 1 : 0, $c['measuredAfter'] ? 1 : 0]);
        }
        return $id;
    }

    private static function change(array $p, int $after, bool $measured): array
    {
        return ['id' => $p['id'], 'before' => $p['remaining_g'], 'after' => Validation::decimal($after), 'measuredBefore' => (bool) $p['measured'], 'measuredAfter' => $measured];
    }

    private function managementAvailable(): bool
    {
        return (int)$this->rows("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='printers' AND column_name='colour_mode'")[0]['n']===1;
    }

    private function catalogueLifecycleAvailable(): bool
    {
        return (int)$this->rows("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='catalogue_products' AND column_name IN ('active','version')")[0]['n']===2;
    }

    private static function productEditToken(array $p): string
    {
        // Stable across PDO numeric representations and joined snapshot columns.
        $fields=[];
        foreach(['id','brand_id','tare_profile_id','name','material','color_name','color_hex','diameter_mm','nozzle_c','bed_c','price','updated_at'] as $key)$fields[$key]=isset($p[$key])?(string)$p[$key]:null;
        return hash('sha256',json_encode($fields,JSON_THROW_ON_ERROR));
    }

    private function printerSnapshot(): array
    {
        return array_map(static function($p){$prefix=$p['name']==='Anycubic Kobra 3'?'kobra':($p['name']==='Creality SPARKX i7'?'sparkx':'printer-'.$p['id']);return ['id'=>(string)$p['id'],'name'=>$p['name'],'brand'=>$p['brand']??'','model'=>$p['model']??'','nickname'=>$p['nickname']??'','mode'=>$p['colour_mode']??((int)$p['slot_count']>1?'multi':'single'),'slotCount'=>(int)$p['slot_count'],'active'=>(bool)($p['active']??true),'version'=>(int)($p['version']??1),'slotPrefix'=>$prefix];},$this->rows('SELECT p.*, (SELECT COUNT(*) FROM printer_slots s WHERE s.printer_id=p.id) AS slot_count FROM printers p ORDER BY p.id'));
    }

    private function printer(array $a): void
    {
        self::confirmed($a);
        if(!$this->managementAvailable())throw new HttpError(422,'schema_required','Printer management migration required.');
        $p=self::object($a['printer']??null);Validation::keys($p,['id','version','brand','model','nickname','mode','slotCount','active']);
        $brand=self::text($p['brand']??null,100);$model=self::text($p['model']??null,100);$nickname=self::text($p['nickname']??'',100,false);
        $count=$p['slotCount']??null;
        if(!is_int($count)||$count<1||$count>32||!in_array($p['mode']??'', ['single','multi'],true)||($p['mode']==='single'&&$count!==1)||!is_bool($p['active']??null))throw new HttpError(422,'validation_error','Use 1-32 slots; single-colour printers require one slot.');
        $old=isset($p['id'])?$this->row('printers',$p['id']):null;
        if($old&&Validation::version($p['version']??null)!==(int)$old['version'])throw new HttpError(409,'version_conflict','Printer changed. Reload.');
        // Keep the legacy name stable: existing slot keys and historical print names retain identity.
        $name=$old['name']??($nickname!==''?$nickname:$brand.' '.$model);
        if($nickname!==''&&$this->rows('SELECT id FROM printers WHERE nickname=? AND id<>?',[$nickname,$old['id']??0]))throw new HttpError(409,'duplicate_record','Printer nickname already exists.');
        if($old){
            $occupied=$this->rows('SELECT id FROM printer_slots WHERE printer_id=? AND spool_id IS NOT NULL AND (slot_number>? OR ?=0)',[$old['id'],$count,(int)$p['active']]);
            if($occupied)throw new HttpError(409,'occupied_slots','Unload occupied slots explicitly before shrinking or archiving.');
            $this->execute('UPDATE printers SET brand=?,model=?,nickname=?,colour_mode=?,active=?,version=version+1 WHERE id=?',[$brand,$model,$nickname,$p['mode'],(int)$p['active'],$old['id']]);$id=$old['id'];
            $this->execute('DELETE FROM printer_slots WHERE printer_id=? AND slot_number>? AND spool_id IS NULL',[$id,$count]);
        }else{
            $this->execute('INSERT INTO printers (name,brand,model,nickname,colour_mode,active) VALUES (?,?,?,?,?,?)',[$name,$brand,$model,$nickname,$p['mode'],(int)$p['active']]);$id=$this->db->lastInsertId();
        }
        for($n=1;$n<=$count;$n++)if(!$this->rows('SELECT id FROM printer_slots WHERE printer_id=? AND slot_number=?',[$id,$n]))$this->execute('INSERT INTO printer_slots (printer_id,slot_number) VALUES (?,?)',[$id,$n]);
        $this->event('printer',$name,[],'Printer configuration explicitly confirmed',['printerId'=>(string)$id,'slots'=>$count,'active'=>$p['active']]);
    }

    private function recordState(array $a): void
    {
        self::confirmed($a);
        $entity=$a['entity']??'';$tables=['spool'=>'spools','brand'=>'brands','profile'=>'tare_profiles','product'=>'catalogue_products'];
        if(!isset($tables[$entity])||!in_array($a['operation']??'', ['archive','restore','delete'],true))throw new HttpError(422,'validation_error','Invalid lifecycle operation.');
        if($entity==='product'&&!$this->catalogueLifecycleAvailable())throw new HttpError(422,'schema_required','Product archive/restore requires migration 0008; product editing does not.');
        $table=$tables[$entity];$old=$this->row($table,$a['id']??null);
        if(Validation::version($a['version']??null)!==(int)$old['version'])throw new HttpError(409,'version_conflict','Record changed. Reload.');
        $name=$old['name']??$old['spool_type'];
        if($a['operation']==='delete'){
            // Discover all schema FK dependents, including future migrations. Never cascade.
            $refs=$this->rows("SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.key_column_usage WHERE referenced_table_schema=DATABASE() AND referenced_table_name=? AND referenced_column_name='id'",[$table]);
            foreach($refs as $ref){if(!preg_match('/^[a-z0-9_]+$/D',$ref['TABLE_NAME'])||!preg_match('/^[a-z0-9_]+$/D',$ref['COLUMN_NAME']))throw new HttpError(409,'dependent_record','Unknown dependency.');if($this->rows('SELECT 1 FROM `'.$ref['TABLE_NAME'].'` WHERE `'.$ref['COLUMN_NAME'].'`=? LIMIT 1',[$old['id']]))throw new HttpError(409,'dependent_record','Record has dependencies; archive it instead.');}
            if($entity==='spool'&&(!empty($old['tag_token'])||$this->rows("SELECT id FROM activity_events WHERE JSON_UNQUOTE(JSON_EXTRACT(details_json,'$.spoolId'))=? LIMIT 1",[$old['id']])))throw new HttpError(409,'dependent_record','Spool identity/history must be preserved.');
            $this->execute('DELETE FROM '.$table.' WHERE id=?',[$old['id']]);
        }else{
            if($entity==='spool'&&$a['operation']==='archive'&&$this->rows('SELECT id FROM printer_slots WHERE spool_id=?',[$old['id']]))throw new HttpError(409,'occupied_slots','Remove this spool from its printer first.');
            $column=$entity==='spool'?'status':'active';$value=$entity==='spool'?($a['operation']==='archive'?'archived':'active'):($a['operation']==='archive'?0:1);
            $this->execute('UPDATE '.$table.' SET '.$column.'=?,version=version+1 WHERE id=?',[$value,$old['id']]);
        }
        $this->event('lifecycle',$name,[],ucfirst($a['operation']).' explicitly confirmed',['entity'=>$entity,'recordId'=>(string)$old['id']]);
    }

    private function brandTaresAvailable(): bool
    {
        return (int)$this->rows("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='brands' AND column_name='default_tare_g'")[0]['n'] === 1;
    }

    private function brand(array $b, bool $confirmed=false): void
    {
        Validation::keys($b, ['id', 'version', 'name', 'active', 'defaultTare', 'defaultTareVerified']);
        $customTare=array_key_exists('defaultTare',$b);
        if($customTare&&!$this->brandTaresAvailable())throw new HttpError(422,'schema_required','Brand tare migration is required before configuring defaults.');
        $defaultTare=$customTare&&$b['defaultTare']!==null&&$b['defaultTare']!==''?Validation::decimal(Validation::mass($b['defaultTare'])):null;
        $tareVerified=$b['defaultTareVerified']??false;
        if(!is_bool($tareVerified)||($tareVerified&&$defaultTare===null))throw new HttpError(422,'validation_error','A measured tare is required to mark a brand default verified.');
        $name = self::text($b['name'] ?? null);
        if (!is_bool($b['active'] ?? null)) { throw new HttpError(422, 'validation_error', 'Brand active must be boolean.'); }
        if (isset($b['id'])) {
            $old = $this->row('brands', $b['id']);
            if((bool)$old['active']!==$b['active']&&!$confirmed)throw new HttpError(422,'confirmation_required','Confirm archive or restore explicitly.');
            if (Validation::version($b['version'] ?? null) !== (int) $old['version']) { throw new HttpError(409, 'version_conflict', 'Brand changed. Reload before editing.'); }
            $this->execute('UPDATE brands SET name = ?, active = ?, version = version + 1 WHERE id = ?', [$name, (int) $b['active'], $b['id']]);
        } else {
            $this->execute('INSERT INTO brands (name, active) VALUES (?, ?)', [$name, (int) $b['active']]);
        }
        if($customTare){$brandId=isset($b['id'])?$b['id']:$this->db->lastInsertId();$this->execute('UPDATE brands SET default_tare_g=?, default_tare_verified=? WHERE id=?',[$defaultTare,(int)$tareVerified,$brandId]);}
        $this->event('brand', $name, [], $b['active'] ? 'Brand saved' : 'Brand deactivated');
    }

    private function profile(array $p, bool $confirmed=false): void
    {
        Validation::keys($p, ['id', 'version', 'brandId', 'spoolType', 'capacity', 'tare', 'verified', 'active', 'notes']);
        $this->row('brands', $p['brandId'] ?? null, !isset($p['id']));
        $type = self::text($p['spoolType'] ?? null, 100);
        $capacity = Validation::mass($p['capacity'] ?? null); $tare = Validation::mass($p['tare'] ?? null);
        if ($capacity === 0 || !is_bool($p['verified'] ?? null) || !is_bool($p['active'] ?? null)) { throw new HttpError(422, 'validation_error', 'Check profile capacity and verification flags.'); }
        $values = [$p['brandId'], $type, Validation::decimal($capacity), Validation::decimal($tare), $p['verified'] ? gmdate('Y-m-d H:i:s') : null, (int) $p['active'], self::text($p['notes'] ?? '', 500, false)];
        if (isset($p['id'])) {
            $old = $this->row('tare_profiles', $p['id']);
            if((bool)$old['active']!==$p['active']&&!$confirmed)throw new HttpError(422,'confirmation_required','Confirm archive or restore explicitly.');
            if ((string) $old['brand_id'] !== (string) $p['brandId']) { throw new HttpError(422, 'validation_error', 'A profile cannot be moved to a different brand. Create a new profile instead.'); }
            if (Validation::version($p['version'] ?? null) !== (int) $old['version']) { throw new HttpError(409, 'version_conflict', 'Profile changed. Reload before editing.'); }
            $this->execute('UPDATE tare_profiles SET brand_id = ?, spool_type = ?, nominal_capacity_g = ?, empty_mass_g = ?, verified_at = ?, active = ?, notes = ?, version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?', [...$values, $p['id']]);
        } else {
            $this->execute('INSERT INTO tare_profiles (brand_id, spool_type, nominal_capacity_g, empty_mass_g, verified_at, active, notes) VALUES (?, ?, ?, ?, ?, ?, ?)', $values);
        }
        $this->event('profile', $type, [], 'Tare profile saved. Existing physical spools and balances are unchanged.');
    }

    private function spoolValues(array $p, ?array $old = null): array
    {
        Validation::keys($p, ['name', 'brandId', 'material', 'colorName', 'color', 'spoolType', 'capacity', 'initial', 'remaining', 'gross', 'mode', 'registrationKind', 'profileId', 'tareOverride', 'location', 'catalogueId', 'status', 'refreshProfile', 'tareOverrideVerified', 'estimateNote','estimateCapture']);
        if (isset($p['refreshProfile']) && !is_bool($p['refreshProfile'])) { throw new HttpError(422, 'validation_error', 'Profile adoption must be explicitly boolean.'); }
        $brand = $this->row('brands', $p['brandId'] ?? null, !$old || (string) $old['brand_id'] !== (string) ($p['brandId'] ?? ''));
        $profileId = $p['profileId'] ?? null; $default = null; $provisional=false;
        if ($profileId !== null && $profileId !== '') {
            $profile = $this->row('tare_profiles', $profileId, !$old || (string) $old['tare_profile_id'] !== (string) $profileId);
            if ((string) $profile['brand_id'] !== (string) $brand['id']) { throw new HttpError(422, 'validation_error', 'The tare profile belongs to a different brand.'); }
            if ((!$old || (string) $old['tare_profile_id'] !== (string) $profileId || ($p['refreshProfile'] ?? false))
                && (self::text($p['spoolType'] ?? null, 100) !== $profile['spool_type'] || Validation::mass($p['capacity'] ?? null) !== Validation::mass($profile['nominal_capacity_g']))) {
                throw new HttpError(422, 'profile_mismatch', 'The selected profile must match the physical spool type and label capacity.');
            }
            if ($old && (string) $old['tare_profile_id'] === (string) $profileId && !($p['refreshProfile'] ?? false)) {
                $default = $old['tare_default_g'];$provisional=(bool)($old['tare_provisional']??false);
            } else { $default = $profile['empty_mass_g'];$provisional=$profile['verified_at']===null; }
        } else { $profileId = null; }
        if($profileId===null){
            if($old&&(string)$old['brand_id']===(string)$brand['id']&&!($p['refreshProfile']??false)){ $default=$old['tare_default_g'];$provisional=(bool)($old['tare_provisional']??false); }
            elseif(($brand['default_tare_g']??null)!==null){$default=$brand['default_tare_g'];$provisional=!(bool)$brand['default_tare_verified'];}
        }
        if(isset($p['tareOverrideVerified'])&&!is_bool($p['tareOverrideVerified']))throw new HttpError(422,'validation_error','Tare override verification must be explicit boolean.');
        $override = ($p['tareOverride'] ?? null) === null ? null : Validation::decimal(Validation::mass($p['tareOverride']));
        if($override!==null)$provisional=!($p['tareOverrideVerified']??!($old['tare_provisional']??false));
        $effective = $override ?? $default;
        if ($effective === null) { throw new HttpError(422, 'unknown_tare', 'Tare required: configure this brand or provide a physical spool override.'); }
        $capacity = Validation::mass($p['capacity'] ?? null); $initial = Validation::mass($p['initial'] ?? null);
        if ($capacity === 0) { throw new HttpError(422, 'validation_error', 'Nominal capacity must be positive.'); }
        $mode = $p['mode'] ?? '';
        if (!in_array($mode, ['manual', 'gross'], true)) { throw new HttpError(422, 'validation_error', 'Choose manual remaining mass or gross measurement.'); }
        if($provisional&&$mode==='gross')throw new HttpError(422,'unverified_tare','Provisional tare permits a manual unverified estimate only, not a verified measurement.');
        $gross = $mode === 'gross' ? Validation::mass($p['gross'] ?? null) : null;
        $remaining = $mode === 'gross' ? $gross - Validation::mass($effective) : Validation::mass($p['remaining'] ?? null);
        if ($remaining < 0) { throw new HttpError(422, 'invalid_mass', 'Gross weight must be at least the empty spool tare.'); }
        if (!$old && $remaining > $initial) { throw new HttpError(422, 'invalid_mass', 'Remaining cannot exceed the registered starting mass.'); }
        if (!in_array($p['registrationKind'] ?? '', ['sealed', 'partial'], true)) { throw new HttpError(422, 'validation_error', 'Choose sealed or partially used registration.'); }
        $status = $p['status'] ?? 'active';
        if (!in_array($status, ['active', 'archived'], true)) { throw new HttpError(422, 'validation_error', 'Invalid spool status.'); }
        $catalogue = ($p['catalogueId'] ?? null) ?: null;
        if ($catalogue !== null && ((string) ($product=$this->row('catalogue_products', $catalogue))['brand_id'] !== (string) $brand['id'] || (($product['active']??1)==0 && (!$old || $old['catalogue_product_id']!==$catalogue)))) { throw new HttpError(422, 'validation_error', 'Catalogue product belongs to a different brand.'); }
        if(isset($p['estimateCapture'])){
            if($old)throw new HttpError(422,'validation_error','Use the existing manual estimate confirmation flow for saved spools.');
            $capture=self::object($p['estimateCapture']);
            if($remaining>$capacity)throw new HttpError(422,'invalid_mass','Estimated remaining exceeds nominal capacity.');
            $note=self::registrationEstimate($capture,$effective,$remaining,$mode);
            $p['estimateNote']=$note;
        }
        $color = $p['color'] ?? '';
        if (!is_string($color) || !preg_match('/^#[0-9a-f]{6}$/iD', $color)) { throw new HttpError(422, 'validation_error', 'Choose a valid hex colour.'); }
        return ['provisional'=>$provisional,'estimateNote'=>self::text($p['estimateNote']??$old['estimate_note']??'',500,false),'name' => self::text($p['name'] ?? null), 'brand' => $brand['id'], 'material' => self::text($p['material'] ?? null, 30), 'colorName' => self::text($p['colorName'] ?? null, 60), 'color' => $color, 'spoolType' => self::text($p['spoolType'] ?? null, 100), 'capacity' => Validation::decimal($capacity), 'initial' => Validation::decimal($initial), 'remaining' => Validation::decimal($remaining), 'gross' => $gross === null ? null : Validation::decimal($gross), 'measured' => $mode === 'gross', 'profile' => $profileId, 'default' => $default, 'override' => $override, 'tare' => $effective, 'location' => self::text($p['location'] ?? '', 150, false), 'catalogue' => $catalogue, 'kind' => $p['registrationKind'], 'status' => $status];
    }

    private static function registrationEstimate(array $capture, mixed $tare, int $remaining, string $mode): string
    {
        Validation::keys($capture,['gross','tare','remaining','capturedAt','source','unverified']);
        if($mode!=='manual'||$tare===null||($capture['source']??'')!=='live-preview-wifi'||($capture['unverified']??null)!==true)throw new HttpError(422,'validation_error','Wi-Fi drafts must remain manual UNVERIFIED estimates.');
        $gross=Validation::mass($capture['gross']??null);$given=Validation::mass($capture['tare']??null);$effective=Validation::mass($tare);
        if($given!==$effective||$gross-$effective!==$remaining||Validation::mass($capture['remaining']??null)!==$remaining||$gross>1000000||$gross<$effective)throw new HttpError(409,'estimate_changed','Draft gross, tare or remaining changed. Capture and accept again.');
        $stamp=$capture['capturedAt']??null;
        if(!is_string($stamp)||!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/D',$stamp)||($at=strtotime($stamp))===false||$at>time()+1)throw new HttpError(422,'validation_error','Invalid capture timestamp.');
        // Draft registration may follow form editing. Preserve original capture time; never relabel as a fresh measurement.
        return 'UNVERIFIED manual estimate; source live-preview-wifi; captured '.$stamp.'; gross '.Validation::decimal($gross).' g minus effective tare '.Validation::decimal($effective).' g = '.Validation::decimal($remaining).' g; browser empty-platform tare acknowledged; cover excluded. Historical accepted draft, not a verified measurement.';
    }

    private function register(array $a): void
    {
        self::confirmed($a); $input=self::object($a['spool']??null); $v = $this->spoolValues($input);
        if ($v['status'] !== 'active') { throw new HttpError(422, 'validation_error', 'New spools must be active.'); }
        $slug = static function (string $s): string {
            $s = trim(preg_replace('/[^A-Z0-9]+/', '_', strtoupper($s)), '_');
            if ($s === '') { throw new HttpError(422, 'validation_error', 'Material and colour name need an ASCII letter or number for the spool code.'); }
            return $s;
        };
        $prefix = $slug($v['material']) . '_' . $slug($v['colorName']);
        $this->execute('INSERT INTO spool_code_sequences (prefix, next_number) VALUES (?, 1) ON DUPLICATE KEY UPDATE prefix = prefix', [$prefix]);
        $number = (int) $this->rows('SELECT next_number FROM spool_code_sequences WHERE prefix = ? FOR UPDATE', [$prefix])[0]['next_number'];
        // Also reserve pre-foundation/imported codes, including archived rows.
        do {
            $code = $prefix . '_' . str_pad((string) $number, 2, '0', STR_PAD_LEFT);
            if (!$this->rows('SELECT id FROM spools WHERE code = ?', [$code])) { break; }
            $number++;
        } while (true);
        $this->execute('UPDATE spool_code_sequences SET next_number = ? WHERE prefix = ?', [$number + 1, $prefix]);
        $id = self::uuid();
        $this->execute('INSERT INTO spools (id, code, name, brand_id, catalogue_product_id, tare_profile_id, tare_override_g, tare_default_g, material, color_name, color_hex, spool_type, registration_kind, nominal_capacity_g, initial_filament_g, remaining_g, last_gross_g, measured, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [$id, $code, $v['name'], $v['brand'], $v['catalogue'], $v['profile'], $v['override'], $v['default'], $v['material'], $v['colorName'], $v['color'], $v['spoolType'], $v['kind'], $v['capacity'], $v['initial'], $v['remaining'], $v['gross'], (int) $v['measured'], $v['location']]);
        $this->saveTareMetadata($id,$v);
        if(isset($a['qrLabelId']))(new QrLabels($this->db,$this->actor))->assign($a['qrLabelId'],$id);
        $this->event('register', $v['name'], [['id' => $id, 'before' => '0.00', 'after' => $v['remaining'], 'measuredBefore' => false, 'measuredAfter' => $v['measured']]], $v['estimateNote']!==''?$v['estimateNote']:'Physical spool registered', ['code' => $code, 'registrationKind' => $v['kind'],...(isset($input['estimateCapture'])?['estimateCapture'=>self::object($input['estimateCapture'])]:[])]);
        if ($v['gross'] !== null) { $this->measurement($id, $v); }
    }

    private function saveTareMetadata(string $id,array $v): void
    {
        if($this->brandTaresAvailable())$this->execute('UPDATE spools SET tare_provisional=?, estimate_note=? WHERE id=?',[(int)$v['provisional'],$v['estimateNote'],$id]);
        elseif($v['provisional']||$v['estimateNote']!=='')throw new HttpError(422,'schema_required','Brand tare migration required for estimated records.');
    }

    private function measurement(string $id, array $v, ?array $reading = null): void
    {
        $source = $reading && $reading['transport'] === 'usb' ? 'usb' : 'manual';
        $at = $reading ? (new \DateTimeImmutable($reading['receivedAt']))->format('Y-m-d H:i:s.u') : null;
        $this->execute('INSERT INTO measurements (id, spool_id, gross_g, effective_tare_g, net_g, source, device_id, device_sequence, stable, received_at, confirmed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, COALESCE(?, UTC_TIMESTAMP(6)), ?)', [self::uuid(), $id, $v['gross'], $v['tare'], $v['remaining'], $source, $reading['deviceId'] ?? null, $reading['seq'] ?? null, $at, $this->actor]);
    }

    private function scaleReading(mixed $value, string $gross): array
    {
        $r = self::object($value);
        Validation::keys($r, ['v','deviceId','seq','grossG','stable','calibrated','receivedAt','connectionId','transport','mode','approximateAcknowledged']);
        if ((array_key_exists('mode', $r) && $r['mode'] !== 'APPROXIMATE')
            || (isset($r['mode']) && ($r['approximateAcknowledged'] ?? null) !== true)
            || (!isset($r['mode']) && array_key_exists('approximateAcknowledged', $r))) {
            throw new HttpError(422, 'invalid_scale_reading', 'Approximate readings require explicit acknowledgement.');
        }
        if (($r['v'] ?? null) !== 1 || ($r['deviceId'] ?? null) !== 'DLOOP-SCALE-01'
            || !is_int($r['seq'] ?? null) || $r['seq'] < 0 || $r['seq'] > 4294967295
            || ($r['stable'] ?? null) !== true || ($r['calibrated'] ?? null) !== true
            || !is_string($r['connectionId'] ?? null) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $r['connectionId'])
            || !in_array($r['transport'] ?? '', ['usb','simulator'], true)
            || (!is_int($r['grossG'] ?? null) && !is_float($r['grossG'] ?? null))
            || Validation::mass($r['grossG']) !== Validation::mass($gross)) {
            throw new HttpError(422, 'invalid_scale_reading', 'A stable, calibrated version 1 reading matching the confirmed gross mass is required.');
        }
        $text = $r['receivedAt'] ?? null;
        if (!is_string($text) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/D', $text)) { throw new HttpError(422, 'invalid_scale_reading', 'Invalid scale receipt timestamp.'); }
        $at = \DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s.v\Z', $text, new \DateTimeZone('UTC'));
        if (!$at || $at->format('Y-m-d\TH:i:s.v\Z') !== $text) { throw new HttpError(422, 'invalid_scale_reading', 'Invalid scale receipt timestamp.'); }
        $age = (int) floor(microtime(true) * 1000) - ($at->getTimestamp() * 1000 + (int) $at->format('v'));
        if ($age > 5000 || $age < -1000) { throw new HttpError(422, 'stale_scale_reading', 'Scale reading expired or browser/server clocks differ. Review a new reading.'); }
        $existing = $this->rows("SELECT id FROM activity_events WHERE event_type = 'weigh' AND JSON_UNQUOTE(JSON_EXTRACT(details_json, '$.reading.connectionId')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(details_json, '$.reading.deviceId')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(details_json, '$.reading.seq')) = ? LIMIT 1", [$r['connectionId'], $r['deviceId'], (string) $r['seq']]);
        if ($existing) { throw new HttpError(409, 'scale_already_confirmed', 'This scale frame was already confirmed. Receive and review a new reading.'); }
        return $r;
    }

    private function update(array $a): void
    {
        self::confirmed($a); $old = $this->spool($a['id'] ?? null, $a, true);
        if ($a['type'] === 'weigh') {
            $p = ['name' => $old['name'], 'brandId' => $old['brand_id'], 'material' => $old['material'], 'colorName' => $old['color_name'], 'color' => $old['color_hex'], 'spoolType' => $old['spool_type'], 'capacity' => $old['nominal_capacity_g'], 'initial' => $old['initial_filament_g'], 'mode' => 'gross', 'gross' => $a['gross'] ?? null, 'profileId' => $old['tare_profile_id'], 'tareOverride' => array_key_exists('reading', $a) ? $old['tare_override_g'] : ($a['tare'] ?? null), 'location' => $old['location'], 'catalogueId' => $old['catalogue_product_id'], 'registrationKind' => $old['registration_kind'], 'status' => $old['status']];
        } else { $p = self::object($a['spool'] ?? null); }
        $v = $this->spoolValues($p, $old);
        $metadataOnly=($p['mode']??'')==='manual'&&$v['remaining']===$old['remaining_g']&&$v['tare']===self::savedTare($old)&&$v['provisional']===(bool)($old['tare_provisional']??false)&&$v['estimateNote']===($old['estimate_note']??'');
        if($metadataOnly){$v['measured']=(bool)$old['measured'];$v['gross']=$old['last_gross_g'];}
        $reading = array_key_exists('reading', $a) ? $this->scaleReading($a['reading'], $v['gross']) : null;
        if ($reading && Validation::mass($a['tare'] ?? null) !== Validation::mass($v['tare'])) { throw new HttpError(422, 'scale_tare_changed', 'Scale confirmation must use the saved physical-spool tare. Edit the spool separately to change tare.'); }
        if ($v['status'] === 'archived' && $this->rows('SELECT id FROM printer_slots WHERE spool_id = ?', [$old['id']])) { throw new HttpError(422, 'spool_assigned', 'Unload this spool from its printer slot before archiving.'); }
        $this->execute('UPDATE spools SET name = ?, brand_id = ?, catalogue_product_id = ?, tare_profile_id = ?, tare_override_g = ?, tare_default_g = ?, material = ?, color_name = ?, color_hex = ?, spool_type = ?, registration_kind = ?, nominal_capacity_g = ?, initial_filament_g = ?, remaining_g = ?, last_gross_g = ?, measured = ?, location = ?, status = ?, version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?', [$v['name'], $v['brand'], $v['catalogue'], $v['profile'], $v['override'], $v['default'], $v['material'], $v['colorName'], $v['color'], $v['spoolType'], $v['kind'], $v['capacity'], $v['initial'], $v['remaining'], $v['gross'], (int) $v['measured'], $v['location'], $v['status'], $old['id']]);
        $this->saveTareMetadata($old['id'],$v);
        if ($old['tare_override_g'] !== $v['override'] || $old['tare_default_g'] !== $v['default'] || (string) $old['tare_profile_id'] !== (string) $v['profile']) {
            $this->event('tare', $v['name'], [self::change($old, Validation::mass($old['remaining_g']), (bool) $old['measured'])], 'Physical spool tare changed; balance changes only as explicitly confirmed.', ['spoolId' => $old['id'], 'before' => $old['tare_override_g'] ?? $old['tare_default_g'], 'after' => $v['tare']]);
        }
        if($metadataOnly){$this->event('spool-edit',$v['name'],[self::change($old,Validation::mass($v['remaining']),$v['measured'])],'Spool details edited; saved balance and measurement provenance preserved.');return;}
        $approximate = ($reading['mode'] ?? null) === 'APPROXIMATE';
        $this->event($v['measured'] ? 'weigh' : 'correction', $v['name'], [self::change($old, Validation::mass($v['remaining']), $v['measured'])], $reading && $reading['transport'] === 'simulator' ? ($approximate ? 'Confirmed APPROXIMATE simulator reading (not physical hardware)' : 'Confirmed simulator reading (not physical hardware)') : ($approximate ? 'Confirmed APPROXIMATE gross minus effective tare' : ($v['measured'] ? 'Confirmed gross minus effective tare' : 'Confirmed absolute remaining mass')), ['statusBefore' => $old['status'], 'statusAfter' => $v['status'], ...($reading ? ['reading' => $reading] : [])]);
        if ($v['gross'] !== null) { $this->measurement($old['id'], $v, $reading); }
    }

    private function printJob(array $a): void
    {
        self::confirmed($a);
        $name = self::text($a['name'] ?? null); $note = self::text($a['note'] ?? '', 500, false);
        if (!$this->rows('SELECT id FROM printers WHERE name = ?'.($this->managementAvailable()?' AND active=1':''), [$a['printer']??'']) || !is_array($a['lines'] ?? null) || count($a['lines']) < 1 || count($a['lines']) > 30) { throw new HttpError(422, 'validation_error', 'Select a printer and 1–30 usage lines.'); }
        $totals = [];
        foreach ($a['lines'] as $line) {
            $line = self::object($line); Validation::keys($line, ['id', 'grams']);
            $id = self::text($line['id'] ?? null, 36); $grams = Validation::mass($line['grams'] ?? null);
            if ($grams === 0) { throw new HttpError(422, 'invalid_mass', 'Usage must be above zero.'); }
            $totals[$id] = ($totals[$id] ?? 0) + $grams;
        }
        ksort($totals); $changes = [];
        foreach ($totals as $id => $grams) {
            $p = $this->spool($id, $a); $after = Validation::mass($p['remaining_g']) - $grams;
            if ($after < 0) { throw new HttpError(422, 'overdraw', 'Print usage exceeds available filament.'); }
            $changes[] = self::change($p, $after, false);
            $this->execute('UPDATE spools SET remaining_g = ?, measured = 0, last_gross_g = NULL, version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?', [Validation::decimal($after), $id]);
        }
        $this->event('print', $name, $changes, $note, ['printer' => $a['printer']]);
    }

    private function slot(string $key): array
    {
        if (!preg_match('/^(kobra|sparkx|printer-[1-9][0-9]{0,8})-([1-9][0-9]?)$/D', $key, $m)) throw new HttpError(422,'validation_error','Invalid printer slot.');
        $number=(int)$m[2];
        $byId=str_starts_with($m[1],'printer-');
        $identity=$byId?substr($m[1],8):($m[1]==='kobra'?'Anycubic Kobra 3':'Creality SPARKX i7');
        $rows=$this->rows('SELECT s.* FROM printer_slots s JOIN printers p ON p.id=s.printer_id WHERE p.'.($byId?'id':'name').'=? AND s.slot_number=?'.($this->managementAvailable()?' AND p.active=1':'').' FOR UPDATE',[$identity,$number]);
        if (!$rows) { throw new HttpError(503, 'missing_slots', 'Printer slots have not been initialized.'); }
        return $rows[0];
    }

    private function assign(array $a): void
    {
        self::confirmed($a); $slot = $this->slot(self::text($a['slot'] ?? null, 40));
        $id = ($a['id'] ?? '') ?: null; $affected = array_values(array_unique(array_filter([$slot['spool_id'], $id]))); $changes = [];
        foreach ($affected as $spoolId) { $p = $this->spool($spoolId, $a); $changes[] = self::change($p, Validation::mass($p['remaining_g']), (bool) $p['measured']); }
        if ($id !== null) { $this->execute('UPDATE printer_slots SET spool_id = NULL WHERE spool_id = ?', [$id]); }
        $this->execute('UPDATE printer_slots SET spool_id = ? WHERE id = ?', [$id, $slot['id']]);
        foreach ($affected as $spoolId) { $this->execute('UPDATE spools SET version = version + 1 WHERE id = ?', [$spoolId]); }
        $this->event('assignment', 'Printer assignment', $changes, $a['slot'], ['slot' => $a['slot'], 'before' => $slot['spool_id'], 'after' => $id]);
    }

    private function undo(array $a): void
    {
        self::confirmed($a);
        $latest = $this->rows("SELECT e.* FROM activity_events e WHERE e.event_type IN ('register','print','weigh','correction') AND NOT EXISTS (SELECT 1 FROM activity_events u WHERE u.undo_of = e.id) ORDER BY e.sequence DESC LIMIT 1");
        if (!$latest || $latest[0]['id'] !== ($a['id'] ?? null) || $latest[0]['event_type'] === 'register') { throw new HttpError(409, 'undo_unavailable', 'Only the most recent active print or balance correction can be undone.'); }
        $changes = $this->rows('SELECT * FROM activity_changes WHERE event_id = ? ORDER BY spool_id', [$a['id']]);
        if (!$changes) { throw new HttpError(409, 'undo_unavailable', 'This entry has no reversible balance changes.'); }
        $reverse = [];
        foreach ($changes as $c) {
            $p = $this->spool($c['spool_id'], $a);
            if (Validation::mass($p['remaining_g']) !== Validation::mass($c['after_g'])) { throw new HttpError(409, 'undo_unavailable', 'Stock has changed; undo is unavailable.'); }
            $this->execute('UPDATE spools SET remaining_g = ?, measured = ?, last_gross_g = NULL, version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?', [$c['before_g'], $c['measured_before'], $p['id']]);
            $reverse[] = self::change($p, Validation::mass($c['before_g']), (bool) $c['measured_before']);
        }
        $this->event('undo', $latest[0]['name'], $reverse, 'Latest active stock entry undone', [], $a['id']);
    }

    private function catalogue(array $f): void
    {
        Validation::keys($f, ['id','version','editToken','active','name', 'brandId', 'material', 'color', 'colorName', 'diameter', 'temperature', 'bed', 'price', 'profileId']);
        $existing=isset($f['id'])?$this->row('catalogue_products',$f['id']):null;
        $brand = $this->row('brands', $f['brandId'] ?? null, !$existing || (string)$existing['brand_id']!==(string)($f['brandId']??'')); $profile = ($f['profileId'] ?? null) ?: null;
        if ($profile !== null && (string) $this->row('tare_profiles', $profile, !$existing || (string)$existing['tare_profile_id']!==(string)$profile)['brand_id'] !== (string) $brand['id']) { throw new HttpError(422, 'validation_error', 'Profile belongs to a different brand.'); }
        $diameter = Validation::mass($f['diameter'] ?? null); $nozzle = Validation::mass($f['temperature'] ?? null); $bed = Validation::mass($f['bed'] ?? null);
        if ($diameter < 1 || $diameter > 500 || $nozzle > 50000 || $bed > 20000 || $nozzle % 100 || $bed % 100 || !is_string($f['color'] ?? null) || !preg_match('/^#[0-9a-f]{6}$/iD', $f['color'])) { throw new HttpError(422, 'validation_error', 'Check diameter, colour and print temperatures.'); }
        $name = self::text($f['name'] ?? null);
        $old=$existing;
        $versioned=$old!==null&&array_key_exists('active',$old)&&array_key_exists('version',$old);
        if($old){
            if($versioned){if(Validation::version($f['version']??null)!==(int)$old['version'])throw new HttpError(409,'version_conflict','Product changed. Reload before editing.');}
            elseif(!is_string($f['editToken']??null)||!hash_equals(self::productEditToken($old),$f['editToken']))throw new HttpError(409,'version_conflict','Product changed. Reload before editing.');
        }
        if($old&&isset($f['active'])&&(bool)($old['active']??true)!==$f['active'])throw new HttpError(422,'confirmation_required','Use explicit archive/restore actions.');
        if(isset($f['active'])&&!is_bool($f['active']))throw new HttpError(422,'validation_error','Active must be boolean.');
        $material=self::text($f['material']??null,30);$colour=self::text($f['colorName']??null,60);
        if($this->rows('SELECT id FROM catalogue_products WHERE brand_id=? AND name=? AND material=? AND color_name=? AND id<>?',[$brand['id'],$name,$material,$colour,$old['id']??'']))throw new HttpError(409,'duplicate_record','This product identity already exists.');
        $values=[$brand['id'],$profile,$name,$material,$colour,$f['color'],Validation::decimal($diameter),intdiv($nozzle,100),intdiv($bed,100),Validation::decimal(Validation::mass($f['price']??null))];
        if($old){
            if($versioned)$this->execute('UPDATE catalogue_products SET brand_id=?,tare_profile_id=?,name=?,material=?,color_name=?,color_hex=?,diameter_mm=?,nozzle_c=?,bed_c=?,price=?,active=?,version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[...$values,(int)($f['active']??(bool)$old['active']),$old['id']]);
            else $this->execute('UPDATE catalogue_products SET brand_id=?,tare_profile_id=?,name=?,material=?,color_name=?,color_hex=?,diameter_mm=?,nozzle_c=?,bed_c=?,price=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[...$values,$old['id']]);
        }
        else $this->execute('INSERT INTO catalogue_products (id,brand_id,tare_profile_id,name,material,color_name,color_hex,diameter_mm,nozzle_c,bed_c,price) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[self::uuid(),...$values]);
        $this->event('catalogue', $name, [], $old?'Catalogue product edited; existing physical spool snapshots unchanged.':'Catalogue product registered');
    }

    private function managedQr(array $a):void
    {
        self::confirmed($a);$p=$this->spool($a['id']??null,$a);$qr=new QrLabels($this->db,$this->actor);
        if($a['type']==='qr-retire'){$qr->retire($p['id']);$note='Managed QR retired; spool and balance preserved.';}
        else{
            if(!is_bool($a['replace']??null))throw new HttpError(422,'validation_error','Confirm whether this is a replacement.');
            if($a['replace'])$qr->retire($p['id']);
            $qr->assign($a['qrLabelId']??'',$p['id']);$note=$a['replace']?'Managed QR replaced; old identity permanently retired.':'Managed QR assigned to existing spool.';
        }
        $this->execute('UPDATE spools SET version=version+1,updated_at=CURRENT_TIMESTAMP(6) WHERE id=?',[$p['id']]);
        $this->event('nfc',$p['name'],[self::change($p,Validation::mass($p['remaining_g']),(bool)$p['measured'])],$note);
    }

    private static function savedTare(array $spool): mixed
    {
        return $spool['tare_override_g'] ?? $spool['tare_default_g'] ?? null;
    }

    private function manualEstimate(array $a): void
    {
        self::confirmed($a);$p=$this->spool($a['id']??null,$a);
        if(!$this->brandTaresAvailable())throw new HttpError(422,'schema_required','Estimate provenance schema required.');
        if(!in_array($a['source']??null,['live-preview-usb','live-preview-simulator','live-preview-wifi'],true))throw new HttpError(422,'validation_error','Invalid estimate source.');
        $stamp=$a['capturedAt']??null;
        if(!is_string($stamp)||!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/D',$stamp)||($time=strtotime($stamp))===false||$time>time()+1||time()-$time>15)throw new HttpError(422,'stale_estimate','Review a fresh estimate within 15 seconds.');
        $tare=self::savedTare($p);
        if($tare===null)throw new HttpError(422,'unknown_tare','Tare Required.');
        $gross=Validation::mass($a['gross']??null);$given=Validation::mass($a['tare']??null);$effective=Validation::mass($tare);
        if($given!==$effective)throw new HttpError(409,'tare_changed','Effective tare changed. Review again.');
        $net=$gross-$effective;
        if($gross>1000000||$net<0||$net>Validation::mass($p['nominal_capacity_g']))throw new HttpError(422,'invalid_mass','Gross is below tare, exceeds 10 kg, or remaining exceeds nominal capacity.');
        $note='UNVERIFIED manual estimate; source '.$a['source'].'; captured '.$stamp.'; gross '.Validation::decimal($gross).' g minus effective tare '.Validation::decimal($effective).' g = '.Validation::decimal($net).' g; empty platform zero confirmed; cover and packaging excluded.';
        $this->execute('UPDATE spools SET remaining_g=?, measured=0, last_gross_g=NULL, estimate_note=?, version=version+1, updated_at=UTC_TIMESTAMP(6) WHERE id=?',[Validation::decimal($net),$note,$p['id']]);
        $this->event('correction',$p['name'],[self::change($p,$net,false)],$note,['source'=>$a['source'],'capturedAt'=>$stamp,'unverified'=>true,'gross'=>Validation::decimal($gross),'tare'=>Validation::decimal($effective)]);
    }

    private function unlinkTag(array $a): void
    {
        self::confirmed($a);$p=$this->spool($a['id']??null,$a);
        if(!$this->tagUrlsAvailable())throw new HttpError(422,'schema_required','Tag identity migration required.');
        $this->execute('UPDATE spools SET tag_token=NULL, version=version+1, updated_at=UTC_TIMESTAMP(6) WHERE id=?',[$p['id']]);
        $this->execute('DELETE FROM nfc_tags WHERE spool_id=?',[$p['id']]);
        $this->event('nfc',$p['name'],[],'NFC URL and hardware UID unlinked; spool and balance preserved.');
    }

    private function link(array $a): void
    {
        self::confirmed($a); $p = $this->spool($a['id'] ?? null, $a);
        $uid = strtoupper(str_replace([':', ' ', '-'], '', self::text($a['uid'] ?? '', 50, false)));
        if ($uid !== '' && !preg_match('/^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/D', $uid)) { throw new HttpError(422, 'validation_error', 'NFC UID must be 4, 7 or 10 hexadecimal bytes.'); }
        $existing = $this->rows('SELECT uid FROM nfc_tags WHERE spool_id = ?', [$p['id']]);
        if ($existing) { $this->execute('UPDATE nfc_tags SET uid = ? WHERE spool_id = ?', [$uid === '' ? $existing[0]['uid'] : $uid, $p['id']]); }
        elseif ($uid !== '') { $this->execute('INSERT INTO nfc_tags (uid, spool_id) VALUES (?, ?)', [$uid, $p['id']]); }
        // Explicit unlink removes only the optional association, never a spool/history record.
        if ($uid === '' && $existing) { $this->execute('DELETE FROM nfc_tags WHERE spool_id = ?', [$p['id']]); }
        $this->execute('UPDATE spools SET version = version + 1 WHERE id = ?', [$p['id']]);
        $this->event('nfc', $p['name'], [], 'NFC association confirmed', ['spoolId' => $p['id'], 'uid' => $uid]);
    }

    private function tagUrl(array $a): void
    {
        self::confirmed($a);$spool=$this->spool($a['id']??null,$a);
        if(!is_bool($a['replace']??null))throw new HttpError(422,'validation_error','Confirm whether this tag replaces the old tag.');
        if(!$this->tagUrlsAvailable())throw new HttpError(422,'schema_required','Tag identity migration required.');
        if(($spool['tag_token']??null)!==null&&!$a['replace'])return;
        $token=bin2hex(random_bytes(24));
        $this->execute('UPDATE spools SET tag_token=?,version=version+1 WHERE id=?',[$token,$spool['id']]);
        $this->event('nfc',$spool['name'],[],'Opaque NFC tag identifier generated/replaced; no spool created.');
    }

    private function tagUrlsAvailable(): bool
    {
        return (int)$this->rows("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='spools' AND column_name='tag_token'")[0]['n']===1;
    }

    public function snapshot(): array
    {
        $owns = !$this->db->inTransaction();
        if ($owns) { $this->db->beginTransaction(); }
        try {
            $revision = (int) $this->rows('SELECT revision FROM studio_revision WHERE id = 1')[0]['revision'];
            $raw = $this->rows('SELECT s.*, b.name AS brand_name, n.uid FROM spools s JOIN brands b ON b.id = s.brand_id LEFT JOIN nfc_tags n ON n.spool_id = s.id ORDER BY s.created_at, s.id');
            if (count($raw) > 5000) { throw new HttpError(413, 'snapshot_limit', 'More than 5,000 spools require the paginated API.'); }
            $spools = array_map(static fn ($p) => ['id' => $p['id'], 'code' => $p['code'], 'version' => (int) $p['version'], 'name' => $p['name'], 'brand' => $p['brand_name'], 'brandId' => (string) $p['brand_id'], 'material' => $p['material'], 'colorName' => $p['color_name'], 'color' => $p['color_hex'], 'initial' => (float) $p['initial_filament_g'], 'remaining' => (float) $p['remaining_g'], 'capacity' => (float) $p['nominal_capacity_g'], 'tare' => (float) (self::savedTare($p) ?? 0), 'tareKnown' => self::savedTare($p) !== null, 'tareOverride' => $p['tare_override_g'] === null ? null : (float) $p['tare_override_g'], 'tareDefault' => $p['tare_default_g'] === null ? null : (float) $p['tare_default_g'], 'profileId' => $p['tare_profile_id'] === null ? null : (string) $p['tare_profile_id'], 'spoolType' => $p['spool_type'], 'registrationKind' => $p['registration_kind'], 'gross' => $p['last_gross_g'] === null ? null : (float) $p['last_gross_g'], 'status' => $p['status'], 'location' => $p['location'], 'measured' => (bool) $p['measured'], 'tareProvisional'=>(bool)($p['tare_provisional']??false), 'estimateNote'=>$p['estimate_note']??'', 'tagToken'=>$p['tag_token']??null,'nfc' => $p['uid'] ?? '', 'catalogueId' => $p['catalogue_product_id'] ?? ''], $raw);
            $history = [];
            $events = $this->rows('SELECT e.*, u.id AS undo_id, a.email AS actor FROM activity_events e LEFT JOIN activity_events u ON u.undo_of = e.id LEFT JOIN users a ON a.id = e.actor_id ORDER BY e.sequence DESC LIMIT 50000');
            $allChanges = $this->rows('SELECT c.* FROM activity_changes c JOIN (SELECT id FROM activity_events ORDER BY sequence DESC LIMIT 50000) e ON e.id = c.event_id ORDER BY c.id'); $byEvent = [];
            foreach ($allChanges as $c) { $byEvent[$c['event_id']][] = ['id' => $c['spool_id'], 'before' => (float) $c['before_g'], 'after' => (float) $c['after_g'], 'measuredBefore' => (bool) $c['measured_before'], 'measuredAfter' => (bool) $c['measured_after']]; }
            $latest = null;
            foreach ($events as $e) { if ($e['undo_id'] === null && in_array($e['event_type'], ['register', 'print', 'weigh', 'correction'], true)) { $latest = $e['id']; break; } }
            $currentById = array_column($spools, null, 'id');
            foreach ($events as $e) {
                $details = json_decode($e['details_json'] ?? '{}', true);
                $eventChanges = $byEvent[$e['id']] ?? [];
                $canUndo = $e['id'] === $latest && $e['event_type'] !== 'register' && count($eventChanges) > 0;
                foreach ($eventChanges as $change) {
                    $current = $currentById[$change['id']] ?? null;
                    if (!$current || $current['status'] !== 'active' || Validation::mass($current['remaining']) !== Validation::mass($change['after'])) { $canUndo = false; }
                }
                $history[] = ['id' => $e['id'], 'date' => str_replace(' ', 'T', $e['created_at']) . 'Z', 'type' => $e['event_type'], 'name' => $e['name'], 'printer' => $details['printer'] ?? '', 'note' => $e['note'], 'actor' => $e['actor'] ?? 'Legacy', 'changes' => $eventChanges, 'undone' => $e['undo_id'] !== null, 'canUndo' => $canUndo];
            }
            $slots = [];
            foreach ($this->rows('SELECT s.*, p.name AS printer FROM printer_slots s JOIN printers p ON p.id = s.printer_id WHERE s.spool_id IS NOT NULL') as $slot) {
                $prefix=$slot['printer']==='Anycubic Kobra 3'?'kobra':($slot['printer']==='Creality SPARKX i7'?'sparkx':'printer-'.$slot['printer_id']); $slots[$prefix.'-'.$slot['slot_number']]=$slot['spool_id'];
            }
            $catalogue = array_map(static fn ($c) => ['id' => $c['id'], 'name' => $c['name'], 'brand' => $c['brand'], 'brandId' => (string) $c['brand_id'], 'material' => $c['material'], 'colorName' => $c['color_name'], 'color' => $c['color_hex'], 'diameter' => (float) $c['diameter_mm'], 'temperature' => (int) $c['nozzle_c'], 'bed' => (int) $c['bed_c'], 'price' => (float) $c['price'], 'tare' => (float) ($c['empty_mass_g'] ?? 0), 'tareKnown' => $c['empty_mass_g'] !== null && $c['tare_verified'] !== null, 'editToken'=>self::productEditToken($c),'lifecycleAvailable'=>array_key_exists('active',$c)&&array_key_exists('version',$c),'active'=>(bool)($c['active']??true),'version'=>(int)($c['version']??1),'profileId' => $c['tare_profile_id'] === null ? null : (string) $c['tare_profile_id']], $this->rows('SELECT c.*, b.name AS brand, t.empty_mass_g, t.verified_at AS tare_verified FROM catalogue_products c JOIN brands b ON b.id = c.brand_id LEFT JOIN tare_profiles t ON t.id = c.tare_profile_id ORDER BY c.name'));
            $brands = array_map(static fn ($b) => ['id' => (string) $b['id'], 'name' => $b['name'], 'active' => (bool) $b['active'], 'version' => (int) $b['version'], 'defaultTare'=>isset($b['default_tare_g'])?(float)$b['default_tare_g']:null, 'defaultTareVerified'=>(bool)($b['default_tare_verified']??false)], $this->rows('SELECT * FROM brands ORDER BY name'));
            $profiles = array_map(static fn ($p) => ['id' => (string) $p['id'], 'brandId' => (string) $p['brand_id'], 'spoolType' => $p['spool_type'], 'capacity' => (float) $p['nominal_capacity_g'], 'tare' => (float) $p['empty_mass_g'], 'verified' => $p['verified_at'] !== null, 'active' => (bool) $p['active'], 'version' => (int) $p['version'], 'notes' => $p['notes']], $this->rows('SELECT * FROM tare_profiles ORDER BY brand_id, spool_type'));
            $qrAvailable=(new QrLabels($this->db))->available();
            if($qrAvailable){$bindings=[];foreach($this->rows("SELECT label_id,spool_id FROM qr_labels WHERE state='ASSIGNED'") as $binding)$bindings[$binding['spool_id']]=$binding['label_id'];foreach($spools as &$item)$item['qrLabelId']=$bindings[$item['id']]??null;unset($item);}
            $response = ['revision' => $revision, 'state' => ['managementAvailable'=>$this->managementAvailable(),'printers'=>$this->printerSnapshot(), 'spools' => $spools, 'history' => $history, 'slots' => (object) $slots, 'catalogue' => $catalogue, 'brands' => $brands, 'profiles' => $profiles, 'qrLabelsAvailable'=>$qrAvailable,'brandTaresAvailable'=>$this->brandTaresAvailable(),'tagUrlsAvailable'=>$this->tagUrlsAvailable()]];
            if ($owns) { $this->db->commit(); } return $response;
        } catch (\Throwable $e) { if ($owns && $this->db->inTransaction()) { $this->db->rollBack(); } throw $e; }
    }

    public function dashboard(): array
    {
        $s = $this->snapshot()['state']; $spools = array_filter($s['spools'], static fn ($p) => $p['status'] === 'active');
        $groups = [];
        foreach (['material', 'brand', 'colorName'] as $field) {
            $group = [];
            foreach ($spools as $p) { $label = $p[$field]; $group[$label] ??= ['name' => $label, 'count' => 0, 'remainingG' => 0]; $group[$label]['count']++; $group[$label]['remainingG'] += Validation::mass($p['remaining']); }
            foreach ($group as &$g) { $g['remainingG'] = Validation::decimal($g['remainingG']); } unset($g);
            $groups[$field] = array_values($group);
        }
        return ['data' => ['totalSpools' => count($spools), 'archivedSpools' => count($s['spools']) - count($spools), 'remainingG' => Validation::decimal(array_sum(array_map(static fn ($p) => Validation::mass($p['remaining']), $spools))), 'lowStockSpools' => count(array_filter($spools, static fn ($p) => $p['remaining'] > 0 && $p['remaining'] < 200)), 'emptySpools' => count(array_filter($spools, static fn ($p) => $p['remaining'] == 0)), 'lowStockThresholdG' => '200.00', 'groups' => $groups, 'recentActivity' => array_slice($s['history'], 0, 10)]];
    }

    public function activity(int $limit, int $offset): array
    {
        $this->db->beginTransaction();
        try {
            $total = (int) $this->rows('SELECT COUNT(*) AS n FROM activity_events')[0]['n'];
            $q = $this->db->prepare('SELECT e.*, u.id AS undo_id, a.email AS actor FROM activity_events e LEFT JOIN activity_events u ON u.undo_of=e.id LEFT JOIN users a ON a.id=e.actor_id ORDER BY e.sequence DESC LIMIT ? OFFSET ?');
            $q->bindValue(1,$limit,\PDO::PARAM_INT);$q->bindValue(2,$offset,\PDO::PARAM_INT);$q->execute();$events=$q->fetchAll();
            $items=[];
            foreach ($events as $e) {
                $details=json_decode($e['details_json']??'{}',true);
                $changes=array_map(static fn($c)=>['id'=>$c['spool_id'],'before'=>(float)$c['before_g'],'after'=>(float)$c['after_g'],'measuredBefore'=>(bool)$c['measured_before'],'measuredAfter'=>(bool)$c['measured_after']],$this->rows('SELECT * FROM activity_changes WHERE event_id=? ORDER BY id',[$e['id']]));
                $items[]=['id'=>$e['id'],'date'=>str_replace(' ','T',$e['created_at']).'Z','type'=>$e['event_type'],'name'=>$e['name'],'actor'=>$e['actor']??'Legacy','printer'=>$details['printer']??'','note'=>$e['note'],'changes'=>$changes,'undone'=>$e['undo_id']!==null];
            }
            $this->db->commit();return ['data'=>$items,'meta'=>['total'=>$total,'limit'=>$limit,'offset'=>$offset]];
        } catch (\Throwable $e) { if ($this->db->inTransaction()) {$this->db->rollBack();} throw $e; }
    }
}
