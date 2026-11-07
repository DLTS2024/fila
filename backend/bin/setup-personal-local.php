<?php
declare(strict_types=1);
// Explicit local operator CLI only. Never handles the personal admin password.
require __DIR__ . '/common.php';
try {
    if ($argc !== 2 || !in_array($argv[1], ['--provision', '--finalize'], true)) {
        fwrite(STDERR, "Use --provision for the approved new dloop_personal database, or --finalize after private first-admin setup.\n"); exit(2);
    }
    $name = 'dloop_personal';
    $login = 'dloop_personal_runtime';
    $directory = dirname(__DIR__) . '/var/personal';
    $file = $directory . '/config.local.php';
    $pma = 'C:/xampp/phpMyAdmin/config.inc.php';
    if (!is_file($pma)) { throw new RuntimeException('Existing XAMPP operator configuration required.'); }
    ob_start(); require $pma; ob_end_clean();
    $server = null;
    foreach (($cfg['Servers'] ?? []) as $candidate) {
        if (($candidate['auth_type'] ?? '') === 'config' && isset($candidate['user']) &&
            in_array($candidate['host'] ?? '127.0.0.1', ['127.0.0.1', 'localhost'], true)) { $server = $candidate; break; }
    }
    if (!$server) { throw new RuntimeException('Local XAMPP operator access unavailable.'); }
    $pdo = new PDO('mysql:host=127.0.0.1;port=3306;charset=utf8mb4', $server['user'], $server['password'] ?? '',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    unset($cfg, $server, $candidate);
    if ($argv[1] === '--finalize') {
        $config = \DLoop\Config::load(dirname(__DIR__));
        if ($config['environment'] !== 'local' || $config['database']['name'] !== $name || $config['database']['user'] !== $login) {
            throw new RuntimeException('Personal configuration required.');
        }
        $initialized = $pdo->query("SELECT initialized_at FROM `dloop_personal`.installation_state WHERE id=1")->fetchColumn();
        $admins = (int) $pdo->query("SELECT COUNT(*) FROM `dloop_personal`.users WHERE role='admin' AND active=1")->fetchColumn();
        if (!$initialized || $admins < 1) { throw new RuntimeException('First administrator must exist before finalizing.'); }
        // These two temporary bootstrap privileges are unnecessary at runtime.
        foreach (['localhost', '127.0.0.1'] as $host) {
            $pdo->exec("REVOKE INSERT ON `dloop_personal`.`users` FROM '$login'@'$host'");
            $pdo->exec("REVOKE UPDATE ON `dloop_personal`.`installation_state` FROM '$login'@'$host'");
        }
        echo "Personal studio finalized. Temporary first-admin database privileges removed.\n";
        exit;
    }
    if (is_file($file)) { throw new RuntimeException('Refusing to overwrite personal configuration.'); }
    $q = $pdo->prepare('SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name=?'); $q->execute([$name]);
    if ((int) $q->fetchColumn() !== 0) { throw new RuntimeException('Refusing to adopt or overwrite an existing database.'); }
    $q = $pdo->prepare('SELECT COUNT(*) FROM mysql.user WHERE User=?'); $q->execute([$login]);
    if ((int) $q->fetchColumn() !== 0) { throw new RuntimeException('Refusing to alter an existing database login.'); }
    if (!is_dir($directory) || !is_dir($directory . '/sessions')) { throw new RuntimeException('Prepare private directories first.'); }
    $password = bin2hex(random_bytes(32));
    $pdo->exec("CREATE DATABASE `dloop_personal` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    // Existing migration files, unchanged, applied only to the newly created DB.
    $pdo->exec('USE `dloop_personal`');
    $pdo->exec("SET SESSION sql_mode='STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    $files = glob(dirname(__DIR__) . '/migrations/*.sql'); sort($files, SORT_STRING);
    foreach ($files as $migration) {
        foreach (explode(';', file_get_contents($migration)) as $statement) {
            if (trim($statement) !== '') { $pdo->exec($statement); }
        }
        $pdo->prepare('INSERT INTO schema_migrations(version,checksum) VALUES (?,?)')->execute([basename($migration), hash_file('sha256', $migration)]);
    }
    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    foreach (['localhost', '127.0.0.1'] as $host) {
        $account = "'$login'@'$host'";
        $pdo->exec('CREATE USER ' . $account . ' IDENTIFIED BY ' . $pdo->quote($password));
        $pdo->exec("GRANT SELECT ON `dloop_personal`.* TO $account");
        foreach ($tables as $table) {
            if (in_array($table, ['users', 'installation_state', 'schema_migrations'], true)) { continue; }
            if (!preg_match('/^[a-z_]+$/D', $table)) { throw new RuntimeException('Unexpected table identifier.'); }
            $pdo->exec("GRANT INSERT, UPDATE, DELETE ON `dloop_personal`.`$table` TO $account");
        }
        $pdo->exec("GRANT UPDATE (password_hash, updated_at) ON `dloop_personal`.`users` TO $account");
        $pdo->exec("GRANT INSERT ON `dloop_personal`.`users` TO $account");
        $pdo->exec("GRANT UPDATE ON `dloop_personal`.`installation_state` TO $account");
    }
    $config = ['environment' => 'local', 'allowed_origins' => ['http://localhost:5173', 'http://127.0.0.1:5173'],
        'app_key' => bin2hex(random_bytes(32)), 'session_dir' => realpath($directory . '/sessions'),
        'session_idle_seconds' => 1800, 'session_absolute_seconds' => 28800,
        'database' => ['host' => '127.0.0.1', 'port' => 3306, 'name' => $name, 'user' => $login, 'password' => $password]];
    $handle = fopen($file, 'x');
    if (!$handle) { throw new RuntimeException('Private configuration could not be created.'); }
    try { if (fwrite($handle, "<?php\nreturn " . var_export($config, true) . ";\n") === false) { throw new RuntimeException('Configuration write failed.'); } }
    finally { fclose($handle); }
    unset($password, $config);
    echo "Created dloop_personal with checked-in schema and isolated database login. No administrator created yet.\n";
} catch (Throwable $e) {
    // DDL implicitly commits: retain partial state for inspection, never delete
    // another schema or blindly retry. Never print credential-bearing errors.
    fwrite(STDERR, 'Personal setup stopped (' . get_class($e) . "). No destructive cleanup attempted. Inspect partial state before retrying.\n");
    exit(1);
}
