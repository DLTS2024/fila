<?php
declare(strict_types=1);

require __DIR__ . '/common.php';
try {
    if (count($argv) !== 1) {
        fwrite(STDERR, "Supply a JSON object with email and password through standard input; never use password arguments.\n"); exit(2);
    }
    $input = stream_get_contents(STDIN, 4097);
    if (strlen($input) > 4096) { throw new RuntimeException('Input too large.'); }
    $data = json_decode($input, true, 8, JSON_THROW_ON_ERROR);
    if (!is_array($data)) { throw new RuntimeException('JSON input required.'); }
    \DLoop\Validation::keys($data, ['email', 'password']);
    $email = \DLoop\Validation::email($data['email'] ?? null);
    $password = \DLoop\Validation::password($data['password'] ?? null, true);
    $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    unset($password, $data, $input);
    $pdo = \DLoop\Database::connect(cliConfig());
    $pdo->beginTransaction();
    try {
        $row = $pdo->query('SELECT initialized_at FROM installation_state WHERE id = 1 FOR UPDATE')->fetch();
        if (!$row || $row['initialized_at'] !== null || (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() !== 0) {
            fwrite(STDERR, "Initialization is already complete or users exist. First-admin setup is closed.\n");
            $pdo->rollBack(); exit(1);
        }
        $pdo->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')->execute([$email, $hash]);
        $pdo->exec('UPDATE installation_state SET initialized_at = UTC_TIMESTAMP(6) WHERE id = 1');
        $pdo->commit();
        echo "First administrator created. CLI initialization is now permanently closed.\n";
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
} catch (Throwable $e) { cliFailure($e); }
