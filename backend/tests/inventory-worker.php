<?php
declare(strict_types=1);
require dirname(__DIR__) . '/bin/common.php';
try {
    $config = cliConfig();
    if ($config['environment'] !== 'local' || !str_starts_with($config['database']['name'], 'dloop_test_p4_')
        || !in_array($config['database']['host'], ['127.0.0.1','localhost'], true)) { throw new RuntimeException('Phase 4 disposable DB required.'); }
    $pdo = \DLoop\Database::connect($config);
    $actor = $pdo->query("SELECT id FROM users WHERE email = 'phase3-test@example.invalid' AND active = 1")->fetchColumn();
    if (!$actor) { throw new RuntimeException('Fixture actor missing.'); }
    $inventory = new \DLoop\Inventory($pdo, (string) $actor);
    $input = json_decode(stream_get_contents(STDIN, 65536), true, 64, JSON_THROW_ON_ERROR);
    if (($input['kind'] ?? '') === 'snapshot') { echo json_encode(['status'=>200,'result'=>$inventory->snapshot()], JSON_THROW_ON_ERROR); exit; }
    $key = $input['key'] ?? bin2hex(random_bytes(16));
    for ($attempt = 0; $attempt < 30; $attempt++) {
        $revision = $input['revision'] ?? $inventory->snapshot()['revision'];
        try {
            $result = $inventory->mutate(['revision'=>$revision,'action'=>$input['action']], $key);
            echo json_encode(['status'=>200,'result'=>$result], JSON_THROW_ON_ERROR); exit;
        } catch (\DLoop\HttpError $e) {
            if (($input['retry'] ?? false) && $e->status === 409 && $e->errorCode === 'revision_conflict') { usleep(10000); continue; }
            echo json_encode(['status'=>$e->status,'code'=>$e->errorCode], JSON_THROW_ON_ERROR); exit;
        }
    }
    throw new RuntimeException('Concurrency retry budget exhausted.');
} catch (Throwable $e) { cliFailure($e); }
