<?php
declare(strict_types=1);

// This is the only PHP file intended for the public web root.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
date_default_timezone_set('UTC');
header_remove('X-Powered-By');
$requestId = bin2hex(random_bytes(12));
header('X-Request-ID: ' . $requestId);
try {
    $appRoot = getenv('DLOOP_APP_DIR') ?: dirname(__DIR__, 3);
    require $appRoot . '/src/bootstrap.php';
    set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
        if (!(error_reporting() & $severity)) { return false; }
        throw new ErrorException($message, 0, $severity, $file, $line);
    });
    $config = \DLoop\Config::load($appRoot);
    (new \DLoop\Api($config))->dispatch();
} catch (\DLoop\HttpError $e) {
    \DLoop\Http::json($e->status, ['error' => $e->getMessage(), 'code' => $e->errorCode, 'requestId' => $requestId]);
} catch (Throwable $e) {
    restore_error_handler();
    // No exception text, SQL, credentials or request body is logged or exposed.
    error_log('DLoop request=' . $requestId . ' exception=' . get_class($e));
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode(['error' => 'Service temporarily unavailable.', 'code' => 'service_unavailable', 'requestId' => $requestId]);
}
