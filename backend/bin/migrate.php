<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
try {
    $apply = ($argv[1] ?? '') === '--apply';
    if (count($argv) > 2 || (isset($argv[1]) && !in_array($argv[1], ['--apply', '--status'], true))) {
        fwrite(STDERR, "Usage: php backend/bin/migrate.php [--status|--apply]\n"); exit(2);
    }
    $pdo = \DLoop\Database::connect(cliConfig());
    $lockName = 'dloop:migrate:' . substr(hash('sha256', cliConfig()['database']['name']), 0, 32);
    $lock = $pdo->prepare('SELECT GET_LOCK(?, 10)');
    $lock->execute([$lockName]);
    if ((int) $lock->fetchColumn() !== 1) { throw new RuntimeException('Migration lock unavailable.'); }
    try {
        $files = glob(dirname(__DIR__) . '/migrations/*.sql');
        sort($files, SORT_STRING);
        $q = $pdo->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?');
        $q->execute(['schema_migrations']);
        $exists = (int) $q->fetchColumn() === 1;
        if (!$exists && !$apply) {
            echo "Migration ledger absent; pending: " . implode(', ', array_map('basename', $files)) . PHP_EOL;
            exit(0);
        }
        if (!$exists) {
            // Refuse accidental adoption of an existing application database.
            $tables = (int) $pdo->query('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()')->fetchColumn();
            if ($tables !== 0) { throw new RuntimeException('The target database is not empty.'); }
            $pdo->exec(file_get_contents($files[0]));
        }
        $applied = $pdo->query('SELECT version, checksum FROM schema_migrations')->fetchAll(PDO::FETCH_KEY_PAIR);
        if (array_diff(array_keys($applied), array_map('basename', $files))) {
            throw new RuntimeException('Database has migrations unknown to this application version.');
        }
        foreach ($files as $file) {
            $version = basename($file);
            $checksum = hash_file('sha256', $file);
            if (isset($applied[$version])) {
                if (!hash_equals($applied[$version], $checksum)) { throw new RuntimeException('Migration checksum mismatch.'); }
                echo "Applied: $version\n";
                continue;
            }
            if (!$apply) { echo "Pending: $version\n"; continue; }
            // MySQL DDL implicitly commits. A partial failure requires manual inspection,
            // never an automatic DROP, reset, or blind IF NOT EXISTS recovery.
            if ($version !== '0000_schema_migrations.sql') {
                foreach (explode(';', file_get_contents($file)) as $statement) {
                    if (trim($statement) !== '') { $pdo->exec($statement); }
                }
            }
            $pdo->prepare('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)')->execute([$version, $checksum]);
            echo "Applied: $version\n";
        }
    } finally {
        $pdo->prepare('SELECT RELEASE_LOCK(?)')->execute([$lockName]);
    }
} catch (Throwable $e) { cliFailure($e); }
