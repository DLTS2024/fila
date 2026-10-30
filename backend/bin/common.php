<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('display_errors', '0');
date_default_timezone_set('UTC');
require_once dirname(__DIR__) . '/src/bootstrap.php';

function cliConfig(): array
{
    return \DLoop\Config::load(dirname(__DIR__));
}

function cliFailure(Throwable $e): never
{
    // Exceptions can include SQL connection details; do not print their messages.
    fwrite(STDERR, 'Operation failed (' . get_class($e) . '). Check private configuration, privileges and schema. No automatic rollback or reset was attempted.' . PHP_EOL);
    exit(1);
}
