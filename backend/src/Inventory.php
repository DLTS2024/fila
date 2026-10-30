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
        $numeric = in_array($table, ['brands','tare_profiles'], true);
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
            if ($e instanceof \PDOException && (int) ($e->errorInfo[1] ?? 0) === 1062) { throw new HttpError(409, 'duplicate_record', 'A brand, profile, tag or spool code already exists.'); }
            throw $e;
        }
    }

    private function apply(array $a): void
    {
        $type = $a['type'] ?? '';
        $allowed = match ($type) {
            'brand' => ['brand'], 'profile' => ['profile'], 'add' => ['spool', 'confirmed'],
            'update' => ['id', 'spool', 'confirmed', 'version'],
            'weigh' => ['id', 'gross', 'tare', 'confirmed', 'version', 'reading'],
            'print' => ['name', 'printer', 'note', 'lines', 'status', 'confirmed'],
            'assign' => ['slot', 'id', 'confirmed'], 'undo' => ['id', 'confirmed'],
            'catalogue' => ['filament'], 'link' => ['id', 'uid', 'confirmed'],
            default => throw new HttpError(422, 'unknown_action', 'Unsupported inventory action.'),
        };
        Validation::keys($a, array_merge(['type', 'versions'], $allowed));
        match ($type) {
            'brand' => $this->brand(self::object($a['brand'] ?? null)),
            'profile' => $this->profile(self::object($a['profile'] ?? null)),
            'add' => $this->register($a), 'update', 'weigh' => $this->update($a),
            'print' => $this->printJob($a), 'assign' => $this->assign($a),
            'undo' => $this->undo($a), 'catalogue' => $this->catalogue(self::object($a['filament'] ?? null)),
            'link' => $this->link($a),
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

    private function brand(array $b): void
    {
        Validation::keys($b, ['id', 'version', 'name', 'active']);
        $name = self::text($b['name'] ?? null);
        if (!is_bool($b['active'] ?? null)) { throw new HttpError(422, 'validation_error', 'Brand active must be boolean.'); }
        if (isset($b['id'])) {
            $old = $this->row('brands', $b['id']);
            if (Validation::version($b['version'] ?? null) !== (int) $old['version']) { throw new HttpError(409, 'version_conflict', 'Brand changed. Reload before editing.'); }
            $this->execute('UPDATE brands SET name = ?, active = ?, version = version + 1 WHERE id = ?', [$name, (int) $b['active'], $b['id']]);
        } else {
            $this->execute('INSERT INTO brands (name, active) VALUES (?, ?)', [$name, (int) $b['active']]);
        }
        $this->event('brand', $name, [], $b['active'] ? 'Brand saved' : 'Brand deactivated');
    }

    private function profile(array $p): void
    {
        Validation::keys($p, ['id', 'version', 'brandId', 'spoolType', 'capacity', 'tare', 'verified', 'active', 'notes']);
        $this->row('brands', $p['brandId'] ?? null, true);
        $type = self::text($p['spoolType'] ?? null, 100);
        $capacity = Validation::mass($p['capacity'] ?? null); $tare = Validation::mass($p['tare'] ?? null);
        if ($capacity === 0 || !is_bool($p['verified'] ?? null) || !is_bool($p['active'] ?? null)) { throw new HttpError(422, 'validation_error', 'Check profile capacity and verification flags.'); }
        $values = [$p['brandId'], $type, Validation::decimal($capacity), Validation::decimal($tare), $p['verified'] ? gmdate('Y-m-d H:i:s') : null, (int) $p['active'], self::text($p['notes'] ?? '', 500, false)];
        if (isset($p['id'])) {
            $old = $this->row('tare_profiles', $p['id']);
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
        Validation::keys($p, ['name', 'brandId', 'material', 'colorName', 'color', 'spoolType', 'capacity', 'initial', 'remaining', 'gross', 'mode', 'registrationKind', 'profileId', 'tareOverride', 'location', 'catalogueId', 'status', 'refreshProfile']);
        if (isset($p['refreshProfile']) && !is_bool($p['refreshProfile'])) { throw new HttpError(422, 'validation_error', 'Profile adoption must be explicitly boolean.'); }
        $brand = $this->row('brands', $p['brandId'] ?? null, !$old || (string) $old['brand_id'] !== (string) ($p['brandId'] ?? ''));
        $profileId = $p['profileId'] ?? null; $default = null;
        if ($profileId !== null && $profileId !== '') {
            $profile = $this->row('tare_profiles', $profileId, !$old || (string) $old['tare_profile_id'] !== (string) $profileId);
            if ((string) $profile['brand_id'] !== (string) $brand['id']) { throw new HttpError(422, 'validation_error', 'The tare profile belongs to a different brand.'); }
            if ((!$old || (string) $old['tare_profile_id'] !== (string) $profileId || ($p['refreshProfile'] ?? false))
                && (self::text($p['spoolType'] ?? null, 100) !== $profile['spool_type'] || Validation::mass($p['capacity'] ?? null) !== Validation::mass($profile['nominal_capacity_g']))) {
                throw new HttpError(422, 'profile_mismatch', 'The selected profile must match the physical spool type and label capacity.');
            }
            if ($old && (string) $old['tare_profile_id'] === (string) $profileId && !($p['refreshProfile'] ?? false)) {
                $default = $old['tare_default_g'];
            } elseif ($profile['verified_at'] !== null) { $default = $profile['empty_mass_g']; }
        } else { $profileId = null; }
        $override = ($p['tareOverride'] ?? null) === null ? null : Validation::decimal(Validation::mass($p['tareOverride']));
        $effective = $override ?? $default;
        if ($effective === null) { throw new HttpError(422, 'unknown_tare', 'Enter a verified physical-spool tare or select a verified profile.'); }
        $capacity = Validation::mass($p['capacity'] ?? null); $initial = Validation::mass($p['initial'] ?? null);
        if ($capacity === 0) { throw new HttpError(422, 'validation_error', 'Nominal capacity must be positive.'); }
        $mode = $p['mode'] ?? '';
        if (!in_array($mode, ['manual', 'gross'], true)) { throw new HttpError(422, 'validation_error', 'Choose manual remaining mass or gross measurement.'); }
        $gross = $mode === 'gross' ? Validation::mass($p['gross'] ?? null) : null;
        $remaining = $mode === 'gross' ? $gross - Validation::mass($effective) : Validation::mass($p['remaining'] ?? null);
        if ($remaining < 0) { throw new HttpError(422, 'invalid_mass', 'Gross weight must be at least the empty spool tare.'); }
        if (!$old && $remaining > $initial) { throw new HttpError(422, 'invalid_mass', 'Remaining cannot exceed the registered starting mass.'); }
        if (!in_array($p['registrationKind'] ?? '', ['sealed', 'partial'], true)) { throw new HttpError(422, 'validation_error', 'Choose sealed or partially used registration.'); }
        $status = $p['status'] ?? 'active';
        if (!in_array($status, ['active', 'archived'], true)) { throw new HttpError(422, 'validation_error', 'Invalid spool status.'); }
        $catalogue = ($p['catalogueId'] ?? null) ?: null;
        if ($catalogue !== null && (string) $this->row('catalogue_products', $catalogue)['brand_id'] !== (string) $brand['id']) { throw new HttpError(422, 'validation_error', 'Catalogue product belongs to a different brand.'); }
        $color = $p['color'] ?? '';
        if (!is_string($color) || !preg_match('/^#[0-9a-f]{6}$/iD', $color)) { throw new HttpError(422, 'validation_error', 'Choose a valid hex colour.'); }
        return ['name' => self::text($p['name'] ?? null), 'brand' => $brand['id'], 'material' => self::text($p['material'] ?? null, 30), 'colorName' => self::text($p['colorName'] ?? null, 60), 'color' => $color, 'spoolType' => self::text($p['spoolType'] ?? null, 100), 'capacity' => Validation::decimal($capacity), 'initial' => Validation::decimal($initial), 'remaining' => Validation::decimal($remaining), 'gross' => $gross === null ? null : Validation::decimal($gross), 'measured' => $mode === 'gross', 'profile' => $profileId, 'default' => $default, 'override' => $override, 'tare' => $effective, 'location' => self::text($p['location'] ?? '', 150, false), 'catalogue' => $catalogue, 'kind' => $p['registrationKind'], 'status' => $status];
    }

    private function register(array $a): void
    {
        self::confirmed($a); $v = $this->spoolValues(self::object($a['spool'] ?? null));
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
        $this->event('register', $v['name'], [['id' => $id, 'before' => '0.00', 'after' => $v['remaining'], 'measuredBefore' => false, 'measuredAfter' => $v['measured']]], 'Physical spool registered', ['code' => $code, 'registrationKind' => $v['kind']]);
        if ($v['gross'] !== null) { $this->measurement($id, $v); }
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
        Validation::keys($r, ['v','deviceId','seq','grossG','stable','calibrated','receivedAt','connectionId','transport']);
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
        $reading = array_key_exists('reading', $a) ? $this->scaleReading($a['reading'], $v['gross']) : null;
        if ($reading && Validation::mass($a['tare'] ?? null) !== Validation::mass($v['tare'])) { throw new HttpError(422, 'scale_tare_changed', 'Scale confirmation must use the saved physical-spool tare. Edit the spool separately to change tare.'); }
        if ($v['status'] === 'archived' && $this->rows('SELECT id FROM printer_slots WHERE spool_id = ?', [$old['id']])) { throw new HttpError(422, 'spool_assigned', 'Unload this spool from its printer slot before archiving.'); }
        $this->execute('UPDATE spools SET name = ?, brand_id = ?, catalogue_product_id = ?, tare_profile_id = ?, tare_override_g = ?, tare_default_g = ?, material = ?, color_name = ?, color_hex = ?, spool_type = ?, registration_kind = ?, nominal_capacity_g = ?, initial_filament_g = ?, remaining_g = ?, last_gross_g = ?, measured = ?, location = ?, status = ?, version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?', [$v['name'], $v['brand'], $v['catalogue'], $v['profile'], $v['override'], $v['default'], $v['material'], $v['colorName'], $v['color'], $v['spoolType'], $v['kind'], $v['capacity'], $v['initial'], $v['remaining'], $v['gross'], (int) $v['measured'], $v['location'], $v['status'], $old['id']]);
        if ($old['tare_override_g'] !== $v['override'] || $old['tare_default_g'] !== $v['default'] || (string) $old['tare_profile_id'] !== (string) $v['profile']) {
            $this->event('tare', $v['name'], [self::change($old, Validation::mass($old['remaining_g']), (bool) $old['measured'])], 'Physical spool tare changed; balance changes only as explicitly confirmed.', ['spoolId' => $old['id'], 'before' => $old['tare_override_g'] ?? $old['tare_default_g'], 'after' => $v['tare']]);
        }
        $this->event($v['measured'] ? 'weigh' : 'correction', $v['name'], [self::change($old, Validation::mass($v['remaining']), $v['measured'])], $reading && $reading['transport'] === 'simulator' ? 'Confirmed simulator reading (not physical hardware)' : ($v['measured'] ? 'Confirmed gross minus effective tare' : 'Confirmed absolute remaining mass'), ['statusBefore' => $old['status'], 'statusAfter' => $v['status'], ...($reading ? ['reading' => $reading] : [])]);
        if ($v['gross'] !== null) { $this->measurement($old['id'], $v, $reading); }
    }

    private function printJob(array $a): void
    {
        self::confirmed($a);
        $name = self::text($a['name'] ?? null); $note = self::text($a['note'] ?? '', 500, false);
        if (!in_array($a['printer'] ?? '', ['Anycubic Kobra 3', 'Creality SPARKX i7'], true) || !is_array($a['lines'] ?? null) || count($a['lines']) < 1 || count($a['lines']) > 30) { throw new HttpError(422, 'validation_error', 'Select a printer and 1–30 usage lines.'); }
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
        if (!preg_match('/^(kobra-1|sparkx-[1-4])$/D', $key)) { throw new HttpError(422, 'validation_error', 'Invalid printer slot.'); }
        [$printer, $number] = explode('-', $key);
        $rows = $this->rows('SELECT s.* FROM printer_slots s JOIN printers p ON p.id = s.printer_id WHERE p.name = ? AND s.slot_number = ? FOR UPDATE', [$printer === 'kobra' ? 'Anycubic Kobra 3' : 'Creality SPARKX i7', $number]);
        if (!$rows) { throw new HttpError(503, 'missing_slots', 'Printer slots have not been initialized.'); }
        return $rows[0];
    }

    private function assign(array $a): void
    {
        self::confirmed($a); $slot = $this->slot(self::text($a['slot'] ?? null, 20));
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
        Validation::keys($f, ['name', 'brandId', 'material', 'color', 'colorName', 'diameter', 'temperature', 'bed', 'price', 'profileId']);
        $brand = $this->row('brands', $f['brandId'] ?? null, true); $profile = ($f['profileId'] ?? null) ?: null;
        if ($profile !== null && (string) $this->row('tare_profiles', $profile, true)['brand_id'] !== (string) $brand['id']) { throw new HttpError(422, 'validation_error', 'Profile belongs to a different brand.'); }
        $diameter = Validation::mass($f['diameter'] ?? null); $nozzle = Validation::mass($f['temperature'] ?? null); $bed = Validation::mass($f['bed'] ?? null);
        if ($diameter < 1 || $diameter > 500 || $nozzle > 50000 || $bed > 20000 || $nozzle % 100 || $bed % 100 || !is_string($f['color'] ?? null) || !preg_match('/^#[0-9a-f]{6}$/iD', $f['color'])) { throw new HttpError(422, 'validation_error', 'Check diameter, colour and print temperatures.'); }
        $name = self::text($f['name'] ?? null);
        $this->execute('INSERT INTO catalogue_products (id, brand_id, tare_profile_id, name, material, color_name, color_hex, diameter_mm, nozzle_c, bed_c, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [self::uuid(), $brand['id'], $profile, $name, self::text($f['material'] ?? null, 30), self::text($f['colorName'] ?? null, 60), $f['color'], Validation::decimal($diameter), intdiv($nozzle, 100), intdiv($bed, 100), Validation::decimal(Validation::mass($f['price'] ?? null))]);
        $this->event('catalogue', $name, [], 'Catalogue product registered');
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

    public function snapshot(): array
    {
        $owns = !$this->db->inTransaction();
        if ($owns) { $this->db->beginTransaction(); }
        try {
            $revision = (int) $this->rows('SELECT revision FROM studio_revision WHERE id = 1')[0]['revision'];
            $raw = $this->rows('SELECT s.*, b.name AS brand_name, n.uid FROM spools s JOIN brands b ON b.id = s.brand_id LEFT JOIN nfc_tags n ON n.spool_id = s.id ORDER BY s.created_at, s.id');
            if (count($raw) > 5000) { throw new HttpError(413, 'snapshot_limit', 'More than 5,000 spools require the paginated API.'); }
            $spools = array_map(static fn ($p) => ['id' => $p['id'], 'code' => $p['code'], 'version' => (int) $p['version'], 'name' => $p['name'], 'brand' => $p['brand_name'], 'brandId' => (string) $p['brand_id'], 'material' => $p['material'], 'colorName' => $p['color_name'], 'color' => $p['color_hex'], 'initial' => (float) $p['initial_filament_g'], 'remaining' => (float) $p['remaining_g'], 'capacity' => (float) $p['nominal_capacity_g'], 'tare' => (float) ($p['tare_override_g'] ?? $p['tare_default_g'] ?? 0), 'tareKnown' => ($p['tare_override_g'] ?? $p['tare_default_g']) !== null, 'tareOverride' => $p['tare_override_g'] === null ? null : (float) $p['tare_override_g'], 'tareDefault' => $p['tare_default_g'] === null ? null : (float) $p['tare_default_g'], 'profileId' => $p['tare_profile_id'] === null ? null : (string) $p['tare_profile_id'], 'spoolType' => $p['spool_type'], 'registrationKind' => $p['registration_kind'], 'gross' => $p['last_gross_g'] === null ? null : (float) $p['last_gross_g'], 'status' => $p['status'], 'location' => $p['location'], 'measured' => (bool) $p['measured'], 'nfc' => $p['uid'] ?? '', 'catalogueId' => $p['catalogue_product_id'] ?? ''], $raw);
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
                if (in_array($slot['printer'], ['Anycubic Kobra 3', 'Creality SPARKX i7'], true)) { $slots[($slot['printer'] === 'Anycubic Kobra 3' ? 'kobra' : 'sparkx') . '-' . $slot['slot_number']] = $slot['spool_id']; }
            }
            $catalogue = array_map(static fn ($c) => ['id' => $c['id'], 'name' => $c['name'], 'brand' => $c['brand'], 'brandId' => (string) $c['brand_id'], 'material' => $c['material'], 'colorName' => $c['color_name'], 'color' => $c['color_hex'], 'diameter' => (float) $c['diameter_mm'], 'temperature' => (int) $c['nozzle_c'], 'bed' => (int) $c['bed_c'], 'price' => (float) $c['price'], 'tare' => (float) ($c['empty_mass_g'] ?? 0), 'tareKnown' => $c['empty_mass_g'] !== null && $c['tare_verified'] !== null, 'profileId' => $c['tare_profile_id'] === null ? null : (string) $c['tare_profile_id']], $this->rows('SELECT c.*, b.name AS brand, t.empty_mass_g, t.verified_at AS tare_verified FROM catalogue_products c JOIN brands b ON b.id = c.brand_id LEFT JOIN tare_profiles t ON t.id = c.tare_profile_id ORDER BY c.name'));
            $brands = array_map(static fn ($b) => ['id' => (string) $b['id'], 'name' => $b['name'], 'active' => (bool) $b['active'], 'version' => (int) $b['version']], $this->rows('SELECT * FROM brands ORDER BY name'));
            $profiles = array_map(static fn ($p) => ['id' => (string) $p['id'], 'brandId' => (string) $p['brand_id'], 'spoolType' => $p['spool_type'], 'capacity' => (float) $p['nominal_capacity_g'], 'tare' => (float) $p['empty_mass_g'], 'verified' => $p['verified_at'] !== null, 'active' => (bool) $p['active'], 'version' => (int) $p['version'], 'notes' => $p['notes']], $this->rows('SELECT * FROM tare_profiles ORDER BY brand_id, spool_type'));
            $response = ['revision' => $revision, 'state' => ['spools' => $spools, 'history' => $history, 'slots' => (object) $slots, 'catalogue' => $catalogue, 'brands' => $brands, 'profiles' => $profiles]];
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
