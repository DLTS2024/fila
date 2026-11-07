<?php
declare(strict_types=1);

require __DIR__ . '/common.php';
try {
    $inspect = $argc === 2 && $argv[1] === '--inspect';
    if (!$inspect && $argc !== 1) {
        fwrite(STDERR, "Use --inspect or supply reset JSON through stdin. Password arguments are forbidden.\n");
        exit(2);
    }
    $input = stream_get_contents(STDIN, 4097);
    if (strlen($input) > 4096) { throw new RuntimeException('Input too large.'); }
    $data = json_decode($input, true, 8, JSON_THROW_ON_ERROR);
    if (!is_array($data)) { throw new RuntimeException('JSON input required.'); }
    \DLoop\Validation::keys($data, $inspect ? ['email'] : ['email', 'password', 'target']);
    $email = \DLoop\Validation::email($data['email'] ?? null);
    $config = cliConfig();
    if ($config['environment'] !== 'local') { throw new RuntimeException('Local environment required.'); }
    $target = hash('sha256', json_encode([
        $config['database']['host'], $config['database']['port'], $config['database']['name'],
    ], JSON_THROW_ON_ERROR));
    $pdo = \DLoop\Database::connect($config);
    if ($inspect) {
        $q = $pdo->prepare("SELECT id, email FROM users WHERE email = ? AND role = 'admin' AND active = 1");
        $q->execute([$email]);
        $user = $q->fetch();
        if (!$user) { fwrite(STDERR, "No matching active administrator. Nothing changed.\n"); exit(1); }
        echo json_encode(['id' => (string) $user['id'], 'email' => $user['email'],
            'host' => $config['database']['host'], 'port' => $config['database']['port'],
            'database' => $config['database']['name'], 'target' => $target], JSON_THROW_ON_ERROR), "\n";
        exit;
    }
    if (!is_string($data['target'] ?? null) || !hash_equals($target, $data['target'])) {
        throw new RuntimeException('Inspected target changed.');
    }
    $password = \DLoop\Validation::password($data['password'] ?? null, true);
    $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    unset($input, $data);
    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare("SELECT id FROM users WHERE email = ? AND role = 'admin' AND active = 1 FOR UPDATE");
        $q->execute([$email]);
        $user = $q->fetch();
        if (!$user) { throw new RuntimeException('Existing active administrator required.'); }
        $q = $pdo->prepare("UPDATE users SET password_hash = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ? AND role = 'admin' AND active = 1");
        $q->execute([$hash, $user['id']]);
        if ($q->rowCount() !== 1) { throw new RuntimeException('Exactly one existing administrator must change.'); }
        $q = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
        $q->execute([$user['id']]);
        if (!password_verify($password, (string) $q->fetchColumn())) { throw new RuntimeException('Password update verification failed.'); }
        $pdo->commit();
        unset($password, $hash);
        echo "Existing administrator password reset and verified. No users or inventory records were created or removed.\n";
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
} catch (Throwable $e) {
    // Never print SQL errors, supplied input, password values or stored hashes.
    fwrite(STDERR, "Password reset failed safely (" . get_class($e) . "). Check the selected local configuration and active administrator email.\n");
    exit(1);
}
