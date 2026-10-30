<?php
declare(strict_types=1);

// Read-only metadata verification against the explicitly selected disposable DB.
require dirname(__DIR__) . '/bin/common.php';
try {
    $config = cliConfig();
    if ($config['environment'] !== 'local' || !str_starts_with($config['database']['name'], 'dloop_test_')
        || !in_array($config['database']['host'], ['localhost', '127.0.0.1', '::1'], true)) {
        throw new RuntimeException('Disposable local test database required.');
    }
    $pdo = \DLoop\Database::connect($config);
    $checks = 0;
    $assert = static function (bool $ok, string $label) use (&$checks): void {
        if (!$ok) { throw new RuntimeException('Metadata mismatch: ' . $label); }
        $checks++;
    };
    $files = glob(dirname(__DIR__) . '/migrations/*.sql');
    sort($files, SORT_STRING);
    $ledger = $pdo->query('SELECT version, checksum FROM schema_migrations')->fetchAll(PDO::FETCH_KEY_PAIR);
    $assert(count($ledger) === count($files), 'migration count');
    $tables = $pdo->query('SELECT table_name, engine FROM information_schema.tables WHERE table_schema = DATABASE()')->fetchAll(PDO::FETCH_KEY_PAIR);
    $expectedTables = [];
    $foreignKeys = 0; $indexes = 0; $massColumns = 0; $checkConstraints = 0;
    foreach ($files as $file) {
        $name = basename($file);
        $assert(isset($ledger[$name]) && hash_equals($ledger[$name], hash_file('sha256', $file)), 'checksum ' . $name);
        preg_match_all('/CREATE TABLE(?: IF NOT EXISTS)? (\w+) \((.*?)\) ENGINE=InnoDB/s', file_get_contents($file), $definitions, PREG_SET_ORDER);
        foreach ($definitions as $definition) {
            [$unused, $table, $body] = $definition;
            $expectedTables[] = $table;
            $assert(($tables[$table] ?? '') === 'InnoDB', 'engine ' . $table);
            $q = $pdo->prepare('SELECT index_name, non_unique, column_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? ORDER BY index_name, seq_in_index');
            $q->execute([$table]);
            $actualIndexes = [];
            foreach ($q->fetchAll() as $row) {
                $actualIndexes[$row['index_name']]['columns'][] = $row['column_name'];
                $actualIndexes[$row['index_name']]['unique'] = (int) $row['non_unique'] === 0;
            }
            $assert(isset($actualIndexes['PRIMARY']) && $actualIndexes['PRIMARY']['unique'], 'primary key ' . $table);
            preg_match_all('/(?:^|\n)\s*(UNIQUE )?KEY (\w+) \(([^)]+)\)/', $body, $keys, PREG_SET_ORDER);
            foreach ($keys as $key) {
                $expectedColumns = array_map('trim', explode(',', $key[3]));
                $actual = $actualIndexes[$key[2]] ?? [];
                $assert(($actual['columns'] ?? []) === $expectedColumns && ($actual['unique'] ?? null) === ($key[1] !== ''), 'index ' . $key[2]);
                $indexes++;
            }
            preg_match_all('/CONSTRAINT (\w+) FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/', $body, $fks, PREG_SET_ORDER);
            foreach ($fks as $fk) {
                $q = $pdo->prepare('SELECT column_name, referenced_table_name, referenced_column_name FROM information_schema.key_column_usage WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_name = ? ORDER BY ordinal_position');
                $q->execute([$table, $fk[1]]);
                $rows = $q->fetchAll();
                $assert(array_column($rows, 'column_name') === array_map('trim', explode(',', $fk[2]))
                    && array_unique(array_column($rows, 'referenced_table_name')) === [$fk[3]]
                    && array_column($rows, 'referenced_column_name') === array_map('trim', explode(',', $fk[4])), 'foreign key ' . $fk[1]);
                $foreignKeys++;
            }
            preg_match_all('/CONSTRAINT (\w+) CHECK/', $body, $constraints);
            foreach ($constraints[1] as $constraint) {
                $q = $pdo->prepare("SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_name = ? AND constraint_type = 'CHECK'");
                $q->execute([$table, $constraint]);
                $assert((int) $q->fetchColumn() === 1, 'check ' . $constraint);
                $checkConstraints++;
            }
            preg_match_all('/\b(\w+_g) DECIMAL\(10,2\)/', $body, $masses);
            foreach ($masses[1] as $column) {
                $q = $pdo->prepare('SELECT data_type, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?');
                $q->execute([$table, $column]);
                $row = $q->fetch();
                $assert($row && $row['data_type'] === 'decimal' && (int) $row['numeric_precision'] === 10 && (int) $row['numeric_scale'] === 2, 'mass ' . $table . '.' . $column);
                $massColumns++;
            }
        }
    }
    sort($expectedTables); $actualTables = array_keys($tables); sort($actualTables);
    $assert($expectedTables === $actualTables, 'exact table set');
    $assert(count($expectedTables) === 17 && $foreignKeys > 0 && $indexes > 0 && $massColumns > 0 && $checkConstraints > 0, 'metadata coverage');
    foreach (['brands'=>['active','version'], 'tare_profiles'=>['active','version'], 'spools'=>['spool_type','registration_kind','tare_default_g'], 'activity_events'=>['sequence']] as $table=>$columns) {
        foreach ($columns as $column) {
            $q=$pdo->prepare('SELECT data_type, numeric_precision, numeric_scale, extra FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?');
            $q->execute([$table,$column]);$row=$q->fetch();$assert((bool)$row,'added column '.$table.'.'.$column);
            if ($column==='tare_default_g') { $assert($row['data_type']==='decimal'&&(int)$row['numeric_precision']===10&&(int)$row['numeric_scale']===2,'physical tare decimal');$massColumns++; }
            if ($column==='sequence') { $assert(str_contains($row['extra'],'auto_increment'),'event ordering'); }
        }
    }
    foreach (['ck_brand_active','ck_profile_active','ck_registration_kind','ck_spool_default_tare'] as $name) {
        $q=$pdo->prepare("SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_name=? AND constraint_type='CHECK'");$q->execute([$name]);$assert((int)$q->fetchColumn()===1,'added constraint '.$name);$checkConstraints++;
    }
    $q=$pdo->query("SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='activity_events' AND index_name='uq_event_sequence' AND non_unique=0 AND column_name='sequence'");
    $assert((int)$q->fetchColumn()===1,'unique event sequence');$indexes++;
    $assert($pdo->query('SELECT @@session.time_zone')->fetchColumn() === '+00:00', 'UTC connection');
    $initialized = $pdo->query('SELECT initialized_at FROM installation_state WHERE id = 1')->fetchColumn();
    $assert(is_string($initialized) && $initialized !== '', 'installation closed');
    echo "PASS: $checks metadata assertions; 17 InnoDB tables, $foreignKeys foreign keys, $indexes named indexes, $checkConstraints CHECK constraints, $massColumns DECIMAL mass columns; migration checksums and UTC verified.\n";
} catch (Throwable $e) { cliFailure($e); }
