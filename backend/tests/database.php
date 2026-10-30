<?php
declare(strict_types=1);

// Explicit opt-in: creates tables/fixtures in an EMPTY, pre-created local test DB.
// Does not create/drop databases, delete records, or touch D1.
require dirname(__DIR__) . '/bin/common.php';
try {
    $config = cliConfig();
    if (($argv[1] ?? '') !== '--initialize-disposable' || $config['environment'] !== 'local'
        || !str_starts_with($config['database']['name'], 'dloop_test_')
        || !in_array($config['database']['host'], ['localhost', '127.0.0.1', '::1'], true)) {
        throw new RuntimeException('Disposable local test database required.');
    }
    $pdo = \DLoop\Database::connect($config);
    if ((int) $pdo->query('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()')->fetchColumn() !== 0) {
        throw new RuntimeException('Test database must be empty; nothing was reset.');
    }
    $argv = ['migrate.php', '--apply'];
    require dirname(__DIR__) . '/bin/migrate.php';
    $count = (int) $pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND engine = 'InnoDB'")->fetchColumn();
    if ($count !== 16) { throw new RuntimeException('Expected 16 InnoDB tables.'); }
    if ((int) $pdo->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn() !== 3) { throw new RuntimeException('Migration ledger mismatch.'); }

    function setupAdmin(): int {
        $pipes = [];
        $process = proc_open([PHP_BINARY, dirname(__DIR__) . '/bin/create-admin.php'], [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes);
        if (!is_resource($process)) { throw new RuntimeException('Cannot run setup subprocess.'); }
        fwrite($pipes[0], json_encode(['email' => 'phase3-test@example.invalid', 'password' => 'Fixture-only-password-123!'], JSON_THROW_ON_ERROR));
        fclose($pipes[0]);
        stream_get_contents($pipes[1]); stream_get_contents($pipes[2]);
        fclose($pipes[1]); fclose($pipes[2]);
        return proc_close($process);
    }
    if (setupAdmin() !== 0 || setupAdmin() === 0) { throw new RuntimeException('First-admin one-time guard failed.'); }
    // Independent account for a second run through Vite, without clearing throttle evidence.
    $pdo->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')->execute([
        'phase35-proxy@example.invalid', password_hash('Fixture-only-password-123!', PASSWORD_BCRYPT, ['cost' => 12]),
    ]);
    $pdo->exec("INSERT INTO brands (name) VALUES ('Fixture Brand')");
    $brand = (int) $pdo->lastInsertId();
    $pdo->prepare("INSERT INTO tare_profiles (brand_id, spool_type, nominal_capacity_g, empty_mass_g) VALUES (?, 'plastic', 1000, 220)")->execute([$brand]);
    $profile = (int) $pdo->lastInsertId();
    $spool = '00000000-0000-4000-8000-000000000001';
    $pdo->prepare("INSERT INTO spools (id, code, name, brand_id, tare_profile_id, material, color_name, color_hex, nominal_capacity_g, initial_filament_g, remaining_g) VALUES (?, 'PLA_BLACK_01', 'Fixture Black', ?, ?, 'PLA', 'BLACK', '#222222', 1000, 1000, 680)")->execute([$spool, $brand, $profile]);
    $checks = 0;
    $reject = static function (string $sql, array $values = []) use ($pdo, &$checks): void {
        try { $pdo->prepare($sql)->execute($values); }
        catch (PDOException $e) {
            // Do not count a syntax/connection failure as a constraint test pass.
            if (!in_array((int) ($e->errorInfo[1] ?? 0), [1062, 1452, 3819, 4025], true)) { throw $e; }
            $checks++; return;
        }
        throw new RuntimeException('Database accepted an invalid fixture.');
    };
    $reject("INSERT INTO brands (name) VALUES ('Fixture Brand')");
    $reject('UPDATE spools SET remaining_g = -1 WHERE id = ?', [$spool]);
    $reject('UPDATE spools SET remaining_g = 1001 WHERE id = ?', [$spool]);
    $reject('UPDATE spools SET brand_id = 999999999 WHERE id = ?', [$spool]);
    $reject("INSERT INTO spools (id, code, name, brand_id, material, color_name, color_hex, nominal_capacity_g, initial_filament_g, remaining_g) VALUES ('00000000-0000-4000-8000-000000000002', 'PLA_BLACK_01', 'Duplicate code', ?, 'PLA', 'BLACK', '#222222', 1000, 1000, 500)", [$brand]);
    $reject("INSERT INTO measurements (id, spool_id, gross_g, effective_tare_g, net_g, source, stable, received_at, confirmed_by) VALUES ('00000000-0000-4000-8000-000000000003', ?, 100, 220, -120, 'usb', 1, UTC_TIMESTAMP(6), 1)", [$spool]);
    $reject("INSERT INTO nfc_tags (uid, spool_id) VALUES ('lowercase', ?)", [$spool]);
    $pdo->prepare("INSERT INTO nfc_tags (uid, spool_id) VALUES ('04A1B2C3D4E5F6', ?)")->execute([$spool]);
    $reject("INSERT INTO nfc_tags (uid, spool_id) VALUES ('04A1B2C3D4E5F6', ?)", [$spool]);
    $pdo->exec("INSERT INTO printers (name) VALUES ('Fixture printer')");
    $printer = (int) $pdo->lastInsertId();
    $pdo->prepare('INSERT INTO printer_slots (printer_id, slot_number, spool_id) VALUES (?, 1, ?)')->execute([$printer, $spool]);
    $reject('INSERT INTO printer_slots (printer_id, slot_number, spool_id) VALUES (?, 2, ?)', [$printer, $spool]);
    echo "PASS: migration ledger, 16 InnoDB tables, one-time admin setup, $checks unique/FK/CHECK constraints. Fixtures retained in disposable DB.\n";
} catch (Throwable $e) { cliFailure($e); }
