<?php
declare(strict_types=1);
// Private launcher subprocess. Stdout is captured directly into its environment,
// never served by HTTP, logged, or included in frontend source/builds.
require __DIR__ . '/common.php';
try {
    if ($argc !== 1) { exit(2); }
    $config=cliConfig();
    if (!\DLoop\LocalAccess::enabled($config)) { exit(2); }
    echo $config['local_bridge_token'];
} catch (Throwable $e) { exit(1); }
